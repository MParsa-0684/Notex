# Self-hosting Notex

Basic local development works from this repository alone. The supplied `deploy/` scripts specifically integrate with the separate **Arani Stack Infrastructure** project; they are not a generic fresh-VPS installer.

## Prerequisites

- Existing Docker Compose, healthy shared Nginx gateway, and Docker network `arani-edge`.
- Repository at `/opt/arani-stack/Notex`, beside `/opt/arani-stack/Infrastructure`.
- The Infrastructure project's `.env`, certificate tooling and `scripts/lib.sh`.
- DNS for your Notex hostname pointing to the VPS and working gateway ports 80/443.
- A verified off-server backup before modifying an existing deployment.

Do not reinstall the VPS or change its SSH port. Notex publishes no new host port.

## First deployment

```sh
cd /opt/arani-stack/Notex/deploy
sudo bash ./prepare.sh notex.arani-tech.com
sudo nano .env
sudo bash ./start.sh
sudo bash ./register-domain.sh notex.arani-tech.com
```

Use your own hostname consistently. Preparation creates Notex-only secrets once. Startup builds one web/API container and waits for health. Domain registration reuses the gateway and certificate store, tests its route and reloads Nginx.

| Setting | Required handling |
| --- | --- |
| `NOTEX_DATA_KEY` | Keep the generated key permanently with the data. Never regenerate it after storing notes. |
| `NOTEX_SETUP_TOKEN` | Private first-owner setup token; enter it only in the setup form. |
| `NOTEX_ORIGINS` | Exact website origin, without a trailing slash. |
| `OLLAMA_BASE_URL` | Trusted endpoint reachable from the API container. |
| `OLLAMA_MODEL` | Installed model name; leave blank to disable AI. |
| `OLLAMA_API_KEY` | Optional server-side credential. |

The `notex` Compose project mounts `Infrastructure/data/notex` at `/data`, joins `arani-edge` and serves internally on 8900. Its container limit is 512 MB; Ollama's resources are separate.

```sh
curl --max-time 15 -fsS https://notex.arani-tech.com/api/health
```

Create the owner account using the generated setup token. Other accounts are owner-created. Notex and PlanNet accounts are separate. Allow the Notex origin in PlanNet's API configuration to enable the action picker.

## Ollama

Host loopback is not the same as container loopback. A host service listening only on 127.0.0.1 is not reachable through `host.docker.internal`. Use a trusted, restricted endpoint reachable by the container; do not expose unauthenticated port 11434 publicly.

After changing `.env`, recreate Notex with `sudo docker compose up -d --force-recreate notex`. Test a harmless proposal and approval in the app. The built-in automated agent tests use mock responses, not your actual model.

## Operations

Run these from `Notex/deploy`:

```sh
sudo docker compose ps
sudo docker compose logs --tail=100 notex
sudo docker compose stop notex
sudo docker compose start notex
sudo bash ./start.sh
```

The last command rebuilds after source updates. Do not use global Docker cleanup or delete data folders to resolve application errors.

## Encrypted backup

```sh
sudo bash ./backup.sh
```

Save open notes first. The script pauses a running Notex, encrypts its original configuration and data, writes a checksum, then restarts it if it was running. Keep both files off-server and store the backup passphrase separately.

**Use this dedicated backup in addition to the old stack backup.** The latter may copy data without stopping Notex and omit `Notex/deploy/.env`, making it insufficient for complete Notex recovery.

## Restore to a fresh destination

Prepare the existing gateway/network and source layout, but **do not run prepare.sh** or create new Notex data/keys first. Copy the encrypted backup and matching checksum:

```sh
cd /opt/arani-stack/Notex/deploy
sudo bash ./restore.sh /absolute/path/to/notex-backup.tar.gz.gpg
sudo nano .env
sudo bash ./start.sh
sudo bash ./register-domain.sh notex.arani-tech.com
```

Restore refuses an existing Notex configuration/data directory. Preserve the restored key; adjust only origins/endpoints if needed. DNS must point to the new server before certificate issuance. Note passphrases are still required.

JSON note exports are plaintext and are not substitutes for the encrypted account/configuration backup. See [security boundaries](SECURITY.md) and [using Notex](USING-NOTEX.md).
