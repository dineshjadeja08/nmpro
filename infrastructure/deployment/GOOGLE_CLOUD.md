# Deploying NammaPros on Google Cloud

## Current backend deployment (18 November 2026)

The Django API is deployed as `nammapros-api-production` in project `nammapro-api`, region
`asia-southeast1`. Its public URL is
`https://nammapros-api-production-177323361322.asia-southeast1.run.app`.
The image is in the `nammapros` Artifact Registry repository. The production database is the
NammaPros Neon project `dry-meadow-77179021` (database `neondb`, Singapore). Existing migrations
were already applied. Redis is the private, authenticated Memorystore instance `nammapros-cache`;
Cloud Run reaches it through Direct VPC egress on the default network. Cloudinary handles media.
Secret Manager holds the database, Redis, Cloudinary and newly generated Django/JWT credentials.

The service allows the three existing Netlify/Vercel site origins. Phone OTP is temporarily disabled
(`PHONE_AUTH_DISABLED=true`) until MSG91 is configured; staff password login remains available.
No websites, domain mapping, migration job or periodic job were deployed in this step.

The organization policy restricts `allUsers` IAM bindings, so the service has the Cloud Run invoker
IAM check disabled while application authentication remains active. Health and database readiness
both return HTTP 200. See the ignored `cloud-run-env.yaml` for the current nonsecret environment.

Pushes to GitHub `dineshjadeja08/nmpro` branch `main` run
`.github/workflows/deploy-api-cloud-run.yml`. GitHub Actions uses Workload Identity Federation to
build the API image, push it to Artifact Registry, update this existing Cloud Run service, and check
health and database readiness. The workflow keeps the existing environment, secrets and VPC settings.
It does not run database migrations; review and run new production migrations before merging code
that requires them. The existing `phase7-config.yml` continues to run configuration checks.

## Future deployment reference

The Django API runs on Cloud Run. The customer, admin, operations and partner sites can be deployed
later. The database stays on Neon and files are in Cloudinary.

| Piece | Cloud Run service | Built from |
|---|---|---|
| API | `nammapros-api-production` | `infrastructure/docker/api.Dockerfile` |
| Database migrations | job `nammapros-migrate-production` | same image as the API |
| Customer site | `nammapros-web-production` | `infrastructure/docker/site.Dockerfile` (APP=web) |
| Admin | `nammapros-admin-production` | site.Dockerfile (APP=admin) |
| Operations | `nammapros-operations-production` | site.Dockerfile (APP=operations) |
| Partner site | `nammapros-technician-production` | site.Dockerfile (APP=technician) |

Run the commands in **Cloud Shell** (it has `gcloud` and this repo can be cloned there) or on a computer with
the Google Cloud CLI. Region: `asia-southeast1` (Singapore) keeps the API next to the Neon database; use
`asia-south1` (Mumbai) if you move the database to India.

## 1. One-time setup

```bash
export PROJECT_ID=your-project-id REGION=asia-southeast1 ENV_NAME=production
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create nammapros --repository-format=docker --location=$REGION
gcloud iam service-accounts create nammapros-api --display-name="NammaPros API"
export SERVICE_ACCOUNT=nammapros-api@$PROJECT_ID.iam.gserviceaccount.com
```

For another environment, provision a private authenticated Memorystore Redis instance and configure
Direct VPC egress, or use a managed Redis service with a `rediss://` connection URL.

## 2. Secrets (Secret Manager)

Each command asks you to paste the value; nothing is written to the shell history.

```bash
for name in django-secret jwt-signing-key database-url database-url-unpooled redis-url cloudinary-api-key cloudinary-api-secret firebase-web-api-key; do
  echo "Paste nammapros-$ENV_NAME-$name, then press Enter and Ctrl-D:"
  gcloud secrets create nammapros-$ENV_NAME-$name --data-file=- --replication-policy=automatic
done
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SERVICE_ACCOUNT --role=roles/secretmanager.secretAccessor
```

| Secret | Value |
|---|---|
| django-secret, jwt-signing-key | two **different** random strings, 50+ characters (`python -c "import secrets;print(secrets.token_urlsafe(64))"`) |
| database-url | Neon **pooled** connection string (host contains `-pooler`) |
| database-url-unpooled | Neon **direct** connection string (same host without `-pooler`) |
| redis-url | Private Memorystore AUTH URL with `REDIS_PRIVATE_VPC=true`, or a `rediss://` URL |
| cloudinary-api-key, cloudinary-api-secret | Cloudinary → Settings → API Keys |
| firebase-web-api-key | Firebase web app API key used by the API to verify Phone Auth ID tokens |

Use new Django and JWT keys. Coordinate a Neon password rotation with any other service sharing the database.

## 3. Deploy the API

```bash
cp infrastructure/deployment/cloud-run-env.yaml.example infrastructure/deployment/cloud-run-env.yaml
# Edit cloud-run-env.yaml. For the first deploy you can put temporary values for the REPLACE_ hosts/sites.
NAMMAPROS_DEPLOY_APPROVED=yes IMAGE_REPOSITORY=nammapros IMAGE_TAG=$(git rev-parse --short HEAD) \
  ENV_FILE=infrastructure/deployment/cloud-run-env.yaml bash infrastructure/deployment/deploy-cloud-run.sh
NAMMAPROS_MIGRATION_APPROVED=yes bash infrastructure/deployment/run-migration.sh
gcloud run services describe nammapros-api-$ENV_NAME --region=$REGION --format='value(status.url)'
```

Note the API host (without `https://`); step 5 puts it in `DJANGO_ALLOWED_HOSTS`.

## 4. Deploy the websites

Use the API URL from step 3. Build each site (the public values are baked into the site at build time):

```bash
export API=https://nammapros-api-production-xxxxx.a.run.app
COMMON="NAMMAPROS_DEPLOY_APPROVED=yes IMAGE_REPOSITORY=nammapros IMAGE_TAG=$(git rev-parse --short HEAD)"
env $COMMON APP=web API_BASE_URL=$API SITE_URL=https://<customer-site-url> bash infrastructure/deployment/deploy-site.sh
env $COMMON APP=admin API_BASE_URL=$API bash infrastructure/deployment/deploy-site.sh
env $COMMON APP=operations API_BASE_URL=$API bash infrastructure/deployment/deploy-site.sh
env $COMMON APP=technician API_BASE_URL=$API bash infrastructure/deployment/deploy-site.sh
```

For the customer site, `SITE_URL` is its own address (used for SEO links). Deploy it once to learn the URL,
then deploy again with `SITE_URL` set. Add `FIREBASE_*` and `GOOGLE_MAPS_API_KEY` when you have them.

## 5. Connect the sites to the API

List the site URLs (`gcloud run services list --region=$REGION`) and allow them on the API:

```bash
SITES=https://<web>,https://<admin>,https://<operations>,https://<technician>
gcloud run services update nammapros-api-$ENV_NAME --region=$REGION \
  --update-env-vars="^@^CORS_ALLOWED_ORIGINS=$SITES@DJANGO_CSRF_TRUSTED_ORIGINS=$SITES@DJANGO_ALLOWED_HOSTS=<api-host>"
```

Also copy these values into `cloud-run-env.yaml`, so the next API deploy keeps them.

## 6. Create the first admin

```bash
echo "Paste the admin password (12+ characters), then Enter and Ctrl-D:"
gcloud secrets create nammapros-$ENV_NAME-bootstrap-admin-password --data-file=-
gcloud run services update nammapros-api-$ENV_NAME --region=$REGION \
  --update-env-vars=BOOTSTRAP_ADMIN_PHONE=+919XXXXXXXXX,BOOTSTRAP_ADMIN_NAME=YourName \
  --update-secrets=BOOTSTRAP_ADMIN_PASSWORD=nammapros-$ENV_NAME-bootstrap-admin-password:latest
```

The API creates the Super Admin as it restarts. Sign in on the admin site, then remove the variables:

```bash
gcloud run services update nammapros-api-$ENV_NAME --region=$REGION \
  --remove-env-vars=BOOTSTRAP_ADMIN_PHONE,BOOTSTRAP_ADMIN_NAME --remove-secrets=BOOTSTRAP_ADMIN_PASSWORD
```

## 7. Check

- `<api-url>/api/v1/health/` returns `{"status":"ok"}`.
- The customer site shows services (if not, the API URL or `API_BASE_URL` is wrong).
- Admin sign-in works; an image uploaded in admin appears in Cloudinary under `nammapros/catalog/`.

## Later

- **Your own domain** (e.g. `nammapros.in`, `admin.nammapros.in`, `api.nammapros.in`) with Cloud Run domain
  mapping or a load balancer. Then set `DJANGO_CROSS_SITE_COOKIES=false`: same-site cookies work on iPhones.
- **Celery worker** for background jobs (the job broadcast already works without it).
- Delete the Render, Netlify and Vercel services once Google Cloud is live, so there is one source of truth.
