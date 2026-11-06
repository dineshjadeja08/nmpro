#!/usr/bin/env bash
set -euo pipefail

# Operator-invoked only. Create Artifact Registry, Cloud SQL, Redis, bucket,
# secret versions, service accounts, VPC connector and IAM separately.
if [[ "${NAMMAPROS_DEPLOY_APPROVED:-}" != "yes" ]]; then
  echo "Set NAMMAPROS_DEPLOY_APPROVED=yes only after reviewing the target and image." >&2
  exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?} ${IMAGE_REPOSITORY:?} ${SERVICE_ACCOUNT:?} ${CLOUDSQL_INSTANCE:?} ${VPC_CONNECTOR:?} ${ENV_FILE:?}"
if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "ENV_NAME must be staging or production" >&2; exit 2
fi
if grep -Eq 'example\.invalid|REPLACE_|SET_IN_SECRET_MANAGER' "$ENV_FILE"; then
  echo "Replace all example values before deployment" >&2; exit 2
fi
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_REPOSITORY}/nammapros-api:${IMAGE_TAG:?}"
gcloud builds submit . --project="$PROJECT_ID" --config=infrastructure/deployment/cloudbuild.yaml --substitutions="_IMAGE=$IMAGE"
gcloud run deploy "nammapros-api-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" \
  --image="$IMAGE" --platform=managed --service-account="$SERVICE_ACCOUNT" \
  --env-vars-file="$ENV_FILE" --set-secrets="DJANGO_SECRET_KEY=nammapros-$ENV_NAME-django-secret:latest,DATABASE_URL=nammapros-$ENV_NAME-database-url:latest,REDIS_URL=nammapros-$ENV_NAME-redis-url:latest,MSG91_AUTH_KEY=nammapros-$ENV_NAME-msg91-key:latest" \
  --add-cloudsql-instances="$CLOUDSQL_INSTANCE" --vpc-connector="$VPC_CONNECTOR" --vpc-egress=private-ranges-only \
  --cpu=1 --memory=1Gi --concurrency=20 --min-instances=0 --max-instances=3 \
  --timeout=60 --port=8080 --allow-unauthenticated \
  --startup-probe="tcpSocket.port=8080,initialDelaySeconds=10,periodSeconds=10,failureThreshold=12" \
  --liveness-probe="tcpSocket.port=8080,periodSeconds=30,failureThreshold=3"
echo "Service deployed. Run controlled migrations separately and verify /api/v1/ready/."
