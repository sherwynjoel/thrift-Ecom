#!/bin/sh
# Container entrypoint: apply pending database migrations, then start the server (CMD).
set -eu

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] applying database migrations"
  node /opt/tools/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
fi

echo "[entrypoint] starting version ${APP_VERSION:-dev}"
exec "$@"
