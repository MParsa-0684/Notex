# Notex security and storage boundaries

This first release has automated security regression tests, not an independent security audit or a guarantee of complete security. Deploy behind HTTPS, maintain the VPS and dependencies, and back up keys and data.

## Data map

| Item | VPS location |
| --- | --- |
| Service configuration and data key | `/opt/arani-stack/Notex/deploy/.env` |
| Encrypted accounts and sessions | `/opt/arani-stack/Infrastructure/data/notex/accounts.enc.json` |
| Encrypted per-user notes, images and drawings | `/opt/arani-stack/Infrastructure/data/notex/users/<user-id>.enc` |
| Encrypted backup and checksum | `/opt/arani-stack/Notex/deploy/backups/` |
| Notex gateway route | `/opt/arani-stack/Infrastructure/gateway/apps/notex-arani-tech-com.conf` |
| Certificate | Existing Infrastructure certificate store, certificate name `notex-arani-tech-com` |

The production data key is random 32-byte base64, used for AES-256-GCM authenticated encryption of account and workspace files. Account passwords use salted scrypt; session tokens are hashed on disk. Browser account tokens and note unlock grants live in memory, not localStorage. Reload requires sign-in again. Theme preference alone is saved in localStorage.

Locked note bodies additionally use salted scrypt-derived AES-GCM keys from a separate note passphrase. The derived key is held only temporarily on the server for an account/session/note-bound unlock grant, expires after ten minutes, and is cleared on close/logout or expiry checks. The persisted title and metadata remain inside the ordinary account workspace encryption, not under the note passphrase.

**This is not zero-knowledge/end-to-end encryption against the server operator.** The server handles plaintext account credentials and note passphrases over TLS while authenticating/unlocking, and handles plaintext documents while serving edits. A compromised server or browser could capture them. Strong passphrases, host hardening and patching still matter.

## Agent isolation

- Backend builds model context excluding all locked and trashed notes, including locked titles and IDs, even if a user currently has an unlock grant.
- Model returns a small schema-validated list of allowed operations; there are no password, unlock, filesystem, shell or arbitrary URL tools.
- Server holds proposals; client approves by opaque plan ID. It does not accept replacement operations from the approval request.
- Applying a plan rechecks account/session ownership, note locks, revisions, pad state, expiry and explicit approval. The operation batch is committed atomically.
- Ollama receives the user's prompt, pad names, and bounded unlocked text only with explicit consent. Use a trusted endpoint and consider its own logs/data policy. These controls do not make model text intrinsically trustworthy.

## Other controls and limits

Account isolation is enforced on the server. Setup requires an out-of-band token in production; registration after the first owner is admin-controlled. HTML is sanitized; remote images, event handlers, scripts and dangerous links are removed. Production sends a restrictive script policy and anti-framing headers. Demo does not send writes or AI requests.

API request limits and two concurrent expensive operations limit basic abuse. The app does not trust forwarded IPs: behind Nginx, these limits are shared across gateway traffic (25 sensitive requests/minute, 240 other API requests/minute). This is conservative for a small private service, not a tuned public multi-tenant deployment. No MFA, CAPTCHA, email verification/recovery or antivirus scanning is included. Do not advertise it as fully secure.

Images are embedded in encrypted documents, not stored in a public upload directory. Exported JSON is unencrypted. Backups contain the production key and account data and are encrypted with a separate passphrase; protect that passphrase and keep an off-server copy.

Do not regenerate `NOTEX_DATA_KEY` after storing data. Losing it loses access to accounts and workspaces. Losing a note passphrase loses that note's protected content even with the server key. Restore requires the original configuration and data from the same backup.

## Verification

Tests cover ownership, password checks, note locking/unlocking, stale revisions, grant revocation, ciphertext on disk, HTML sanitization, excluded agent context, guessed locked-note IDs, explicit consent/approval, one-use plans, and locking a note after proposal. Browser smoke tests cover editing and mobile layout. A live Ollama model, Docker runtime and public VPS certificate routing must additionally be checked in the deployment environment.
