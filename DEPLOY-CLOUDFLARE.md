# Deploy Telegram Rizz (tweb) on Cloudflare Pages

This app is a **static SPA** after `pnpm build`: HTML, JS, and assets in `dist/`. Telegram stores messages; you do **not** need a database for chat data.

**Target production URL:** `https://telegram.popped.dev` (see below). The Pages project name in `wrangler.toml` is **`telegram-popped`**.

## About the Cloudflare MCP in Cursor

- **cloudflare-docs** — documentation search (custom domains, Wrangler, etc.).
- **cloudflare-builds** — **Workers Builds** (CI for Workers), **not** Cloudflare Pages. Pages setup is still done in the dashboard or with **Wrangler** + API token.
- Fully automated DNS/API setup from here requires a **`CLOUDFLARE_API_TOKEN`** in your environment (see §4).

## 1. `popped.dev` is already on Cloudflare — use `telegram.popped.dev`

Because **`popped.dev`** uses Cloudflare **nameservers**, you do **not** need to hand-create an empty DNS record first.

1. Create or open the **Pages** project **`telegram-popped`** (name must match `wrangler.toml` / deploy script if you use CLI).
2. **Workers & Pages** → your **Pages** project → **Custom domains** → **Set up a domain**.
3. Enter **`telegram.popped.dev`** → **Continue**.

Cloudflare will **create the DNS record for `telegram` in the `popped.dev` zone** for you and issue SSL. Status becomes **Active** after propagation (often a few minutes).

Important: you must attach the hostname in the **Pages** UI first; a random CNAME alone can fail ([docs](https://developers.cloudflare.com/pages/configuration/custom-domains/)).

If the zone is in a **different** Cloudflare account than the Pages project, use that account’s dashboard or add the CNAME they show to `telegram` → your `*.pages.dev` host.

## 2. Deploy from Git (recommended)

1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Select the repo (e.g. `parse-nip/TelegramRizz`).
3. **Configure build**
   - **Project name:** `telegram-popped` (recommended, matches this repo).
   - **Root directory:** `tweb` (if the repo root is the monorepo `TelegramRizz`).
   - **Framework preset:** None / Vite (either is fine).
   - **Build command:** `pnpm install && pnpm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (optional): none required for a basic client build. Set **`NODE_VERSION=20`** if the build fails on Node version.
5. **Save and Deploy**, then add **Custom domain** `telegram.popped.dev` as in §1.

The build runs `copy_cloudflare_files.js` so **`_redirects`** is copied into **`dist/`** for SPA routing.

## 3. Manual deploy (Wrangler CLI)

Requires **`CLOUDFLARE_API_TOKEN`** (see §4). From the **`tweb`** folder:

```bash
pnpm run deploy:cf
```

Or explicitly:

```bash
pnpm dlx wrangler@latest pages deploy dist --project-name=telegram-popped
```

Create the project in the dashboard first, or Wrangler will prompt / error depending on account scope.

## 4. `CLOUDFLARE_API_TOKEN` (Wrangler / automation)

Create an API token in **My Profile** → **API Tokens** → **Create Token** with at least:

- **Account** — Cloudflare Pages — **Edit**
- **Zone** — **DNS** — **Edit** (if you manage DNS via API; dashboard custom domain usually does not need this for the same account)

Set in your shell or CI:

```bash
set CLOUDFLARE_API_TOKEN=your_token_here   # Windows cmd
# $env:CLOUDFLARE_API_TOKEN = "..."        # PowerShell
```

Then `pnpm run deploy:cf` from `tweb` can create/update deployments. For **Git-connected Pages**, pushes deploy automatically; the token is mainly for **local Wrangler** or **CI** that runs `wrangler pages deploy`.

## 5. Node version on Pages

Cloudflare Pages supports **Node 18/20/22**. This repo uses `pnpm`; the build command above is enough. If builds fail, set **Environment variable** `NODE_VERSION` to `20` in Pages → Settings → Environment variables.

## 6. What you are hosting

- **Static files only** (CDN + HTTPS).
- **Telegram** handles auth and messages via MTProto from the browser.
- **OpenRouter** (Rizz) is called from the **user’s browser** with their key in `localStorage` unless you change that.

No Workers or D1 required unless you add your own API later.
