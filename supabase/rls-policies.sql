-- Fiscal Fundamentals — Row Level Security for the public SEC warehouse.
--
-- The web app talks to Supabase with the public `anon` key, which ships inside
-- the browser bundle and is therefore visible to anyone who visits the site.
-- RLS is what actually protects the database: this script grants the public
-- read-only access to the SEC fundamentals data the app needs and denies
-- everything else (all writes, and every other table).
--
-- Safe to run more than once (idempotent). Run it in the Supabase dashboard
-- under SQL Editor, or via `supabase db` if you adopt the CLI later.
--
-- Roles involved:
--   anon          -> unauthenticated visitors (the app today)
--   authenticated -> signed-in users (none yet; granted for future use)
--   service_role  -> your server/ingestion jobs; has BYPASSRLS, so nothing here
--                    affects data loading.
--
-- Before running, you can inspect the current state:
--   select schemaname, tablename, rowsecurity from pg_tables
--     where schemaname = 'public' order by tablename;
--   select * from pg_policies where schemaname = 'public';


-- 1. Read-only access to the base tables the app reads -----------------------
--    Enabling RLS denies everything by default; the SELECT policies below then
--    re-open *reads only*. With no INSERT/UPDATE/DELETE policy, all writes via
--    the anon/authenticated roles are rejected.
--
--    `filing` and `line_item` are queried directly by the app. `canonical_fact`
--    is read by the `fundamentals` view (which runs as the caller via
--    security_invoker), so it needs the same read access or that view returns
--    empty for anon. `ingest_log` is intentionally omitted — it's internal and
--    stays locked (RLS on, no policy = invisible to the public key).

alter table public.filing         enable row level security;
alter table public.line_item      enable row level security;
alter table public.canonical_fact enable row level security;

drop policy if exists "Public read access" on public.filing;
create policy "Public read access"
  on public.filing
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read access" on public.line_item;
create policy "Public read access"
  on public.line_item
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read access" on public.canonical_fact;
create policy "Public read access"
  on public.canonical_fact
  for select
  to anon, authenticated
  using (true);


-- 2. Views ------------------------------------------------------------------
--    `fundamentals` and `annual_line_items` read from the tables above. Force
--    security_invoker so they run with the caller's privileges and honor the
--    policies in section 1 (rather than silently bypassing RLS as the view
--    owner). Then expose read-only access.

do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'fundamentals') then
    execute 'alter view public.fundamentals set (security_invoker = true)';
    execute 'grant select on public.fundamentals to anon, authenticated';
  end if;

  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'annual_line_items') then
    execute 'alter view public.annual_line_items set (security_invoker = true)';
    execute 'grant select on public.annual_line_items to anon, authenticated';
  end if;
end $$;


-- 3. Grants -----------------------------------------------------------------
--    RLS gates which rows are visible; GRANTs gate whether the role can touch
--    the object at all. Ensure the public roles can read the tables and cannot
--    write. (service_role/owner are unaffected by these revokes for ingestion
--    because they own the tables / bypass RLS.)

grant usage on schema public to anon, authenticated;

grant select on public.filing         to anon, authenticated;
grant select on public.line_item      to anon, authenticated;
grant select on public.canonical_fact to anon, authenticated;

revoke insert, update, delete, truncate on public.filing         from anon, authenticated;
revoke insert, update, delete, truncate on public.line_item      from anon, authenticated;
revoke insert, update, delete, truncate on public.canonical_fact from anon, authenticated;


-- 4. Lock down everything else ----------------------------------------------
--    Any other base table in `public` that doesn't already have RLS gets it
--    enabled here. Without a policy, those tables are completely unreadable by
--    anon/authenticated, so staging/internal tables can't leak through the
--    public key. Your ingestion (service_role/owner) still bypasses RLS.
--
--    NOTE: if you later add a feature that reads another table with the anon
--    key, add a matching SELECT policy like the ones in section 1.

do $$
declare t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity = false
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;


-- 5. Verify -----------------------------------------------------------------
--    After running, confirm RLS is on everywhere and the read policies exist:
--   select schemaname, tablename, rowsecurity from pg_tables
--     where schemaname = 'public' order by tablename;
--   select schemaname, tablename, policyname, roles, cmd
--     from pg_policies where schemaname = 'public' order by tablename;
