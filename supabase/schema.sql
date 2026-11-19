-- =====================================================================
--  BẢO MẬT LỚP 10T4 — Bắt buộc Đăng nhập Google + Tự động vào lớp + Phân quyền
--
--  Cách dùng: Supabase → SQL Editor → New query → dán TOÀN BỘ file → Run.
--  Chạy lại nhiều lần vẫn an toàn (không mất dữ liệu).
--
--  BƯỚC BẮT BUỘC: sửa email ở mục (3) thành Gmail của giáo viên chủ nhiệm.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Dữ liệu chung của lớp (một tài liệu JSON)
-- ---------------------------------------------------------------------
create table if not exists public.class_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.class_state add column if not exists updated_by uuid;


-- ---------------------------------------------------------------------
-- 2) Hồ sơ thành viên (mỗi tài khoản Google một dòng)
--    role:   teacher = toàn quyền | editor = cán sự, được sửa dữ liệu
--            student = xem + gửi thành tích chờ duyệt
--    status: pending = chờ duyệt | approved = đã duyệt | blocked = bị chặn
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  role text not null default 'student',
  student_id text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists status text not null default 'approved';
alter table public.profiles add column if not exists can_view_private boolean not null default false;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles alter column role set default 'student';
alter table public.profiles alter column status set default 'approved';

alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'student' where role is null or role not in ('teacher', 'editor', 'student');
alter table public.profiles add constraint profiles_role_check check (role in ('teacher', 'editor', 'student'));

alter table public.profiles drop constraint if exists profiles_status_check;
update public.profiles set status = 'approved' where status is null or status not in ('pending', 'approved', 'blocked');
alter table public.profiles add constraint profiles_status_check check (status in ('pending', 'approved', 'blocked'));


-- ---------------------------------------------------------------------
-- 3) Email giáo viên chủ nhiệm: tự động là Giáo viên + được duyệt
-- ---------------------------------------------------------------------
create table if not exists public.teacher_emails (email text primary key);

-- >>> SỬA EMAIL DƯỚI ĐÂY THÀNH GMAIL CỦA GIÁO VIÊN, rồi bỏ dấu "--" ở đầu dòng <<<
-- insert into public.teacher_emails (email) values ('giaovien@gmail.com') on conflict do nothing;


-- ---------------------------------------------------------------------
-- 4) Thông tin cá nhân — tách khỏi dữ liệu chung, chỉ người có quyền đọc được
-- ---------------------------------------------------------------------
create table if not exists public.student_private (
  student_id text primary key,
  phone text,
  email text,
  address text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Ghi chú riêng của giáo viên (học sinh KHÔNG đọc được ghi chú về mình)
create table if not exists public.student_notes (
  student_id text primary key,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);


-- ---------------------------------------------------------------------
-- 5) Hàm kiểm tra quyền (chạy trên máy chủ, không giả mạo được)
-- ---------------------------------------------------------------------
create or replace function public.app_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function public.app_is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'approved' and role = 'teacher');
$$;

create or replace function public.app_can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'approved' and role in ('teacher', 'editor'));
$$;

create or replace function public.app_my_student_id() returns text
language sql stable security definer set search_path = public as $$
  select student_id from public.profiles where id = auth.uid() and status = 'approved';
$$;

-- Xem liên hệ: giáo viên, người được cấp quyền, hoặc chính học sinh đó
create or replace function public.app_can_view_private(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'approved'
                   and (role = 'teacher' or can_view_private or student_id = sid));
$$;

-- Xem ghi chú giáo viên: giáo viên hoặc người được cấp quyền
create or replace function public.app_can_view_notes() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'approved'
                   and (role = 'teacher' or can_view_private));
$$;

-- Sửa thông tin cá nhân của người khác: giáo viên, hoặc cán sự được cấp quyền
create or replace function public.app_can_manage_private() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and status = 'approved'
                   and (role = 'teacher' or (role = 'editor' and can_view_private)));
$$;


-- ---------------------------------------------------------------------
-- 6) Tự tạo hồ sơ & tự động duyệt khi đăng nhập Google lần đầu
-- ---------------------------------------------------------------------
create or replace function public.app_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_t boolean;
begin
  is_t := exists (select 1 from public.teacher_emails where lower(email) = lower(new.email));
  insert into public.profiles (id, email, display_name, avatar_url, role, status, can_view_private)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name',
             split_part(coalesce(new.email, ''), '@', 1), ''),
    new.raw_user_meta_data ->> 'avatar_url',
    case when is_t then 'teacher' else 'student' end,
    'approved',
    is_t
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists app_on_auth_user_created on auth.users;
create trigger app_on_auth_user_created
  after insert on auth.users
  for each row execute function public.app_handle_new_user();

-- Thêm email giáo viên sau khi họ đã đăng nhập → tự nâng quyền
create or replace function public.app_promote_teacher() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set role = 'teacher', status = 'approved', can_view_private = true, updated_at = now()
   where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists app_on_teacher_email on public.teacher_emails;
create trigger app_on_teacher_email
  after insert on public.teacher_emails
  for each row execute function public.app_promote_teacher();

-- Bổ sung hồ sơ cho tài khoản đã tồn tại trước đây
insert into public.profiles (id, email, display_name, avatar_url)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
                split_part(coalesce(u.email, ''), '@', 1), ''),
       u.raw_user_meta_data ->> 'avatar_url'
  from auth.users u
on conflict (id) do nothing;

update public.profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id and p.email is null;

-- Hạ quyền "giáo viên" tự phong từ bản cũ (chưa nằm trong teacher_emails)
update public.profiles p
   set role = 'student'
 where p.status = 'pending' and p.role = 'teacher'
   and not exists (select 1 from public.teacher_emails t where lower(t.email) = lower(p.email));

-- Tự động duyệt tất cả tài khoản Google đang chờ duyệt (giữ nguyên tài khoản bị chặn)
update public.profiles
   set status = 'approved', updated_at = now()
 where status = 'pending';

-- Đồng bộ giáo viên theo danh sách email
update public.profiles p
   set role = 'teacher', status = 'approved', can_view_private = true
  from public.teacher_emails t
 where lower(p.email) = lower(t.email);


-- ---------------------------------------------------------------------
-- 7) Máy chủ tự xoá thông tin cá nhân khỏi dữ liệu chung
-- ---------------------------------------------------------------------
create or replace function public.app_strip_private() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.data := new.data - 'role' - 'currentStudentId';
  if jsonb_typeof(new.data -> 'students') = 'array' then
    new.data := jsonb_set(new.data, '{students}', coalesce((
      select jsonb_agg(s - 'phone' - 'email' - 'address' - 'note' order by ord)
        from jsonb_array_elements(new.data -> 'students') with ordinality as t(s, ord)
    ), '[]'::jsonb));
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists app_class_state_strip on public.class_state;
create trigger app_class_state_strip
  before insert or update on public.class_state
  for each row execute function public.app_strip_private();

create or replace function public.app_stamp_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists app_private_stamp on public.student_private;
create trigger app_private_stamp before insert or update on public.student_private
  for each row execute function public.app_stamp_row();

drop trigger if exists app_notes_stamp on public.student_notes;
create trigger app_notes_stamp before insert or update on public.student_notes
  for each row execute function public.app_stamp_row();

-- Chuyển thông tin cá nhân đang nằm trong dữ liệu chung sang bảng bảo mật
insert into public.student_private (student_id, phone, email, address)
select s ->> 'id', nullif(s ->> 'phone', ''), nullif(s ->> 'email', ''), nullif(s ->> 'address', '')
  from public.class_state c,
       jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
 where c.id = 'class10t4' and s ->> 'id' is not null
   and coalesce(nullif(s ->> 'phone', ''), nullif(s ->> 'email', ''), nullif(s ->> 'address', '')) is not null
on conflict (student_id) do nothing;

insert into public.student_notes (student_id, note)
select s ->> 'id', s ->> 'note'
  from public.class_state c,
       jsonb_array_elements(coalesce(c.data -> 'students', '[]'::jsonb)) s
 where c.id = 'class10t4' and s ->> 'id' is not null and nullif(s ->> 'note', '') is not null
on conflict (student_id) do nothing;

update public.class_state set data = data where id = 'class10t4';


-- ---------------------------------------------------------------------
-- 8) Các thao tác an toàn qua máy chủ (RPC)
-- ---------------------------------------------------------------------

-- Lấy (hoặc tạo & tự động duyệt) hồ sơ của chính mình
create or replace function public.app_ensure_profile() returns json
language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  u auth.users;
  is_t boolean;
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    select * into u from auth.users where id = auth.uid();
    is_t := exists (select 1 from public.teacher_emails where lower(email) = lower(u.email));
    insert into public.profiles (id, email, display_name, avatar_url, role, status, can_view_private)
    values (
      u.id, u.email,
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name',
               split_part(coalesce(u.email, ''), '@', 1), ''),
      u.raw_user_meta_data ->> 'avatar_url',
      case when is_t then 'teacher' else 'student' end,
      'approved',
      is_t
    )
    returning * into p;
  elsif p.status = 'pending' then
    update public.profiles
       set status = 'approved', updated_at = now()
     where id = auth.uid()
    returning * into p;
  end if;
  return row_to_json(p);
end $$;

-- Đổi tên hiển thị của chính mình (không đổi được vai trò)
create or replace function public.app_rename_me(new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;
  if coalesce(trim(new_name), '') = '' then
    raise exception 'Tên không được để trống';
  end if;
  update public.profiles
     set display_name = left(trim(new_name), 60), updated_at = now()
   where id = auth.uid();
end $$;

-- Giáo viên duyệt / phân quyền / liên kết hồ sơ / chặn thành viên
create or replace function public.app_admin_update_member(
  target uuid,
  new_role text default null,
  new_status text default null,
  new_student_id text default null,
  clear_student boolean default false,
  new_can_view_private boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_teacher() then
    raise exception 'Chỉ giáo viên mới được quản lý thành viên';
  end if;
  if target = auth.uid()
     and ((new_role is not null and new_role <> 'teacher')
          or (new_status is not null and new_status <> 'approved')) then
    raise exception 'Bạn không thể tự hạ quyền hoặc tự chặn chính mình';
  end if;
  if new_role is not null and new_role not in ('teacher', 'editor', 'student') then
    raise exception 'Vai trò không hợp lệ';
  end if;
  if new_status is not null and new_status not in ('pending', 'approved', 'blocked') then
    raise exception 'Trạng thái không hợp lệ';
  end if;

  update public.profiles
     set role = coalesce(new_role, role),
         status = coalesce(new_status, status),
         student_id = case when clear_student then null else coalesce(new_student_id, student_id) end,
         can_view_private = coalesce(new_can_view_private, can_view_private),
         updated_at = now()
   where id = target;
end $$;

-- Học sinh gửi thành tích: máy chủ tự gán đúng học sinh + trạng thái "chờ duyệt"
create or replace function public.app_submit_entry(entry jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid text;
  pts int;
  clean jsonb;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  sid := public.app_my_student_id();
  if sid is null then
    raise exception 'Tài khoản chưa được liên kết với hồ sơ học sinh. Hãy nhờ GVCN liên kết.';
  end if;
  if coalesce(trim(entry ->> 'title'), '') = '' then
    raise exception 'Thiếu tên thành tích';
  end if;

  pts := least(greatest(coalesce(nullif(entry ->> 'points', '')::numeric, 0)::int, 0), 50);

  clean := jsonb_build_object(
    'id', coalesce(nullif(entry ->> 'id', ''), 'ent_' || md5(random()::text)),
    'studentId', sid,
    'title', left(trim(entry ->> 'title'), 200),
    'kind', case when entry ->> 'kind' in ('achievement', 'activity') then entry ->> 'kind' else 'activity' end,
    'category', case when entry ->> 'category' in ('study', 'sport', 'art', 'volunteer', 'skill', 'other')
                     then entry ->> 'category' else 'other' end,
    'level', case when entry ->> 'level' in ('class', 'school', 'district', 'city', 'national', 'international')
                  then entry ->> 'level' else 'class' end,
    'date', coalesce(nullif(entry ->> 'date', ''), to_char(now(), 'YYYY-MM-DD')),
    'description', left(entry ->> 'description', 2000),
    'proofUrl', left(entry ->> 'proofUrl', 500),
    'points', pts,
    'status', 'pending',
    'submittedBy', 'student',
    'reviewNote', null,
    'createdAt', now(),
    'updatedAt', now()
  );

  update public.class_state
     set data = jsonb_set(data, '{entries}',
                          jsonb_build_array(clean) || coalesce(data -> 'entries', '[]'::jsonb))
   where id = 'class10t4';
end $$;

-- Thả tim thông báo (mọi thành viên)
create or replace function public.app_like_announcement(ann_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  update public.class_state
     set data = jsonb_set(data, '{announcements}', coalesce((
       select jsonb_agg(
                case when a ->> 'id' = ann_id
                     then jsonb_set(a, '{likes}', to_jsonb(coalesce((a ->> 'likes')::int, 0) + 1))
                     else a end
                order by ord)
         from jsonb_array_elements(data -> 'announcements') with ordinality as t(a, ord)
     ), '[]'::jsonb))
   where id = 'class10t4' and jsonb_typeof(data -> 'announcements') = 'array';
end $$;


-- ---------------------------------------------------------------------
-- 9) Chính sách bảo mật theo hàng (RLS) — xoá chính sách công khai cũ
-- ---------------------------------------------------------------------
drop policy if exists "public read" on public.class_state;
drop policy if exists "public insert" on public.class_state;
drop policy if exists "public update" on public.class_state;
drop policy if exists "teachers read" on public.class_state;
drop policy if exists "teachers write" on public.class_state;
drop policy if exists "teachers update" on public.class_state;
drop policy if exists "app state select" on public.class_state;
drop policy if exists "app state insert" on public.class_state;
drop policy if exists "app state update" on public.class_state;

drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "app profiles select" on public.profiles;

drop policy if exists "app private select" on public.student_private;
drop policy if exists "app private insert" on public.student_private;
drop policy if exists "app private update" on public.student_private;
drop policy if exists "app private delete" on public.student_private;

drop policy if exists "app notes select" on public.student_notes;
drop policy if exists "app notes insert" on public.student_notes;
drop policy if exists "app notes update" on public.student_notes;
drop policy if exists "app notes delete" on public.student_notes;

-- Hàm cũ không an toàn (cho phép tự phong giáo viên)
drop function if exists public."current_role"();

alter table public.class_state enable row level security;
alter table public.profiles enable row level security;
alter table public.teacher_emails enable row level security;
alter table public.student_private enable row level security;
alter table public.student_notes enable row level security;

-- Dữ liệu lớp: chỉ thành viên đã duyệt đọc; giáo viên + cán sự được ghi
create policy "app state select" on public.class_state
  for select to authenticated using (public.app_is_member());
create policy "app state insert" on public.class_state
  for insert to authenticated with check (public.app_can_edit());
create policy "app state update" on public.class_state
  for update to authenticated using (public.app_can_edit()) with check (public.app_can_edit());

-- Hồ sơ: mỗi người xem hồ sơ của mình; giáo viên xem tất cả. Sửa chỉ qua RPC.
create policy "app profiles select" on public.profiles
  for select to authenticated using (id = auth.uid() or public.app_is_teacher());

-- Thông tin liên hệ
create policy "app private select" on public.student_private
  for select to authenticated using (public.app_can_view_private(student_id));
create policy "app private insert" on public.student_private
  for insert to authenticated
  with check (public.app_can_manage_private() or student_id = public.app_my_student_id());
create policy "app private update" on public.student_private
  for update to authenticated
  using (public.app_can_manage_private() or student_id = public.app_my_student_id())
  with check (public.app_can_manage_private() or student_id = public.app_my_student_id());
create policy "app private delete" on public.student_private
  for delete to authenticated using (public.app_is_teacher());

-- Ghi chú giáo viên
create policy "app notes select" on public.student_notes
  for select to authenticated using (public.app_can_view_notes());
create policy "app notes insert" on public.student_notes
  for insert to authenticated with check (public.app_can_manage_private());
create policy "app notes update" on public.student_notes
  for update to authenticated
  using (public.app_can_manage_private()) with check (public.app_can_manage_private());
create policy "app notes delete" on public.student_notes
  for delete to authenticated using (public.app_is_teacher());

-- teacher_emails: không ai đọc/ghi qua API (chỉ sửa trong SQL Editor)


-- ---------------------------------------------------------------------
-- 10) Quyền truy cập: người chưa đăng nhập (anon) không đụng được gì
-- ---------------------------------------------------------------------
revoke all on public.class_state from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.teacher_emails from anon, authenticated;
revoke all on public.student_private from anon, authenticated;
revoke all on public.student_notes from anon, authenticated;

grant select, insert, update on public.class_state to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.student_private to authenticated;
grant select, insert, update, delete on public.student_notes to authenticated;

revoke all on function public.app_is_member() from public, anon;
revoke all on function public.app_is_teacher() from public, anon;
revoke all on function public.app_can_edit() from public, anon;
revoke all on function public.app_my_student_id() from public, anon;
revoke all on function public.app_can_view_private(text) from public, anon;
revoke all on function public.app_can_view_notes() from public, anon;
revoke all on function public.app_can_manage_private() from public, anon;
revoke all on function public.app_ensure_profile() from public, anon;
revoke all on function public.app_rename_me(text) from public, anon;
revoke all on function public.app_admin_update_member(uuid, text, text, text, boolean, boolean) from public, anon;
revoke all on function public.app_submit_entry(jsonb) from public, anon;
revoke all on function public.app_like_announcement(text) from public, anon;
revoke all on function public.app_handle_new_user() from public, anon, authenticated;
revoke all on function public.app_promote_teacher() from public, anon, authenticated;
revoke all on function public.app_strip_private() from public, anon, authenticated;
revoke all on function public.app_stamp_row() from public, anon, authenticated;

grant execute on function public.app_is_member() to authenticated;
grant execute on function public.app_is_teacher() to authenticated;
grant execute on function public.app_can_edit() to authenticated;
grant execute on function public.app_my_student_id() to authenticated;
grant execute on function public.app_can_view_private(text) to authenticated;
grant execute on function public.app_can_view_notes() to authenticated;
grant execute on function public.app_can_manage_private() to authenticated;
grant execute on function public.app_ensure_profile() to authenticated;
grant execute on function public.app_rename_me(text) to authenticated;
grant execute on function public.app_admin_update_member(uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.app_submit_entry(jsonb) to authenticated;
grant execute on function public.app_like_announcement(text) to authenticated;


-- ---------------------------------------------------------------------
-- 11) Đồng bộ tức thì (Realtime) — vẫn tuân theo RLS ở trên
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.class_state;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;


-- ---------------------------------------------------------------------
-- 12) Bình chọn lớp (mọi thành viên đều bỏ phiếu an toàn qua RPC)
-- ---------------------------------------------------------------------
create or replace function public.app_vote_poll(poll_id text, option_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid text;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  uid := auth.uid()::text;
  update public.class_state
     set data = jsonb_set(data, '{polls}', coalesce((
       select jsonb_agg(
                case when p ->> 'id' = poll_id and coalesce((p ->> 'closed')::boolean, false) = false
                     then jsonb_set(
                            p,
                            '{votes}',
                            coalesce(p -> 'votes', '{}'::jsonb) || jsonb_build_object(uid, option_id)
                          )
                     else p end
                order by ord)
         from jsonb_array_elements(data -> 'polls') with ordinality as t(p, ord)
     ), '[]'::jsonb))
   where id = 'class10t4' and jsonb_typeof(data -> 'polls') = 'array';
end $$;

revoke all on function public.app_vote_poll(text, text) from public, anon;
grant execute on function public.app_vote_poll(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 13) Hộp thư góp ý bảo mật gửi GVCN (học sinh không đọc được tin của nhau)
-- ---------------------------------------------------------------------
create table if not exists public.class_feedback (
  id text primary key,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  author_name text not null default '',
  anonymous boolean not null default true,
  category text not null default 'suggestion'
    check (category in ('suggestion', 'question', 'praise', 'concern')),
  content text not null,
  reply text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

drop policy if exists "app feedback select" on public.class_feedback;
drop policy if exists "app feedback insert" on public.class_feedback;
drop policy if exists "app feedback update" on public.class_feedback;
drop policy if exists "app feedback delete" on public.class_feedback;

alter table public.class_feedback enable row level security;

create policy "app feedback select" on public.class_feedback
  for select to authenticated
  using (public.app_is_teacher() or author_id = auth.uid());

create policy "app feedback insert" on public.class_feedback
  for insert to authenticated
  with check (public.app_is_member() and author_id = auth.uid());

create policy "app feedback update" on public.class_feedback
  for update to authenticated
  using (public.app_is_teacher()) with check (public.app_is_teacher());

create policy "app feedback delete" on public.class_feedback
  for delete to authenticated
  using (public.app_is_teacher());

revoke all on public.class_feedback from anon, authenticated;
grant select, insert, update, delete on public.class_feedback to authenticated;


-- ---------------------------------------------------------------------
-- 14) Bức tường Kudos & Vinh danh (mọi thành viên đều gửi & vỗ tay an toàn)
-- ---------------------------------------------------------------------
create or replace function public.app_send_kudos(kudos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  clean jsonb;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  if coalesce(trim(kudos ->> 'toStudentId'), '') = '' or coalesce(trim(kudos ->> 'message'), '') = '' then
    raise exception 'Thiếu người nhận hoặc lời khen';
  end if;

  clean := jsonb_build_object(
    'id', coalesce(nullif(kudos ->> 'id', ''), 'kud_' || md5(random()::text)),
    'toStudentId', kudos ->> 'toStudentId',
    'fromName', case when coalesce((kudos ->> 'anonymous')::boolean, false)
                     then 'Bạn giấu tên'
                     else left(coalesce(nullif(trim(kudos ->> 'fromName'), ''), 'Thành viên 10T4'), 60) end,
    'anonymous', coalesce((kudos ->> 'anonymous')::boolean, false),
    'sticker', case when kudos ->> 'sticker' in ('star_learner', 'deadline_hero', 'positive_vibes', 'team_carry', 'funny_soul', 'thank_you')
                    then kudos ->> 'sticker' else 'positive_vibes' end,
    'message', left(trim(kudos ->> 'message'), 500),
    'claps', 1,
    'createdAt', now()
  );

  update public.class_state
     set data = jsonb_set(data, '{kudos}',
                          jsonb_build_array(clean) || coalesce(data -> 'kudos', '[]'::jsonb))
   where id = 'class10t4';
end $$;

create or replace function public.app_clap_kudos(kudos_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  update public.class_state
     set data = jsonb_set(data, '{kudos}', coalesce((
       select jsonb_agg(
                case when k ->> 'id' = kudos_id
                     then jsonb_set(k, '{claps}', to_jsonb(coalesce((k ->> 'claps')::int, 0) + 1))
                     else k end
                order by ord)
         from jsonb_array_elements(data -> 'kudos') with ordinality as t(k, ord)
     ), '[]'::jsonb))
   where id = 'class10t4' and jsonb_typeof(data -> 'kudos') = 'array';
end $$;

revoke all on function public.app_send_kudos(jsonb) from public, anon;
revoke all on function public.app_clap_kudos(text) from public, anon;
grant execute on function public.app_send_kudos(jsonb) to authenticated;
grant execute on function public.app_clap_kudos(text) to authenticated;


-- ---------------------------------------------------------------------
-- 15) Kho tài liệu & đề cương lớp (mọi thành viên đều có thể đóng góp tài liệu)
-- ---------------------------------------------------------------------
create or replace function public.app_add_resource(resource jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  clean jsonb;
begin
  if not public.app_is_member() then
    raise exception 'Bạn chưa được duyệt vào lớp';
  end if;
  if coalesce(trim(resource ->> 'title'), '') = '' or coalesce(trim(resource ->> 'url'), '') = '' then
    raise exception 'Thiếu tiêu đề hoặc liên kết tài liệu';
  end if;

  clean := jsonb_build_object(
    'id', coalesce(nullif(resource ->> 'id', ''), 'res_' || md5(random()::text)),
    'title', left(trim(resource ->> 'title'), 200),
    'subject', left(coalesce(nullif(trim(resource ->> 'subject'), ''), 'Chung'), 60),
    'type', case when resource ->> 'type' in ('outline', 'slide', 'exercise', 'video', 'link')
                 then resource ->> 'type' else 'link' end,
    'url', left(trim(resource ->> 'url'), 600),
    'description', left(resource ->> 'description', 600),
    'pinned', false,
    'author', left(coalesce(nullif(trim(resource ->> 'author'), ''), 'Thành viên 10T4'), 60),
    'createdAt', now()
  );

  update public.class_state
     set data = jsonb_set(data, '{resources}',
                          jsonb_build_array(clean) || coalesce(data -> 'resources', '[]'::jsonb))
   where id = 'class10t4';
end $$;

revoke all on function public.app_add_resource(jsonb) from public, anon;
grant execute on function public.app_add_resource(jsonb) to authenticated;


