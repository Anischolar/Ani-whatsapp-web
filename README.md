# WhatsApp Campaigns

A self-hosted admin dashboard for sending **consent-based** WhatsApp marketing campaigns. Built with Next.js 16, TypeScript, Tailwind CSS 4, MongoDB (Mongoose) and [whatsapp-web.js](https://wwebjs.dev/).

- **Connect WhatsApp** by scanning a QR code. The session is saved on disk and restored after restarts.
- **Contacts**: import from CSV, add manually, tag, add custom fields, and record consent.
- **Templates** with personalised placeholders: `{{name}}`, `{{first_name}}`, `{{phone}}`, any CSV column (`{{city}}`), and fallbacks (`{{name|there}}`).
- **Images**: upload promotional images and send them with a caption.
- **Preview** the exact message each real recipient will get before sending.
- **Campaigns** run on a persistent MongoDB-backed queue, with live progress, pause/resume/cancel, retry for failed messages, per-recipient success/failure logs, and CSV export.
- **Consent and opt-out**: only opted-in contacts are ever messaged. Replies of `STOP` unsubscribe instantly, `START` re-subscribes, and a suppression list survives contact deletion and re-imports.

> ⚠️ **Read before using.** whatsapp-web.js automates WhatsApp Web. It is not an official WhatsApp API. Bulk or unsolicited messaging breaks WhatsApp's Terms of Service and can get the number banned. Message only people who have explicitly opted in, keep delays generous, and keep volumes modest. For high-volume or business-critical messaging, use the official [WhatsApp Business Platform](https://business.whatsapp.com/products/business-platform). You are responsible for complying with local marketing and privacy laws (e.g. GDPR, TCPA, PECR).

---

## Requirements

- **Node.js 20.9+** (tested on 22)
- **MongoDB 6+**: a local install, a server, or MongoDB Atlas
- A machine that can run **Chromium**. Puppeteer downloads one automatically on `npm install`. On Linux servers, install Chrome's system libraries (see [Deploying](#deploying-to-a-linux-server)).
- A **persistent, long-running Node.js process** (VPS, dedicated server or local machine). Serverless platforms such as Vercel or Netlify **will not work**, because the WhatsApp client and send queue live in the server process.

## Quick start (local)

```bash
npm install
cp .env.example .env.local        # then edit it (see below)
```

Generate a session secret and a password hash:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # -> AUTH_SECRET
npm run hash-password -- "your-strong-password"                                   # -> ADMIN_PASSWORD_HASH
```

Paste both into `.env.local`. In `.env` files, every `$` in the bcrypt hash must be escaped as `\$`; the script prints the escaped line for you.

Start MongoDB. If you don't have it installed, a throwaway local instance is included for development:

```bash
npm run db:dev          # MongoDB on 127.0.0.1:27017, data kept in ./storage/dev-db
```

Then, in another terminal:

```bash
npm run build
npm start               # http://localhost:3000
```

Or run `npm run dev` for development with hot reload.

Sign in, open **WhatsApp**, click **Connect WhatsApp**, and scan the QR code from your phone (WhatsApp → Settings → Linked devices → Link a device).

### Trying it without a phone

Set `WHATSAPP_MOCK=true` to use a fake client. The QR auto-confirms after a few seconds and nothing is really sent. Numbers ending in `0000` behave as "not on WhatsApp" and numbers ending in `9999` fail to send, so you can see the failure paths.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | ✅ | `mongodb://127.0.0.1:27017/whatsapp_bulk` | MongoDB connection string |
| `AUTH_SECRET` | ✅ | | 32+ random characters used to sign admin session cookies |
| `ADMIN_USERNAME` | | `admin` | Admin login name |
| `ADMIN_PASSWORD_HASH` | ✅* | | bcrypt hash from `npm run hash-password` (escape `$` as `\$`) |
| `ADMIN_PASSWORD` | ✅* | | Plain-text fallback, used only if no hash is set. Not recommended in production. |
| `STORAGE_DIR` | | `./storage` | Holds `uploads/` (images) and `wa-session/` (WhatsApp login) |
| `DEFAULT_COUNTRY` | | `US` | ISO country code used for numbers written without a country code |
| `SESSION_HOURS` | | `12` | Admin session lifetime |
| `COOKIE_SECURE` | | `true` in production | Set `false` only if you serve production over plain HTTP |
| `MAX_UPLOAD_MB` | | `5` | Max image size |
| `MAX_CSV_MB` / `MAX_CSV_ROWS` | | `5` / `20000` | CSV import limits |
| `WA_AUTO_START` | | `true` | Restore the saved WhatsApp session when the server starts |
| `WA_HEADLESS` | | `true` | Set `false` to watch the browser (debugging) |
| `PUPPETEER_EXECUTABLE_PATH` | | | Use a system Chrome/Chromium instead of the bundled one |
| `WHATSAPP_MOCK` | | `false` | Fake client for testing. Nothing is sent. |
| `SEND_MIN_DELAY_SEC` / `SEND_MAX_DELAY_SEC` | | `8` / `20` | Default random delay between messages |
| `DAILY_SEND_LIMIT` | | `1000` | Max messages per rolling 24h across all campaigns (`0` = unlimited) |
| `OPT_OUT_KEYWORDS` | | `STOP,UNSUBSCRIBE,STOPALL,OPTOUT,OPT OUT,CANCEL,END,QUIT` | Replies that unsubscribe someone |
| `OPT_IN_KEYWORDS` | | `START,SUBSCRIBE,UNSTOP` | Replies that re-subscribe an existing contact |
| `OPT_OUT_FOOTER` | | `Reply STOP to unsubscribe.` | Appended to campaign messages (toggle per campaign) |
| `OPT_OUT_REPLY` / `OPT_IN_REPLY` | | (sensible text) | Auto-replies sent after STOP / START |

\* Set one of `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD`.

## Using the app

### 1. Contacts and consent

A contact has one of three consent states:

| State | Meaning | Receives campaigns? |
| --- | --- | --- |
| **Opted in** | Explicit permission recorded, with a consent source note | ✅ |
| **No consent** | Imported or added without a consent record | ❌ |
| **Opted out** | Replied STOP, opted out manually, or marked opted out in a CSV | ❌ (never) |

**CSV format.** The `phone` column is required (`mobile`, `whatsapp`, `number` also work). Optional columns: `name` (or `first_name` + `last_name`), `tags` (separated by `;`), and `consent` (`yes` / `no` / `opted_out`). Every other column becomes a custom field you can use as a placeholder.

```csv
phone,name,tags,consent,city
+14155552671,Jane Doe,vip;newsletter,yes,San Francisco
+447911123456,John Smith,newsletter,no,London
```

When importing, choose how consent is handled: use the CSV's `consent` column, mark every row as consented, or import everyone as "no consent". Marking anyone as opted in requires you to tick an attestation and describe how consent was collected; that note is stored on each contact. Phone numbers are validated and normalised to international format. Invalid rows and duplicates are reported row by row.

Safety rules the importer always enforces:

- A number on the opt-out list is **never** re-subscribed by an import.
- An existing opt-in is never downgraded by a later import.

### 2. Templates and images

Write reusable messages with placeholders and WhatsApp formatting (`*bold*`, `_italic_`, `~strike~`). Images are validated by their actual file contents (JPEG, PNG or WebP only; SVG and renamed files are rejected), saved under random names in `storage/uploads/`, and served only to signed-in admins.

### 3. Campaigns

1. **Campaigns → New campaign.** Pick a template (or write from scratch), an optional image (the text becomes its caption), audience tags, and the send delay.
2. The live preview shows the rendered message for real recipients, the eligible audience count, and how many contacts were excluded for missing consent.
3. **Review & send** asks you to confirm consent once more, then builds the queue.

The queue is the `messagelogs` collection, with one document per recipient. A single background worker sends one message at a time with a random delay, and checks consent again just before each send, so anyone who replies STOP mid-campaign is skipped. Campaigns survive server restarts and resume automatically once WhatsApp reconnects. A message that was mid-send during a crash is marked **failed** rather than silently resent, so nobody gets a duplicate. Use **Retry failed** if you want to resend those.

### 4. Opt-outs

- Inbound `STOP` (and the other configured keywords) instantly opts the sender out, skips any of their queued messages, and sends a confirmation reply.
- `START` re-subscribes an existing contact.
- Admins can opt contacts out manually, or add any number to the **Opt-outs** list (e.g. after a request by email). Re-subscribing someone manually requires a written consent note.

## Security

- All pages and API routes require an admin session: a signed, HttpOnly, SameSite cookie, checked both in `src/proxy.ts` and again inside every route handler.
- Login is brute-force limited (5 failures per IP per 15 minutes). Passwords are bcrypt-hashed.
- State-changing API requests must come from the app's own origin (CSRF protection).
- All input is validated with zod. Uploads are size-limited and type-checked by magic bytes, stored under random filenames, and never served publicly.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.
- **Treat `storage/wa-session/` like a password.** Anyone who copies it can use your WhatsApp account. Never commit it (it is already in `.gitignore`), and back it up securely.

## Deploying to a Linux server

1. Install Node.js 20+ and MongoDB (or use Atlas), then install Chrome's runtime libraries, for example on Debian/Ubuntu:
   ```bash
   sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
     libcups2 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 \
     libxkbcommon0 libxrandr2 xdg-utils
   ```
2. `npm ci && npm run build`
3. Keep it running with a process manager, e.g. `pm2 start npm --name whatsapp -- start` (then `pm2 save && pm2 startup`), or a systemd unit.
4. Put it behind HTTPS (nginx or Caddy) and forward the `Host` header (required for the CSRF origin check).
5. **Run exactly one instance.** Each process owns its WhatsApp browser session and send worker, so don't use cluster mode or multiple replicas.
6. Back up MongoDB and the `STORAGE_DIR` folder.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server (the build uses webpack; Turbopack crashes on the locked WhatsApp session files in `storage/`) |
| `npm test` | Unit tests (templates, phone numbers, CSV parsing, image validation) |
| `npm run test:db` | Consent/opt-out integration test. Needs MongoDB and a `MONGODB_URI` whose database name contains `test`, because the database is dropped. |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:dev` | Local development MongoDB (no install needed) |
| `npm run hash-password -- "pw"` | Generate `ADMIN_PASSWORD_HASH` |
| `node scripts/reset-dev-db.mjs` | Drop the development database |

## Project structure

```
src/
  instrumentation.ts      boots the queue worker + restores WhatsApp session at server start
  proxy.ts                auth gate + CSRF origin check for every request
  lib/
    whatsapp.ts           whatsapp-web.js client manager (QR, reconnect, send, inbound messages)
    queue.ts              persistent campaign worker, enqueueing, restart recovery
    consent.ts            opt-in/opt-out logic, STOP/START keyword handling, audience filter
    models.ts             Mongoose models: Contact, OptOut, Template, Media, Campaign, MessageLog
    template.ts csv.ts phone.ts image.ts   pure helpers (unit tested)
  app/api/...             route handlers
  app/(dashboard)/...     admin UI pages
storage/                  runtime data: uploads/, wa-session/, dev-db/ (git-ignored)
```

## Troubleshooting

- **QR never appears / "Failed to launch the browser".** On Linux, install the libraries listed above, or set `PUPPETEER_EXECUTABLE_PATH` to an installed Chrome. Set `WA_HEADLESS=false` locally to watch what happens.
- **Phone says "Couldn't link device".** Usually on WhatsApp's side: too many attempts (wait 1–2 hours), outdated WhatsApp app, VPN, or 4 linked devices already. Click **Reset session**, then try **Use phone number** (pairing code) instead of the QR. If web.whatsapp.com in a normal browser also fails, the issue is the phone/account.
- **Image sends fail with "Data passed to getter must include an id property".** A WhatsApp Web change (Sept 2026) broke media sends in whatsapp-web.js 1.34.7. `scripts/patch-whatsapp-web.mjs` applies the upstream fix automatically after `npm install`; run `node scripts/patch-whatsapp-web.mjs` manually if needed, restart the server, then use **Retry failed** on the campaign. Remove the script once a newer whatsapp-web.js release ships the fix.
- **Stuck on "Authenticating" after a WhatsApp update.** Update whatsapp-web.js (`npm i whatsapp-web.js@latest`). The library follows changes to WhatsApp Web.
- **Logged out by the phone.** The session is cleared. Click **Connect WhatsApp** and scan again. Running campaigns wait in the queue meanwhile.
- **Login fails with a bcrypt hash.** Make sure each `$` is escaped as `\$` in `.env.local`.
#   A n i - w h a t s a p p - w e b  
 