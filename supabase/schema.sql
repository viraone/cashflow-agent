create table if not exists public.profiles (
  id uuid primary key,
  username text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_position (
  id uuid primary key references public.profiles(id) on delete cascade,
  available_cash numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.obligations (
  id text primary key,
  name text not null,
  category text not null,
  amount numeric(12, 2),
  due_date date,
  is_paid boolean not null default false,
  paid_date date,
  amount_label text,
  updated_at timestamptz not null default now()
);

create table if not exists public.grocery_transactions (
  id text primary key,
  merchant text not null,
  amount numeric(12, 2) not null check (amount > 0),
  date date not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists cash_position_set_updated_at on public.cash_position;
create trigger cash_position_set_updated_at
before update on public.cash_position
for each row execute function public.set_updated_at();

drop trigger if exists obligations_set_updated_at on public.obligations;
create trigger obligations_set_updated_at
before update on public.obligations
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.cash_position enable row level security;
alter table public.obligations enable row level security;
alter table public.grocery_transactions enable row level security;

drop policy if exists "Allow dashboard profile reads" on public.profiles;
create policy "Allow dashboard profile reads"
on public.profiles for select
to anon
using (true);

drop policy if exists "Allow dashboard cash reads" on public.cash_position;
create policy "Allow dashboard cash reads"
on public.cash_position for select
to anon
using (true);

drop policy if exists "Allow dashboard cash updates" on public.cash_position;
create policy "Allow dashboard cash updates"
on public.cash_position for update
to anon
using (true)
with check (true);

drop policy if exists "Allow dashboard obligation reads" on public.obligations;
create policy "Allow dashboard obligation reads"
on public.obligations for select
to anon
using (true);

drop policy if exists "Allow dashboard obligation updates" on public.obligations;
create policy "Allow dashboard obligation updates"
on public.obligations for update
to anon
using (true)
with check (true);

drop policy if exists "Allow dashboard grocery reads" on public.grocery_transactions;
create policy "Allow dashboard grocery reads"
on public.grocery_transactions for select
to anon
using (true);

drop policy if exists "Allow dashboard grocery inserts" on public.grocery_transactions;
create policy "Allow dashboard grocery inserts"
on public.grocery_transactions for insert
to anon
with check (true);

insert into public.profiles (id, username)
values ('00000000-0000-0000-0000-000000000001', 'viraone')
on conflict (id) do update
set username = excluded.username;

insert into public.cash_position (id, available_cash)
values ('00000000-0000-0000-0000-000000000001', 5954.86)
on conflict (id) do nothing;

insert into public.obligations (
  id,
  name,
  category,
  amount,
  due_date,
  is_paid,
  paid_date,
  amount_label
)
values
  ('pilot-apartments', 'Pilot Apartments', 'Housing', 1500.00, '2026-07-01', false, null, null),
  ('paypal-credit-card', 'PayPal Credit Card', 'Credit card', 1150.18, '2026-07-10', false, null, 'Balance owed'),
  ('xfinity-internet', 'Xfinity Internet', 'Internet', 80.00, '2026-07-15', false, null, null),
  ('xfinity-mobile', 'Xfinity Mobile', 'Phone', 45.00, '2026-07-15', false, null, null),
  ('becu-personal-loan', 'BECU Personal Loan', 'Loan', 350.00, '2026-07-20', false, null, null),
  ('becu-credit-card', 'BECU Credit Card', 'Credit card', 200.00, '2026-07-25', false, null, null),
  ('seattle-city-lights', 'Seattle City Light', 'Electric utility', 90.00, '2026-07-18', false, null, null),
  ('progressive-insurance', 'Progressive Insurance', 'Insurance', 110.00, '2026-07-12', false, null, null)
on conflict (id) do nothing;
