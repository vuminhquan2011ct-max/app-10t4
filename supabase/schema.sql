-- Chạy file này một lần trong Supabase: SQL Editor -> New query -> Run
create table if not exists class_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table class_state enable row level security;

create policy "public read" on class_state for select using (true);
create policy "public insert" on class_state for insert with check (true);
create policy "public update" on class_state for update using (true) with check (true);
