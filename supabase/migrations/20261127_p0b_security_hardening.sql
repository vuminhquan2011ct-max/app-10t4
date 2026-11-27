-- =============================================================================
--  Class 10T4 — Phase P0-B Production Security Hardening Migration
--  File: supabase/migrations/20261127_p0b_security_hardening.sql
--
--  IMPORTANT DEPLOYMENT NOTES:
--  - DO NOT run blindly on a live project still using legacy Password Mode
--    (anon `class_state` sync) until the companion Edge Functions / JWT Auth
--    login endpoints are deployed and verified.
--  - Every DDL/DML statement below is idempotent (`IF NOT EXISTS`, `CREATE OR
--    REPLACE`, `ON CONFLICT DO NOTHING`) so it can be re-run safely in staging
--    and production cutover windows.
--
--  Covers:
--    [P0-1] Move password hashes & credentials out of public `class_state`
--           (`id = 'class10t4_accounts_v1'`) into `private.account_credentials`
--           with zero `anon`/`authenticated` table privileges.
--    [P0-2] Replace hardcoded client-side teacher invite password (`K8T4`)
--           with server-side SHA-256 hashed one-time/expirable invite codes in
--           `private.teacher_invite_codes` + `public.app_verify_teacher_invite`.
--    [P0-4] Tighten `public.class_photos` RLS to authenticated approved class
--           members with per-uploader ownership checks (`uploader_uid`).
--    [P1-2] Lock down `public.class_state` RLS to JWT-authenticated roles and
--           add server-side `SECURITY DEFINER` RPCs for study stamps, officer
--           position assignment, and full account resets.
-- =============================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 0) [Pre-Flight] Self-Contained `public.profiles` + Auth Trigger + Role Helpers
--    Idempotent so projects that only have `class_state` & `class_photos` can
--    apply this migration cleanly without prior `schema.sql` setup.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  role text not null default 'student' check (role in ('teacher', 'editor', 'student')),
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected', 'blocked')),
  student_id text,
  avatar_url text,
  can_view_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists display_name text not null default '';
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists status text not null default 'approved';
alter table public.profiles add column if not exists student_id text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists can_view_private boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create or replace function public.app_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and status = 'approved'
  );
$$;

create or replace function public.app_is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and status = 'approved'
       and role = 'teacher'
  );
$$;

create or replace function public.app_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and status = 'approved'
       and role in ('teacher', 'editor')
  );
$$;

create or replace function public.app_my_student_id() returns text
language sql stable security definer set search_path = public as $$
  select student_id
    from public.profiles
   where id = auth.uid()
     and status = 'approved';
$$;

revoke all on function public.app_is_member() from public, anon;
revoke all on function public.app_is_teacher() from public, anon;
revoke all on function public.app_can_edit() from public, anon;
revoke all on function public.app_my_student_id() from public, anon;
grant execute on function public.app_is_member() to authenticated;
grant execute on function public.app_is_teacher() to authenticated;
grant execute on function public.app_can_edit() to authenticated;
grant execute on function public.app_my_student_id() to authenticated;

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon;
grant select, update on table public.profiles to authenticated;

drop policy if exists "profiles own select" on public.profiles;
drop policy if exists "profiles teacher all" on public.profiles;

create policy "profiles own select" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles teacher all" on public.profiles
  for all to authenticated
  using (public.app_is_teacher())
  with check (public.app_is_teacher());

-- Backfill all existing `auth.users` into `public.profiles` cleanly (idempotent)
insert into public.profiles (id, email, display_name, role, status, student_id, avatar_url)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    ''
  ),
  case
    when (u.raw_app_meta_data ->> 'role') in ('teacher', 'editor', 'student')
    then (u.raw_app_meta_data ->> 'role')
    else 'student'
  end,
  'approved',
  case
    when coalesce(u.raw_app_meta_data ->> 'role', 'student') = 'student'
    then nullif(trim(coalesce(u.raw_app_meta_data ->> 'account_id', '')), '')
    else null
  end,
  u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

-- Auto-create an approved `public.profiles` row on new Google/GitHub OAuth or email signups
create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role text;
begin
  assigned_role := case
    when (new.raw_app_meta_data ->> 'role') in ('teacher', 'editor', 'student')
    then (new.raw_app_meta_data ->> 'role')
    else 'student'
  end;

  insert into public.profiles (id, email, display_name, role, status, student_id, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    assigned_role,
    'approved',
    case
      when assigned_role = 'student'
      then nullif(trim(coalesce(new.raw_app_meta_data ->> 'account_id', '')), '')
      else null
    end,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

-- -----------------------------------------------------------------------------
-- 1) Isolated `private` schema — NEVER exposed through PostgREST / anon / auth
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2) [P0-1] Private Account Credentials Table + Idempotent Backfill
-- -----------------------------------------------------------------------------
create table if not exists private.account_credentials (
  account_id text primary key,
  kind text not null check (kind in ('student', 'teacher', 'subject_teacher')),
  login_id text not null,
  login_id_key text not null unique,
  email text,
  email_key text unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  password_hash text not null default '',
  display_name text not null default '',
  subject_name text,
  positions text[] not null default '{}',
  custom_permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_credentials_auth_user_idx
  on private.account_credentials (auth_user_id)
  where auth_user_id is not null;

create index if not exists account_credentials_kind_idx
  on private.account_credentials (kind);

revoke all on table private.account_credentials from public, anon, authenticated;

-- Idempotent backfill from legacy `public.class_state` row `class10t4_accounts_v1`
-- (if present). Safe to re-run; preserves newer hashes if already migrated.
do $$
declare
  reg_data jsonb;
begin
  select data
    into reg_data
    from public.class_state
   where id = 'class10t4_accounts_v1';

  if reg_data is null then
    return;
  end if;

  if jsonb_typeof(reg_data -> 'students') = 'array' then
    insert into private.account_credentials (
      account_id,
      kind,
      login_id,
      login_id_key,
      email,
      email_key,
      auth_user_id,
      password_hash,
      display_name,
      positions,
      custom_permissions,
      created_at,
      updated_at
    )
    select
      nullif(trim(s ->> 'studentId'), ''),
      'student',
      coalesce(nullif(trim(s ->> 'loginId'), ''), trim(s ->> 'studentId')),
      upper(regexp_replace(coalesce(nullif(trim(s ->> 'loginId'), ''), trim(s ->> 'studentId')), '\s+', '', 'g')),
      nullif(lower(trim(coalesce(s ->> 'email', ''))), ''),
      nullif(lower(trim(coalesce(s ->> 'email', ''))), ''),
      case
        when coalesce(s ->> 'authUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (s ->> 'authUserId')::uuid
        else null
      end,
      coalesce(s ->> 'passwordHash', ''),
      coalesce(nullif(trim(s ->> 'name'), ''), 'Học sinh'),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(s -> 'positions', '[]'::jsonb))),
        '{}'::text[]
      ),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(s -> 'customPermissions', '[]'::jsonb))),
        '{}'::text[]
      ),
      coalesce(nullif(s ->> 'createdAt', '')::timestamptz, now()),
      coalesce(nullif(s ->> 'updatedAt', '')::timestamptz, now())
    from jsonb_array_elements(reg_data -> 'students') as s
    where nullif(trim(s ->> 'studentId'), '') is not null
    on conflict (account_id) do nothing;
  end if;

  if jsonb_typeof(reg_data -> 'teachers') = 'array' then
    insert into private.account_credentials (
      account_id,
      kind,
      login_id,
      login_id_key,
      email,
      email_key,
      auth_user_id,
      password_hash,
      display_name,
      subject_name,
      created_at,
      updated_at
    )
    select
      nullif(trim(t ->> 'teacherId'), ''),
      case when t ->> 'role' = 'subject_teacher' then 'subject_teacher' else 'teacher' end,
      coalesce(nullif(trim(t ->> 'loginId'), ''), trim(t ->> 'teacherId')),
      upper(regexp_replace(coalesce(nullif(trim(t ->> 'loginId'), ''), trim(t ->> 'teacherId')), '\s+', '', 'g')),
      nullif(lower(trim(coalesce(t ->> 'email', ''))), ''),
      nullif(lower(trim(coalesce(t ->> 'email', ''))), ''),
      case
        when coalesce(t ->> 'authUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (t ->> 'authUserId')::uuid
        else null
      end,
      coalesce(t ->> 'passwordHash', ''),
      coalesce(nullif(trim(t ->> 'name'), ''), 'Giáo viên'),
      nullif(trim(coalesce(t ->> 'subject', '')), ''),
      coalesce(nullif(t ->> 'createdAt', '')::timestamptz, now()),
      coalesce(nullif(t ->> 'updatedAt', '')::timestamptz, now())
    from jsonb_array_elements(reg_data -> 'teachers') as t
    where nullif(trim(t ->> 'teacherId'), '') is not null
    on conflict (account_id) do nothing;
  end if;
end $$;

-- NOTE (POST-CUTOVER CLEANUP):
-- Once Edge Functions authenticate strictly against `private.account_credentials`
-- and all client builds have upgraded off legacy `class10t4_accounts_v1`, run:
--   DELETE FROM public.class_state WHERE id = 'class10t4_accounts_v1';

-- -----------------------------------------------------------------------------
-- 3) [P0-2] Server-Side Hashed Teacher Invite Codes (`private.teacher_invite_codes`)
-- -----------------------------------------------------------------------------
create table if not exists private.teacher_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  role text not null default 'subject_teacher' check (role in ('teacher', 'subject_teacher')),
  label text,
  max_uses int not null default 1 check (max_uses > 0),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  revoked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on table private.teacher_invite_codes from public, anon, authenticated;

-- Example seed (run manually with a strong random invite secret — NEVER commit raw codes):
-- insert into private.teacher_invite_codes (code_hash, role, label, max_uses, expires_at)
-- values (
--   encode(extensions.digest('REPLACE_WITH_STRONG_CODE', 'sha256'), 'hex'),
--   'subject_teacher',
--   'Đợt mời GV bộ môn HK1',
--   10,
--   now() + interval '30 days'
-- );

create or replace function public.app_verify_teacher_invite(raw_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  clean_code text;
  candidate_hash text;
  matched record;
begin
  if auth.uid() is null then
    raise exception 'Yêu cầu đăng nhập trước khi xác thực mã mời giáo viên';
  end if;

  clean_code := trim(coalesce(raw_code, ''));
  if length(clean_code) < 6 then
    return jsonb_build_object('ok', false, 'error', 'Mã mời giáo viên không hợp lệ');
  end if;

  candidate_hash := encode(extensions.digest(clean_code, 'sha256'), 'hex');

  select id, role, max_uses, used_count, expires_at, revoked
    into matched
    from private.teacher_invite_codes
   where code_hash = candidate_hash
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Mã mời giáo viên không chính xác');
  end if;

  if matched.revoked then
    return jsonb_build_object('ok', false, 'error', 'Mã mời giáo viên đã bị thu hồi');
  end if;

  if matched.expires_at is not null and matched.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'Mã mời giáo viên đã hết hạn');
  end if;

  if matched.used_count >= matched.max_uses then
    return jsonb_build_object('ok', false, 'error', 'Mã mời giáo viên đã hết lượt sử dụng');
  end if;

  update private.teacher_invite_codes
     set used_count = used_count + 1
   where id = matched.id;

  return jsonb_build_object(
    'ok', true,
    'role', matched.role,
    'remainingUses', greatest(matched.max_uses - (matched.used_count + 1), 0)
  );
end $$;

revoke all on function public.app_verify_teacher_invite(text) from public, anon;
grant execute on function public.app_verify_teacher_invite(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3b) [P0-6] Persistent Server-Side Brute-Force Lockouts (`private.security_lockouts`)
--     Shared by `pro-vault-verify` and `auth-gateway` Edge Functions.
-- -----------------------------------------------------------------------------
create table if not exists private.security_lockouts (
  lock_key text primary key,
  failed_attempts int not null default 0 check (failed_attempts >= 0),
  lockout_count int not null default 0 check (lockout_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists security_lockouts_locked_until_idx
  on private.security_lockouts (locked_until)
  where locked_until is not null;

revoke all on table private.security_lockouts from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4) [P0-4] Tighten `public.class_photos` RLS & Uploader Ownership
-- -----------------------------------------------------------------------------
alter table public.class_photos
  add column if not exists uploader_uid uuid default auth.uid();

create index if not exists class_photos_uploader_uid_idx
  on public.class_photos (uploader_uid)
  where uploader_uid is not null;

alter table public.class_photos enable row level security;

revoke all on table public.class_photos from public, anon;
grant select, insert, delete on table public.class_photos to authenticated;

drop policy if exists "class_photos public read" on public.class_photos;
drop policy if exists "class_photos public insert" on public.class_photos;
drop policy if exists "class_photos public delete" on public.class_photos;
drop policy if exists "class_photos member read" on public.class_photos;
drop policy if exists "class_photos member insert" on public.class_photos;
drop policy if exists "class_photos owner or teacher delete" on public.class_photos;

create policy "class_photos member read" on public.class_photos
  for select to authenticated
  using (public.app_is_member());

create policy "class_photos member insert" on public.class_photos
  for insert to authenticated
  with check (
    public.app_is_member()
    and uploader_uid = auth.uid()
    and image_url ~* '^https?://'
    and (drive_url is null or drive_url ~* '^https?://')
  );

create policy "class_photos owner or teacher delete" on public.class_photos
  for delete to authenticated
  using (
    public.app_is_teacher()
    or (public.app_is_member() and uploader_uid = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 5) [P0-1 / P1-2] Strict JWT-Backed `public.class_state` RLS Policies
-- -----------------------------------------------------------------------------
alter table public.class_state enable row level security;

revoke all on table public.class_state from public, anon;
grant select, insert, update on table public.class_state to authenticated;

drop policy if exists "class_state public sync" on public.class_state;
drop policy if exists "app state select" on public.class_state;
drop policy if exists "app state insert" on public.class_state;
drop policy if exists "app state update" on public.class_state;
drop policy if exists "class_state member select" on public.class_state;
drop policy if exists "class_state editor insert" on public.class_state;
drop policy if exists "class_state editor update" on public.class_state;
drop policy if exists "class_state member insert" on public.class_state;
drop policy if exists "class_state member update" on public.class_state;

-- Explicitly block `class10t4_accounts_v1` even for authenticated members while allowing
-- authenticated approved class members (GVCN, GVBM, Ban cán sự, students) to sync `class10t4`.
create policy "class_state member select" on public.class_state
  for select to authenticated
  using (id = 'class10t4' and public.app_is_member());

create policy "class_state member insert" on public.class_state
  for insert to authenticated
  with check (id = 'class10t4' and public.app_is_member());

create policy "class_state member update" on public.class_state
  for update to authenticated
  using (id = 'class10t4' and public.app_is_member())
  with check (id = 'class10t4' and public.app_is_member());

-- -----------------------------------------------------------------------------
-- 6) [P1-2] Server-Side SECURITY DEFINER RPCs for Privileged Mutations
-- -----------------------------------------------------------------------------

-- 6a) Log 1 Study Stamp (+0.25 pts) with server-enforced points & own-group check
create or replace function public.app_log_study_stamp(
  target_student_id text,
  subject_name text,
  stamp_date text default null,
  title text default null,
  note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_subject text;
  clean_date text;
  caller_sid text;
  caller_is_teacher boolean;
  caller_student jsonb;
  target_student jsonb;
  caller_positions text[];
  caller_group text;
  target_group text;
  is_class_wide boolean := false;
  is_officer boolean := false;
  actor text;
  new_entry jsonb;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;

  clean_subject := left(trim(coalesce(subject_name, '')), 60);
  if clean_subject = '' then
    raise exception 'Thiếu tên môn học';
  end if;

  caller_is_teacher := public.app_is_teacher();
  caller_sid := public.app_my_student_id();

  select s
    into target_student
    from public.class_state c,
         jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
   where c.id = 'class10t4'
     and s ->> 'id' = target_student_id
   limit 1;

  if target_student is null then
    raise exception 'Không tìm thấy hồ sơ học sinh';
  end if;

  if not caller_is_teacher then
    if caller_sid is null then
      raise exception 'Tài khoản chưa được liên kết với hồ sơ học sinh';
    end if;

    select s
      into caller_student
      from public.class_state c,
           jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
     where c.id = 'class10t4'
       and s ->> 'id' = caller_sid
     limit 1;

    caller_positions := coalesce(
      array(select jsonb_array_elements_text(coalesce(caller_student -> 'positions', '[]'::jsonb))),
      '{}'::text[]
    );
    is_officer := array_length(caller_positions, 1) is not null
      or nullif(trim(coalesce(caller_student ->> 'position', '')), '') is not null;

    if not is_officer then
      raise exception 'Chỉ Giáo viên và Ban cán sự được GVCN phân công mới có quyền cộng Stamp phát biểu';
    end if;

    is_class_wide := exists (
      select 1
        from unnest(caller_positions) p
       where lower(p) ~ '(lớp trưởng|lop truong|lớp phó học tập|lop pho hoc tap|bí thư|bi thu)'
    );

    if not is_class_wide then
      caller_group := lower(trim(coalesce(caller_student ->> 'group', '')));
      target_group := lower(trim(coalesce(target_student ->> 'group', '')));
      if caller_group = '' or caller_group <> target_group then
        raise exception 'Bạn chỉ được phép cộng Stamp phát biểu cho thành viên trong Tổ của mình';
      end if;
    end if;
  end if;

  select coalesce(nullif(trim(display_name), ''), email, 'Thành viên')
    into actor
    from public.profiles
   where id = auth.uid();

  clean_date := coalesce(nullif(trim(stamp_date), ''), to_char(now(), 'YYYY-MM-DD'));

  new_entry := jsonb_build_object(
    'id', 'ent_' || md5(random()::text || clock_timestamp()::text),
    'studentId', target_student_id,
    'title', coalesce(nullif(left(trim(coalesce(title, '')), 200), ''), 'Phát biểu môn ' || clean_subject || ' (1 stamp)'),
    'kind', 'study',
    'category', 'study',
    'level', 'class',
    'date', clean_date,
    'subject', clean_subject,
    'speechCount', 1,
    'points', 0.25,
    'description', nullif(left(trim(coalesce(note, '')), 1000), ''),
    'proofUrl', null,
    'status', 'approved',
    'submittedBy', 'teacher',
    'reviewNote', null,
    'recordedByName', coalesce(actor, 'Thành viên'),
    'recordedByPosition', case when caller_is_teacher then 'GVCN' else coalesce(nullif(trim(caller_student ->> 'position'), ''), 'Ban cán sự') end,
    'recordedByStudentId', case when caller_is_teacher then null else caller_sid end,
    'source', 'study_participation',
    'createdAt', now(),
    'updatedAt', now()
  );

  update public.class_state
     set data = jsonb_set(
       data,
       '{entries}',
       jsonb_build_array(new_entry) || coalesce(data -> 'entries', '[]'::jsonb)
     )
   where id = 'class10t4';

  return new_entry;
end $$;

-- 6b) Delete a Study Stamp with server-enforced authorization & tombstone
create or replace function public.app_delete_study_stamp(entry_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_entry jsonb;
  caller_sid text;
  caller_is_teacher boolean;
  caller_student jsonb;
  target_student jsonb;
  caller_positions text[];
  is_class_wide boolean := false;
  allowed boolean := false;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;

  select e
    into target_entry
    from public.class_state c,
         jsonb_array_elements(coalesce(c.data -> 'entries', '[]'::jsonb)) e
   where c.id = 'class10t4'
     and e ->> 'id' = entry_id
     and e ->> 'kind' = 'study'
   limit 1;

  if target_entry is null then
    return false;
  end if;

  caller_is_teacher := public.app_is_teacher();
  caller_sid := public.app_my_student_id();

  if caller_is_teacher then
    allowed := true;
  elsif caller_sid is not null then
    if target_entry ->> 'recordedByStudentId' = caller_sid then
      allowed := true;
    else
      select s
        into caller_student
        from public.class_state c,
             jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
       where c.id = 'class10t4'
         and s ->> 'id' = caller_sid
       limit 1;

      select s
        into target_student
        from public.class_state c,
             jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
       where c.id = 'class10t4'
         and s ->> 'id' = (target_entry ->> 'studentId')
       limit 1;

      caller_positions := coalesce(
        array(select jsonb_array_elements_text(coalesce(caller_student -> 'positions', '[]'::jsonb))),
        '{}'::text[]
      );
      is_class_wide := exists (
        select 1
          from unnest(caller_positions) p
         where lower(p) ~ '(lớp trưởng|lop truong|lớp phó học tập|lop pho hoc tap|bí thư|bi thu)'
      );
      if is_class_wide then
        allowed := true;
      elsif (array_length(caller_positions, 1) is not null or nullif(trim(coalesce(caller_student ->> 'position', '')), '') is not null)
        and lower(trim(coalesce(caller_student ->> 'group', ''))) <> ''
        and lower(trim(coalesce(caller_student ->> 'group', ''))) = lower(trim(coalesce(target_student ->> 'group', ''))) then
        allowed := true;
      end if;
    end if;
  end if;

  if not allowed then
    raise exception 'Bạn không có quyền xoá stamp phát biểu này';
  end if;

  update public.class_state
     set data = jsonb_set(
       jsonb_set(
         data,
         '{entries}',
         coalesce((
           select jsonb_agg(e order by ord)
             from jsonb_array_elements(coalesce(data -> 'entries', '[]'::jsonb)) with ordinality as t(e, ord)
            where e ->> 'id' <> entry_id
         ), '[]'::jsonb)
       ),
       '{deletedItemIds}',
       coalesce(data -> 'deletedItemIds', '{}'::jsonb) || jsonb_build_object(entry_id, now())
     )
   where id = 'class10t4';

  return true;
end $$;

-- 6c) Assign Student Officer Positions & Custom Permissions (GVCN-only)
create or replace function public.app_assign_positions(
  target_student_id text,
  next_positions text[],
  next_custom_permissions text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  clean_positions text[];
  clean_perms text[];
  display_pos text;
begin
  if not public.app_is_teacher() then
    raise exception 'Chỉ Giáo viên chủ nhiệm mới có quyền phân công chức vụ Ban cán sự';
  end if;

  clean_positions := coalesce(
    array(
      select distinct left(trim(p), 60)
        from unnest(coalesce(next_positions, '{}'::text[])) p
       where trim(p) <> ''
    ),
    '{}'::text[]
  );

  clean_perms := case
    when array_length(clean_positions, 1) is null then '{}'::text[]
    else coalesce(
      array(
        select distinct trim(g)
          from unnest(coalesce(next_custom_permissions, '{}'::text[])) g
         where trim(g) <> ''
      ),
      '{}'::text[]
    )
  end;

  display_pos := nullif(array_to_string(clean_positions, ' · '), '');

  update public.class_state
     set data = jsonb_set(
       data,
       '{students}',
       coalesce((
         select jsonb_agg(
           case
             when s ->> 'id' = target_student_id then
               s
               || jsonb_build_object(
                    'position', display_pos,
                    'positions', to_jsonb(clean_positions),
                    'customPermissions', to_jsonb(clean_perms),
                    'updatedAt', now()
                  )
             else s
           end
           order by ord
         )
         from jsonb_array_elements(coalesce(data -> 'students', '[]'::jsonb)) with ordinality as t(s, ord)
       ), '[]'::jsonb)
     )
   where id = 'class10t4';

  update private.account_credentials
     set positions = clean_positions,
         custom_permissions = clean_perms,
         updated_at = now()
   where account_id = target_student_id
     and kind = 'student';
end $$;

-- 6d) Full Class Account Reset (GVCN-only)
create or replace function public.app_reset_accounts()
returns timestamptz
language plpgsql
security definer
set search_path = public, private
as $$
declare
  reset_ts timestamptz := now();
begin
  if not public.app_is_teacher() then
    raise exception 'Chỉ Giáo viên chủ nhiệm mới có quyền reset toàn bộ tài khoản lớp';
  end if;

  delete from private.account_credentials;

  update public.class_state
     set data = data
       || jsonb_build_object(
            'students', '[]'::jsonb,
            'registeredTeachers', '[]'::jsonb,
            'entries', '[]'::jsonb,
            'attendance', '{}'::jsonb,
            'dutyLogs', '{}'::jsonb,
            'fundPaid', '{}'::jsonb,
            'kudos', '[]'::jsonb,
            'activityLog', '[]'::jsonb,
            'accountsResetAt', reset_ts
          )
   where id = 'class10t4';

  return reset_ts;
end $$;

revoke all on function public.app_log_study_stamp(text, text, text, text, text) from public, anon;
revoke all on function public.app_delete_study_stamp(text) from public, anon;
revoke all on function public.app_assign_positions(text, text[], text[]) from public, anon;
revoke all on function public.app_reset_accounts() from public, anon;

grant execute on function public.app_log_study_stamp(text, text, text, text, text) to authenticated;
grant execute on function public.app_delete_study_stamp(text) to authenticated;
grant execute on function public.app_assign_positions(text, text[], text[]) to authenticated;
grant execute on function public.app_reset_accounts() to authenticated;

commit;

