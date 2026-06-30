create table if not exists public.notify_subscribers (
  id uuid primary key default gen_random_uuid(),
  product_sku text not null,
  email text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (product_sku, email)
);

grant select, insert on public.notify_subscribers to authenticated;
grant insert on public.notify_subscribers to anon;
grant all on public.notify_subscribers to service_role;

alter table public.notify_subscribers enable row level security;

create policy "anyone can subscribe"
  on public.notify_subscribers
  for insert
  to anon, authenticated
  with check (true);
