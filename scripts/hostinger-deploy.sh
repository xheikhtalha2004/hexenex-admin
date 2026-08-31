#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${1:?Application directory is required}"
ARCHIVE="${2:?Release archive path is required}"
EXPECTED_APP_DIR="/home/u571486348/domains/slategrey-crocodile-436096.hostingersite.com/public_html"

if [[ "$APP_DIR" != "$EXPECTED_APP_DIR" ]]; then
  echo "Refusing to deploy to unexpected directory: $APP_DIR" >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "The production .env file is missing from $APP_DIR" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Release archive was not uploaded: $ARCHIVE" >&2
  exit 1
fi

export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

STAGE_DIR="$(mktemp -d "/home/u571486348/.slabline-deploy.XXXXXX")"
BACKUP_DIR="/home/u571486348/.slabline-rollback"
ACTIVATION_STARTED=0

cleanup() {
  local exit_code=$?

  if [[ $exit_code -ne 0 && $ACTIVATION_STARTED -eq 1 && -d "$BACKUP_DIR" ]]; then
    echo "Deployment failed during activation; restoring the previous release." >&2
    for item in dist prisma web node_modules package.json package-lock.json; do
      rm -rf "${APP_DIR:?}/${item}"
      if [[ -e "$BACKUP_DIR/$item" ]]; then
        mv "$BACKUP_DIR/$item" "$APP_DIR/$item"
      fi
    done
    mkdir -p "$APP_DIR/tmp"
    touch "$APP_DIR/tmp/restart.txt"
  fi

  rm -rf "$STAGE_DIR"
  rm -rf "$BACKUP_DIR"
  rm -f "$ARCHIVE"
  exit "$exit_code"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$STAGE_DIR"
cp "$APP_DIR/.env" "$STAGE_DIR/.env"

cd "$STAGE_DIR"
npm ci --omit=dev
npx prisma migrate deploy

rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
ACTIVATION_STARTED=1

for item in dist prisma web node_modules package.json package-lock.json; do
  if [[ -e "$APP_DIR/$item" ]]; then
    mv "$APP_DIR/$item" "$BACKUP_DIR/$item"
  fi
  mv "$STAGE_DIR/$item" "$APP_DIR/$item"
done

mkdir -p "$APP_DIR/tmp"
touch "$APP_DIR/tmp/restart.txt"
ACTIVATION_STARTED=0

echo "Hostinger deployment completed successfully."
