#!/usr/bin/env bash
set -euo pipefail
if [[ "${NAMMAPROS_MIGRATION_APPROVED:-}" != "yes" ]]; then
  echo "Migration requires separate operator approval and a reviewed backup." >&2; exit 2
fi
: "${PROJECT_ID:?} ${REGION:?} ${ENV_NAME:?}"
gcloud run jobs execute "nammapros-migrate-$ENV_NAME" --project="$PROJECT_ID" --region="$REGION" --wait
