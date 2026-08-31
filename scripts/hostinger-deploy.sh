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

remove_deploy_tree() {
  local target="$1"
  [[ "$target" == /home/u571486348/.slabline-deploy.* || "$target" == "$BACKUP_DIR" ]] || return 1
  if [[ -e "$target" ]]; then
    chmod -R u+rwX "$target" 2>/dev/null || true
    rm -rf "$target"
  fi
}

clear_app_except_env() {
  local current
  shopt -s dotglob nullglob
  for current in "$APP_DIR"/*; do
    [[ "$(basename "$current")" == ".env" ]] && continue
    rm -rf "$current"
  done
  shopt -u dotglob nullglob
}

cleanup() {
  local exit_code=$?

  if [[ $exit_code -ne 0 && $ACTIVATION_STARTED -eq 1 && -d "$BACKUP_DIR" ]]; then
    echo "Deployment failed during activation; restoring the previous release." >&2
    clear_app_except_env
    shopt -s dotglob nullglob
    for item in "$BACKUP_DIR"/*; do
      mv "$item" "$APP_DIR/"
    done
    shopt -u dotglob nullglob
    mkdir -p "$APP_DIR/tmp"
    touch "$APP_DIR/tmp/restart.txt"
  fi

  remove_deploy_tree "$STAGE_DIR"
  remove_deploy_tree "$BACKUP_DIR"
  rm -f "$ARCHIVE"
  exit "$exit_code"
}
trap cleanup EXIT

tar -xzf "$ARCHIVE" -C "$STAGE_DIR"
cp "$APP_DIR/.env" "$STAGE_DIR/.env"

for required in dist prisma web/out node_modules package.json package-lock.json; do
  if [[ ! -e "$STAGE_DIR/$required" ]]; then
    echo "Release bundle is missing: $required" >&2
    exit 1
  fi
done

# Next.js static assets must be traversable by Passenger. ZIP-based Windows
# deployments previously created `_next/static` as 0644, causing every CSS and
# JavaScript request to fail with EACCES and leaving the browser blank.
find "$STAGE_DIR/dist" "$STAGE_DIR/prisma" "$STAGE_DIR/web" -type d -exec chmod 755 {} +
find "$STAGE_DIR/dist" "$STAGE_DIR/prisma" "$STAGE_DIR/web" -type f -exec chmod 644 {} +

# Production dependencies and Prisma's native engines are prepared on the
# Linux GitHub runner. Hostinger's shared runtime aborts during Prisma's
# postinstall, so activation must not run npm install on the server.
test -f "$STAGE_DIR/node_modules/@prisma/client/package.json"
test -d "$STAGE_DIR/node_modules/.prisma/client"

cd "$STAGE_DIR"

# Hostinger's shared runtime currently hangs Prisma's schema-engine process.
# There are no new migrations in this release, so migrations are opt-in until
# Hostinger resolves that runtime limitation. Set RUN_DATABASE_MIGRATIONS=1 in
# the SSH environment only for a release that actually adds a migration.
if [[ "${RUN_DATABASE_MIGRATIONS:-0}" == "1" ]]; then
  timeout 120s npx prisma migrate deploy
else
  echo "No database migrations requested for this release."
fi

remove_deploy_tree "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
ACTIVATION_STARTED=1

shopt -s dotglob nullglob
for item in "$APP_DIR"/*; do
  [[ "$(basename "$item")" == ".env" ]] && continue
  mv "$item" "$BACKUP_DIR/"
done
shopt -u dotglob nullglob

for item in dist prisma web node_modules package.json package-lock.json; do
  mv "$STAGE_DIR/$item" "$APP_DIR/$item"
done

cat > "$APP_DIR/.htaccess" <<'HTACCESS'
PassengerAppRoot /home/u571486348/domains/slategrey-crocodile-436096.hostingersite.com/public_html
PassengerAppType node
PassengerNodejs /opt/alt/alt-nodejs22/root/bin/node
PassengerStartupFile dist/main.js
PassengerBaseURI /
PassengerRestartDir /home/u571486348/domains/slategrey-crocodile-436096.hostingersite.com/public_html/tmp
SetEnv LSNODE_CONSOLE_LOG console.log
HTACCESS

mkdir -p "$APP_DIR/tmp"
chmod 755 "$APP_DIR" "$APP_DIR/tmp"
chmod 600 "$APP_DIR/.env"
chmod 644 "$APP_DIR/.htaccess" "$APP_DIR/package.json" "$APP_DIR/package-lock.json"
touch "$APP_DIR/tmp/restart.txt"
ACTIVATION_STARTED=0

echo "Hostinger deployment completed successfully."
