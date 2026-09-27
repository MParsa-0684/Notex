#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/../.."
mkdir -p Releases
export COPYFILE_DISABLE=1
archive=arani-notex-update-2026-09-26.tar.gz
# Explicit allowlist: no runtime data, real environment files, private documents or caches.
tar -czf "Releases/${archive}" \
  UPDATES-2026-09-26.md \
  PlanNet/app/PlanNetApp.tsx PlanNet/app/globals.css \
  PlanNet/app/components/GraphView.tsx PlanNet/app/lib/graph-groups.ts PlanNet/app/lib/graph-layout.ts \
  PlanNet/tests/graph-groups.test.ts PlanNet/tests/graph-layout.test.ts \
  Portfolio/app/layout.tsx Portfolio/public/icons Portfolio/public/apple-touch-icon.png \
  Notex/package.json Notex/package-lock.json Notex/.env.example Notex/.gitignore \
  Notex/.dockerignore Notex/Dockerfile Notex/index.html Notex/vite.config.ts Notex/tsconfig.json \
  Notex/src Notex/server Notex/shared Notex/public Notex/tests Notex/scripts Notex/docs Notex/README.md \
  Notex/deploy/compose.yaml Notex/deploy/prepare.sh Notex/deploy/start.sh \
  Notex/deploy/register-domain.sh Notex/deploy/nginx.conf.template \
  Notex/deploy/backup.sh Notex/deploy/restore.sh
(cd Releases && shasum -a 256 "$archive" > "$archive.sha256")
printf 'Created Releases/%s (incremental update, no user data).\n' "$archive"
