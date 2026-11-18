#!/usr/bin/env bash
set -euo pipefail
if [[ "${NAMMAPROS_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Deployment approval is required." >&2; exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?} ${IMAGE:?} ${SERVICE_ACCOUNT:?} ${ENV_FILE:?} ${SCHEDULER_SERVICE_ACCOUNT:?}"
if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "ENV_NAME must be staging or production" >&2; exit 2
fi
if grep -Eq 'example\.invalid|REPLACE_|SET_IN_SECRET_MANAGER' "$ENV_FILE"; then
  echo "Replace all example values in $ENV_FILE before deployment" >&2; exit 2
fi
P="nammapros-$ENV_NAME"
SECRETS="${SECRETS:-DJANGO_SECRET_KEY=$P-django-secret:latest,JWT_SIGNING_KEY=$P-jwt-signing-key:latest,DATABASE_URL=$P-database-url:latest,DATABASE_URL_UNPOOLED=$P-database-url-unpooled:latest,REDIS_URL=$P-redis-url:latest,CLOUDINARY_API_KEY=$P-cloudinary-api-key:latest,CLOUDINARY_API_SECRET=$P-cloudinary-api-secret:latest}"
NETWORK_FLAGS=()
[[ -n "${CLOUDSQL_INSTANCE:-}" ]] && NETWORK_FLAGS+=(--add-cloudsql-instances="$CLOUDSQL_INSTANCE")
[[ -n "${VPC_CONNECTOR:-}" ]] && NETWORK_FLAGS+=(--vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only)
if [[ -n "${VPC_NETWORK:-}" && -n "${VPC_SUBNET:-}" ]]; then
  NETWORK_FLAGS+=(--network="$VPC_NETWORK" --subnet="$VPC_SUBNET" --vpc-egress=private-ranges-only)
fi
gcloud run jobs deploy "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --service-account="$SERVICE_ACCOUNT" --env-vars-file="$ENV_FILE" \
  --set-secrets="$SECRETS" "${NETWORK_FLAGS[@]}" \
  --command=python --args=manage.py,run_periodic_jobs --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=900s
JOB_URL="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/nammapros-periodic-$ENV_NAME:run"
SCHEDULER_VERB=create
if gcloud scheduler jobs describe "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  SCHEDULER_VERB=update
fi
gcloud scheduler jobs "$SCHEDULER_VERB" http "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --location="$REGION" \
  --schedule="* * * * *" --time-zone="Etc/UTC" --uri="$JOB_URL" --http-method=POST \
  --oauth-service-account-email="$SCHEDULER_SERVICE_ACCOUNT" --max-retry-attempts=0
