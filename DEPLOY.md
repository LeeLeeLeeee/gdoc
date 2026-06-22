# Deploying the gdoc viewer to Vercel

The viewer (`viewer/`) imports shared code from `../shared`, so Vercel's **Root
Directory** must be the folder that contains BOTH `shared/` and `viewer/` — i.e.
the `gdoc` folder.

## Vercel project settings (when importing the GitHub repo)

| Setting | Value |
|---|---|
| **Root Directory** | `gdoc` (the folder containing `shared/` + `viewer/`). If you pushed `gdoc` itself as the repo, use the repo root. |
| **Framework Preset** | Vite |
| **Install Command** | `cd viewer && bun install` |
| **Build Command** | `cd viewer && bun run build` |
| **Output Directory** | `viewer/dist` |

> Override the Install/Build/Output fields in the dashboard ("Edit" next to each).
> Built locally with bun (`bun.lock`); Vercel supports bun. npm also works
> (`cd viewer && npm install` / `npm run build`) if you prefer.

## Environment Variables (Project → Settings → Environment Variables)

Add to **Production** (and Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase **anon** key (public, RLS-protected — safe to ship) |

**Do NOT add `SUPABASE_SERVICE_ROLE_KEY`.** That key is for the CLI only and must
never reach the deployed site.

## Before you push to GitHub

- Confirm `.env` is NOT staged (it holds the service_role key). It is gitignored
  via `.gitignore`, but double-check: `git status` should not list `gdoc/.env`.
- Only `.env.example` (placeholders) should be committed.

## After deploy

- Anonymous visitors see public docs. Sign in (your owner account) to see private docs.
- The site is read-only; uploading new docs is the local CLI (`bun run gdoc <dir>`).
