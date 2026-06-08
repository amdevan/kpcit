-- User/admin audit logs
-- Records actions like create/update/delete across modules, role changes, and access changes.

create table if not exists public.user_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null,
  entity text null,
  entity_id text null,
  target_user_id uuid null,
  route text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_audit_logs_created_at_idx on public.user_audit_logs(created_at desc);
create index if not exists user_audit_logs_actor_idx on public.user_audit_logs(actor_user_id);
create index if not exists user_audit_logs_target_idx on public.user_audit_logs(target_user_id);
create index if not exists user_audit_logs_entity_idx on public.user_audit_logs(entity, entity_id);

alter table public.user_audit_logs enable row level security;

-- Admin can read all logs
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_audit_logs'
      and policyname = 'admin_read_user_audit_logs'
  ) then
    create policy admin_read_user_audit_logs
      on public.user_audit_logs
      for select
      to authenticated
      using (public.has_role('admin'::public.app_role, auth.uid()));
  end if;
end $$;

-- Admin can insert logs (from client)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_audit_logs'
      and policyname = 'admin_insert_user_audit_logs'
  ) then
    create policy admin_insert_user_audit_logs
      on public.user_audit_logs
      for insert
      to authenticated
      with check (
        public.has_role('admin'::public.app_role, auth.uid())
        and actor_user_id = auth.uid()
      );
  end if;
end $$;

