# Deploying Trove (`gdoc`)

Trove has two deployed pieces:

- Supabase: Postgres migrations, Storage policies, Auth, and the `admin-docs` Edge Function.
- Vercel: the static React viewer in `viewer/`.

The viewer imports shared code from `../shared`, so the Vercel build root must be
the `gdoc` folder that contains both `shared/` and `viewer/`.

## Supabase

Apply migrations in order:

```bash
npx supabase db push
```

If the project is not linked, run `npx supabase link --project-ref <project-ref>`
first, or paste `supabase/migrations/*.sql` into the Supabase SQL Editor in order.

Deploy the authenticated admin API used by viewer edits:

```bash
npx supabase functions deploy admin-docs --project-ref <project-ref>
```

The function requires these project secrets:

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key used by the Edge Function |
| `OWNER_UID` | Supabase Auth user id allowed to modify documents/folders |

Never expose `SUPABASE_SERVICE_ROLE_KEY` to Vercel or the browser.

## Vercel project settings (when importing the GitHub repo)

| Setting | Value |
|---|---|
| **Root Directory** | `gdoc` |
| **Framework Preset** | Vite |
| **Install Command** | `bun install && cd viewer && bun install` |
| **Build Command** | `cd viewer && bun run build` |
| **Output Directory** | `viewer/dist` |

`vercel.json` already encodes these settings for CLI deploys from `gdoc/`.

## Environment Variables (Project → Settings → Environment Variables)

Add to **Production** (and Preview):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase **anon** key (public, RLS-protected — safe to ship) |
| `VITE_OWNER_UID` | owner Supabase Auth user id; used only to show/hide edit UI |

**Do NOT add `SUPABASE_SERVICE_ROLE_KEY`.** That key is for the local CLI and
Supabase Edge Function only.

## Before you push to GitHub

- Confirm `.env` is NOT staged (it holds the service_role key). It is gitignored
  via `.gitignore`, but double-check: `git status` should not list `gdoc/.env`.
- Only `.env.example` (placeholders) should be committed.

## After deploy

- Anonymous visitors see public docs. Sign in (your owner account) to see private docs.
- Only the user whose id matches `OWNER_UID`/`VITE_OWNER_UID` can see edit controls and call the admin Edge Function. Private reads are enforced by Postgres RLS and Storage policies, not by the UI.
- Sign in as owner to edit metadata/visibility, create and rename folders, delete empty folders, and drag files into folders.
- Uploading new HTML documents is still the local CLI (`bun run gdoc upload <dir>`).
