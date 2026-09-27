#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Run with sudo on the VPS.'; exit 1; }
domain="${1:-notex.arani-tech.com}"
[[ "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$ ]] || { echo 'Invalid domain'; exit 1; }
docker network inspect arani-edge >/dev/null
if [[ ! -f .env ]]; then
  umask 077
  {
    printf 'NOTEX_DATA_KEY=%s\n' "$(openssl rand -base64 32)"
    printf 'NOTEX_SETUP_TOKEN=%s\n' "$(openssl rand -hex 24)"
    printf 'NOTEX_ORIGINS=https://%s\n' "$domain"
    printf 'OLLAMA_BASE_URL=http://host.docker.internal:11434\nOLLAMA_MODEL=\nOLLAMA_API_KEY=\n'
  } > .env
fi
mkdir -p ../../Infrastructure/data/notex
chown 1000:1000 ../../Infrastructure/data/notex
chmod 700 ../../Infrastructure/data/notex
echo 'Prepared. Keep .env private and preserve NOTEX_DATA_KEY. Set your Ollama model if ready.'
