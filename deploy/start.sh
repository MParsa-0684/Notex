#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
[[ -f .env ]] || { echo 'Run sudo bash ./prepare.sh first.'; exit 1; }
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
echo 'Notex is healthy. You can now register its domain.'
