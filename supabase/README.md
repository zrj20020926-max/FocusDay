# Focus Day Supabase setup

## Linked remote project

- Project: `Focus Day`
- Reference: `oqhntyumjagsshcalnbr`
- Region: Northeast Asia (Tokyo)

The local CLI link is stored in ignored `supabase/.temp` metadata. On another machine, run:

```bash
npx supabase login
npx supabase link --project-ref oqhntyumjagsshcalnbr
```

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and the browser-safe publishable key. Never place a secret or `service_role` key in Vite variables.
3. Apply pending migrations with `npx supabase db push --remote`.
4. Add the application URL and `/account` callback URL to Auth redirect URLs.
5. Run `npm test` and `npm run build`.

For a real remote smoke test, run `scripts/verify-supabase.mjs` with `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and a server-only `SUPABASE_SECRET_KEY` supplied as process environment variables. The script creates isolated temporary users, verifies Auth and RLS, and removes the users in `finally`. Never prefix the secret key with `VITE_` or store it in browser configuration.

`tests/rls_verification.sql` is an integration checklist for a disposable Supabase project. Replace its two placeholder UUIDs with Auth user IDs, then execute each section in the SQL editor. The Vitest suite also checks the complete RLS policy contract and unauthenticated Repository behavior without requiring cloud credentials.

Cloud repositories are intentionally not wired into the active Pinia stores yet. IndexedDB remains the source of truth until the synchronization engine is implemented.
