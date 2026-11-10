begin;

create table public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'lifetime')),
  created_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;
grant select on public.account_entitlements to authenticated;
create policy "Read own entitlement" on public.account_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.create_trial_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.account_entitlements (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_trial_account() from public, anon, authenticated;
create trigger create_lumina_trial after insert on auth.users
  for each row execute function public.create_trial_account();

insert into public.account_entitlements (user_id)
  select id from auth.users on conflict (user_id) do nothing;

commit;
