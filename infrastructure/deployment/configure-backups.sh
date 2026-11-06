#!/usr/bin/env bash
set -euo pipefail
if [[ "${NAMMAPROS_BACKUP_CHANGE_APPROVED:-}" != "yes" ]]; then
  echo "Backup setting changes require a reviewed instance and explicit approval." >&2; exit 2
fi
: "${PROJECT_ID:?} ${CLOUDSQL_INSTANCE:?}"
gcloud sql instances patch "$CLOUDSQL_INSTANCE" --project="$PROJECT_ID" \
  --backup-start-time="${BACKUP_START_UTC:-02:00}" \
  --retained-backups-count="${BACKUP_COUNT:-14}" \
  --enable-point-in-time-recovery \
  --retained-transaction-log-days="${TRANSACTION_LOG_DAYS:-7}" \
  --deletion-protection
