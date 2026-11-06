#!/usr/bin/env bash
set -euo pipefail
if [[ "${NAMMAPROS_STORAGE_CHANGE_APPROVED:-}" != "yes" ]]; then
  echo "Bucket changes require explicit review and approval." >&2; exit 2
fi
: "${PRIVATE_MEDIA_BUCKET:?}"
gcloud storage buckets update "gs://$PRIVATE_MEDIA_BUCKET" \
  --public-access-prevention --uniform-bucket-level-access --versioning
