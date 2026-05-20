do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_ups_patient_id_fkey'
  ) then
    alter table public.follow_ups
      add constraint follow_ups_patient_id_fkey
      foreign key (patient_id) references public.patients(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_ups_inquiry_id_fkey'
  ) then
    alter table public.follow_ups
      add constraint follow_ups_inquiry_id_fkey
      foreign key (inquiry_id) references public.inquiries(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_follow_ups_patient_id on public.follow_ups(patient_id);
create index if not exists idx_follow_ups_inquiry_id on public.follow_ups(inquiry_id);

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
