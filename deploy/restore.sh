#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.'; exit 1; }
[[ $# -eq 1 && -f "$1" ]] || { echo 'Usage: sudo ./restore.sh /absolute/path/backup.tar.gz.gpg'; exit 1; }
archive="$(realpath "$1")"
[[ -f "$archive.sha256" ]] || { echo 'The matching checksum file is required.'; exit 1; }
(cd "$(dirname "$archive")" && sha256sum --check "$(basename "$archive").sha256")
[[ ! -e .env && ! -e ../../Infrastructure/data/notex ]] || { echo 'Restore is for a fresh destination only. Existing .env or Notex data found; nothing changed.'; exit 1; }
[[ -t 0 ]] || { echo 'Use an interactive SSH terminal.'; exit 1; }
umask 077
staging="$(mktemp -d /tmp/notex-restore.XXXXXX)"
cleanup(){ unset notex_pass; rm -f "$staging/archive.tar.gz"; rmdir "$staging"; }
trap cleanup EXIT
read -r -s -p 'Backup passphrase: ' notex_pass </dev/tty
printf '\n'
gpg --batch --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$staging/archive.tar.gz" "$archive" 3<<<"$notex_pass"
unset notex_pass
# Reject links, devices and unexpected paths before extracting our own backup.
tar -tzf "$staging/archive.tar.gz" | awk '
  /(^\/|(^|\/)\.\.(\/|$))/ {bad=1}
  !/^Notex\/deploy\/\.env$/ && !/^Infrastructure\/data\/notex(\/|$)/ {bad=1}
  END {exit bad}'
tar -tvzf "$staging/archive.tar.gz" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {bad=1} END {exit bad}'
tar -xzf "$staging/archive.tar.gz" -C ../.. --no-same-owner
[[ -f .env && -d ../../Infrastructure/data/notex ]] || { echo 'Archive was incomplete. Do not start the server; inspect the extracted files.'; exit 1; }
chmod 600 .env
chown -R 1000:1000 ../../Infrastructure/data/notex
chmod 700 ../../Infrastructure/data/notex
echo 'Restored data and its original key. Review .env, then run docker compose up -d --build.'
