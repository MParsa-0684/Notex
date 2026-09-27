#!/usr/bin/env bash
set -Eeuo pipefail
NOTEX_DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
# Reuse the existing stack's certificate store and gateway, never install a second Nginx.
source "${NOTEX_DEPLOY_DIR}/../../Infrastructure/scripts/lib.sh"
require_root
domain="${1:-notex.arani-tech.com}"
valid_hostname "$domain" || die 'Invalid Notex domain.'
[[ -f "${NOTEX_DEPLOY_DIR}/.env" ]] || die 'Run prepare.sh first.'
grep -Fxq "NOTEX_ORIGINS=https://${domain}" "${NOTEX_DEPLOY_DIR}/.env" || die 'Domain must match NOTEX_ORIGINS in Notex/deploy/.env.'
load_env
docker compose -f "${NOTEX_DEPLOY_DIR}/compose.yaml" exec -T notex node -e "fetch('http://127.0.0.1:8900/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
cert="$(printf %s "$domain" | tr '._' '--')"
obtain_certificate "$cert" "$domain"
target="${STACK_DIR}/gateway/apps/${cert}.conf"
mkdir -p "${STACK_DIR}/gateway/apps"
staging="$(mktemp -d /tmp/notex-route.XXXXXX)"
had_previous=0
[[ ! -e "$target" ]] || { cp "$target" "$staging/previous"; had_previous=1; }
cleanup(){ rm -f "$staging/previous" "$staging/new"; rmdir "$staging"; }
trap cleanup EXIT
sed -e "s|__DOMAIN__|${domain}|g" -e "s|__CERT__|${cert}|g" "${NOTEX_DEPLOY_DIR}/nginx.conf.template" > "$staging/new"
install -m 644 "$staging/new" "$target"
if ! compose exec -T gateway nginx -t; then
  if [[ $had_previous -eq 1 ]]; then cp "$staging/previous" "$target"; else rm -f "$target"; fi
  die 'Gateway check failed; restored the previous configuration. Existing running Nginx was not reloaded.'
fi
compose exec -T gateway nginx -s reload
log "Notex is routed at https://${domain}."
