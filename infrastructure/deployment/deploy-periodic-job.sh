#!/usr/bin/env bash
set -euo pipefail
if [[ "${NAMMAPROS_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Deployment approval is required." >&2; exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?} ${IMAGE:?} ${SERVICE_ACCOUNT:?} ${CLOUDSQL_INSTANCE:?} ${VPC_CONNECTOR:?} ${ENV_FILE:?} ${SCHEDULER_SERVICE_ACCOUNT:?}"
gcloud run jobs deploy "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --service-account="$SERVICE_ACCOUNT" --env-vars-file="$ENV_FILE" \
  --set-secrets="DJANGO_SECRET_KEY=nammapros-$ENV_NAME-django-secret:latest,DATABASE_URL=nammapros-$ENV_NAME-database-url:latest,REDIS_URL=nammapros-$ENV_NAME-redis-url:latest,MSG91_AUTH_KEY=nammapros-$ENV_NAME-msg91-key:latest" \
  --set-cloudsql-instances="$CLOUDSQL_INSTANCE" --vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only \
  --command=python --args=manage.py,run_periodic_jobs --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=900s
gcloud run jobs deploy "nammapros-migrate-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --service-account="$SERVICE_ACCOUNT" --env-vars-file="$ENV_FILE" \
  --set-secrets="DJANGO_SECRET_KEY=nammapros-$ENV_NAME-django-secret:latest,DATABASE_URL=nammapros-$ENV_NAME-database-url:latest,REDIS_URL=nammapros-$ENV_NAME-redis-url:latest,MSG91_AUTH_KEY=nammapros-$ENV_NAME-msg91-key:latest" \
  --set-cloudsql-instances="$CLOUDSQL_INSTANCE" --vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only \
  --command=python --args=manage.py,migrate,--noinput --cpu=1 --memory=1Gi --max-retries=0 --task-timeout=900s
JOB_URL="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/nammapros-periodic-$ENV_NAME:run"
SCHEDULER_VERB=create
if gcloud scheduler jobs describe "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  SCHEDULER_VERB=update
fi
gcloud scheduler jobs "$SCHEDULER_VERB" http "nammapros-periodic-$ENV_NAME" --project="$PROJECT_ID" --location="$REGION" \
  --schedule="* * * * *" --time-zone="Etc/UTC" --uri="$JOB_URL" --http-method=POST \
  --oauth-service-account-email="$SCHEDULER_SERVICE_ACCOUNT" --max-retry-attempts=0
