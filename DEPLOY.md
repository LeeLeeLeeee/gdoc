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

### Pushing when `gh` has more than one account

If your active `gh` account is not the repo owner, `git push` fails with **403**
(`Permission to <owner>/gdoc.git denied`). The `gh` credential helper only ever
returns the **active** account — setting `credential.https://github.com.username`
does not work, because the helper ignores the requested username and git then
falls through to a password prompt.

Set up a repo-local alias that switches, pushes, and switches back. It lives in
`.git/config`, so it is **not committed** and must be recreated after a fresh
clone. Replace the two usernames with the owner account and your usual account:

```bash
git config --local alias.pushowner \
  '!f() { gh auth switch -u OWNER >/dev/null 2>&1; git push "$@"; rc=$?; gh auth switch -u USUAL >/dev/null 2>&1; return $rc; }; f'
```

Then push with `git pushowner origin main`. The restore runs even when the push
fails, and the original exit code is preserved. Verify with:

```bash
git pushowner --dry-run origin main   # active account must be unchanged afterwards
gh auth status                        # confirm the expected account is active again
```

Both accounts must already be logged in (`gh auth login` once per account).

## After deploy

- Anonymous visitors see public docs. Sign in (your owner account) to see private docs.
- Only the user whose id matches `OWNER_UID`/`VITE_OWNER_UID` can see edit controls and call the admin Edge Function. Private reads are enforced by Postgres RLS and Storage policies, not by the UI.
- Sign in as owner to edit metadata/visibility, create and rename folders, drag files into folders, and delete documents or whole folders (the confirm dialog requires typing the target name).
- Uploading new HTML documents is still the local CLI (`bun run gdoc upload <dir>`).
