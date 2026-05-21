-- Community curation user reports — Google Play UGC policy compliance.
--
-- Play requires apps with user-generated content to provide an in-app reporting
-- mechanism + a moderation pipeline that removes violating content. This
-- migration adds the storage + RLS for the reporting side; admin review uses
-- the existing app_admins table (operator can query/update directly in Supabase
-- Dashboard until a dedicated admin UI ships).
--
-- Schema:
--   - curation_reports.theme_id → references curated_themes (cascade on delete
--     so a deleted curation drops its history too)
--   - reporter_id → references auth.users (cascade — abandoned reports from
--     deleted accounts have no value)
--   - unique(theme_id, reporter_id) — one user can't pile on the same theme.
--     Re-opening a dismissed report requires admin reset (delete the row).
--   - status: pending → reviewed | dismissed. UI only writes 'pending'.

create table if not exists public.curation_reports (
  id           uuid primary key default gen_random_uuid(),
  theme_id     text not null references public.curated_themes(id) on delete cascade,
  reporter_id  uuid not null references auth.users(id) on delete cascade,
  reason       text not null check (reason in (
    'inappropriate', 'copyright', 'spam', 'misinformation', 'other'
  )),
  detail       text check (char_length(coalesce(detail, '')) <= 500),
  status       text not null default 'pending' check (status in (
    'pending', 'reviewed', 'dismissed'
  )),
  created_at   timestamptz not null default now(),
  unique (theme_id, reporter_id)
);

alter table public.curation_reports enable row level security;

-- Authenticated users may insert their own report (the API also blocks
-- reporting one's own curation client-side; defense-in-depth is on the unique
-- constraint + admin moderation workflow rather than a SQL check, since
-- creator_id is on a different table).
drop policy if exists "curation_reports_insert_own" on public.curation_reports;
create policy "curation_reports_insert_own"
  on public.curation_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Users can read only their own reports (so the client can show "이미 신고함"
-- state without leaking other reporters' identities).
drop policy if exists "curation_reports_select_own" on public.curation_reports;
create policy "curation_reports_select_own"
  on public.curation_reports for select
  to authenticated
  using (reporter_id = auth.uid());

-- Admins (app_admins membership) get full access for moderation. Combined with
-- the policies above via RLS OR semantics.
drop policy if exists "curation_reports_admin_all" on public.curation_reports;
create policy "curation_reports_admin_all"
  on public.curation_reports for all
  to authenticated
  using (exists (select 1 from public.app_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.app_admins where user_id = auth.uid()));

create index if not exists idx_curation_reports_theme
  on public.curation_reports(theme_id);
create index if not exists idx_curation_reports_status
  on public.curation_reports(status, created_at desc);
