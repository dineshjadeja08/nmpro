#!/usr/bin/env bash
set -euo pipefail

# Builds and deploys one website to Cloud Run as nammapros-<app>-<env>.
#
#   NAMMAPROS_DEPLOY_APPROVED=yes PROJECT_ID=... REGION=asia-south1 ENV_NAME=production \
#   IMAGE_REPOSITORY=nammapros IMAGE_TAG=$(git rev-parse --short HEAD) \
#   APP=web API_BASE_URL=https://<api-url> SITE_URL=https://<web-url> \
#   bash infrastructure/deployment/deploy-site.sh
#
# APP: web (customer site) | admin | operations | technician (partner site).
# Optional public values: PARTNER_APP_URL, FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
# GOOGLE_MAPS_API_KEY. They are baked into the site's browser code, so never put secrets in them.
if [[ "${NAMMAPROS_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Set NAMMAPROS_DEPLOY_APPROVED=yes only after reviewing the target." >&2
  exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?} ${IMAGE_REPOSITORY:?} ${IMAGE_TAG:?} ${APP:?} ${API_BASE_URL:?}"
case "$APP" in web|admin|operations|technician) ;; *) echo "APP must be web, admin, operations or technician" >&2; exit 2 ;; esac
if [[ "$API_BASE_URL" != https://* ]]; then echo "API_BASE_URL must start with https://" >&2; exit 2; fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_REPOSITORY}/nammapros-${APP}:${IMAGE_TAG}"
SUBS="_APP=${APP},_IMAGE=${IMAGE},_API_BASE_URL=${API_BASE_URL},_SITE_URL=${SITE_URL:-},_PARTNER_APP_URL=${PARTNER_APP_URL:-}"
SUBS+=",_FIREBASE_API_KEY=${FIREBASE_API_KEY:-},_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN:-}"
SUBS+=",_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-},_GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY:-}"
gcloud builds submit . --project="$PROJECT_ID" --config=infrastructure/deployment/cloudbuild-site.yaml --substitutions="$SUBS"

# The customer site also fetches the catalogue on its server, which reads API_BASE_URL at run time.
gcloud run deploy "nammapros-${APP}-${ENV_NAME}" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --platform=managed --allow-unauthenticated --port=8080 \
  --set-env-vars="API_BASE_URL=${API_BASE_URL}" \
  --cpu=1 --memory=512Mi --concurrency=80 --min-instances=0 --max-instances=3 --timeout=60
echo "Deployed nammapros-${APP}-${ENV_NAME}. Add its URL to the API's CORS_ALLOWED_ORIGINS and DJANGO_CSRF_TRUSTED_ORIGINS."
