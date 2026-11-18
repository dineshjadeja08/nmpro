#!/usr/bin/env bash
set -euo pipefail

# Deploys the Django API to Cloud Run, plus the migration job that uses the same image.
# Database: Neon (or any Postgres over TLS). Redis: private Memorystore or TLS Redis. Files: Cloudinary.
# Optional: CLOUDSQL_INSTANCE, VPC_CONNECTOR, or VPC_NETWORK and VPC_SUBNET.
#
#   NAMMAPROS_DEPLOY_APPROVED=yes PROJECT_ID=... REGION=asia-south1 ENV_NAME=production \
#   IMAGE_REPOSITORY=nammapros IMAGE_TAG=$(git rev-parse --short HEAD) \
#   SERVICE_ACCOUNT=nammapros-api@PROJECT_ID.iam.gserviceaccount.com \
#   ENV_FILE=infrastructure/deployment/cloud-run-env.yaml \
#   bash infrastructure/deployment/deploy-cloud-run.sh
#
# Then run migrations:  NAMMAPROS_MIGRATION_APPROVED=yes ... bash infrastructure/deployment/run-migration.sh
if [[ "${NAMMAPROS_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Set NAMMAPROS_DEPLOY_APPROVED=yes only after reviewing the target and image." >&2
  exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?} ${IMAGE_REPOSITORY:?} ${IMAGE_TAG:?} ${SERVICE_ACCOUNT:?} ${ENV_FILE:?}"
if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "ENV_NAME must be staging or production" >&2; exit 2
fi
if grep -Eq 'example\.invalid|REPLACE_|SET_IN_SECRET_MANAGER' "$ENV_FILE"; then
  echo "Replace all example values in $ENV_FILE before deployment" >&2; exit 2
fi

# Secret Manager secrets, named nammapros-<env>-<name>. Override SECRETS to change the list.
P="nammapros-$ENV_NAME"
SECRETS="${SECRETS:-DJANGO_SECRET_KEY=$P-django-secret:latest,JWT_SIGNING_KEY=$P-jwt-signing-key:latest,DATABASE_URL=$P-database-url:latest,DATABASE_URL_UNPOOLED=$P-database-url-unpooled:latest,REDIS_URL=$P-redis-url:latest,CLOUDINARY_API_KEY=$P-cloudinary-api-key:latest,CLOUDINARY_API_SECRET=$P-cloudinary-api-secret:latest}"

NETWORK_FLAGS=()
[[ -n "${CLOUDSQL_INSTANCE:-}" ]] && NETWORK_FLAGS+=(--add-cloudsql-instances="$CLOUDSQL_INSTANCE")
[[ -n "${VPC_CONNECTOR:-}" ]] && NETWORK_FLAGS+=(--vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only)
if [[ -n "${VPC_NETWORK:-}" && -n "${VPC_SUBNET:-}" ]]; then
  NETWORK_FLAGS+=(--network="$VPC_NETWORK" --subnet="$VPC_SUBNET" --vpc-egress=private-ranges-only)
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_REPOSITORY}/nammapros-api:${IMAGE_TAG}"
gcloud builds submit . --project="$PROJECT_ID" --config=infrastructure/deployment/cloudbuild.yaml --substitutions="_IMAGE=$IMAGE"

# Migration job first, so the new schema can be applied before the new code takes traffic.
gcloud run jobs deploy "nammapros-migrate-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --service-account="$SERVICE_ACCOUNT" \
  --env-vars-file="$ENV_FILE" --set-secrets="$SECRETS" "${NETWORK_FLAGS[@]}" \
  --command=python --args=manage.py,migrate,--noinput --max-retries=0 --task-timeout=600s

gcloud run deploy "nammapros-api-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --platform=managed --service-account="$SERVICE_ACCOUNT" \
  --env-vars-file="$ENV_FILE" --set-secrets="$SECRETS" "${NETWORK_FLAGS[@]}" \
  --cpu=1 --memory=1Gi --concurrency=20 --min-instances=0 --max-instances=3 \
  --timeout=60 --port=8080 --allow-unauthenticated \
  --startup-probe="tcpSocket.port=8080,initialDelaySeconds=10,periodSeconds=10,failureThreshold=12"
echo "API deployed. Run the migration job (run-migration.sh), then check <service-url>/api/v1/health/."
