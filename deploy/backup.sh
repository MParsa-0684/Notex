#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
[[ -t 0 ]] || { echo 'Use an interactive SSH terminal.'; exit 1; }
[[ -f .env && -d ../../Infrastructure/data/notex ]] || { echo 'Notex configuration or data is missing; no backup was made.'; exit 1; }
umask 077
read -r -s -p 'Backup passphrase (16+ characters): ' notex_pass </dev/tty
printf '\n'
read -r -s -p 'Confirm passphrase: ' notex_confirm </dev/tty
printf '\n'
[[ ${#notex_pass} -ge 16 && "$notex_pass" == "$notex_confirm" ]] || { echo 'Passphrases must match and contain 16+ characters.'; exit 1; }
mkdir -p backups
out="$(pwd)/backups/notex-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.gpg"
success=0
was_running="$(docker compose ps --status running -q notex)"
cleanup(){ unset notex_pass notex_confirm; if [[ $success -eq 0 ]]; then rm -f "$out" "$out.sha256"; fi; if [[ -n "$was_running" ]]; then docker compose start notex; fi; }
trap cleanup EXIT
if [[ -n "$was_running" ]]; then docker compose stop notex; fi
tar -C ../.. -czf - Notex/deploy/.env Infrastructure/data/notex | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out" 3<<<"$notex_pass"
(cd backups && sha256sum "$(basename "$out")" > "$(basename "$out").sha256")
success=1
printf 'Created %s. Copy this file and its checksum off-server.\n' "$out"
