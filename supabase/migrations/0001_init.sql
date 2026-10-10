-- ============================================================================
-- TradePro CRM — Initial Schema
-- Schema for a service-business CRM (plumbers, electricians, roofers).
-- Tables deliberately avoid "user" naming (user is reserved) and use
-- UUID PKs with Row Level Security (RLS) enabled throughout.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, mirrored automatically via trigger)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '',
  business_name text not null default '',
  business_type text not null default '' check (business_type in ('', 'plumbing', 'electrical', 'roofing', 'hvac', 'landscaping', 'general', 'other')),
  phone         text not null default '',
  email         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- Clients (stored accounts / contacts)
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  first_name    text not null,
  last_name     text not null default '',
  email         text not null,
  phone         text not null default '',
  address       text not null default '',
  city          text not null default '',
  state         text not null default '',
  zip           text not null default '',
  property_type text not null default '' check (property_type in ('residential', 'commercial', '')),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists clients_user_idx on public.clients (user_id);
create index if not exists clients_email_idx on public.clients (user_id, lower(email));

alter table public.clients enable row level security;

create policy "Users can view own clients"
  on public.clients for select
  using (auth.uid() = user_id);

create policy "Users can insert own clients"
  on public.clients for insert
  with check (auth.uid() = user_id);

create policy "Users can update own clients"
  on public.clients for update
  using (auth.uid() = user_id);

create policy "Users can delete own clients"
  on public.clients for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Leads (prospects captured from the website / widget / manual entry)
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  first_name    text not null default '',
  last_name     text not null default '',
  email         text not null,
  phone         text not null default '',
  service       text not null default '' check (service in ('plumbing', 'electrical', 'roofing', 'hvac', 'landscaping', 'other', '')),
  message       text not null default '',
  source        text not null default 'website' check (source in ('website', 'widget', 'manual', 'import', 'other')),
  status        text not null default 'new'
                check (status in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  estimated_value numeric(10,2) not null default 0,
  captured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists leads_user_idx on public.leads (user_id);
create index if not exists leads_status_idx on public.leads (user_id, status);
create index if not exists leads_email_idx on public.leads (user_id, lower(email));

alter table public.leads enable row level security;

create policy "Users can view own leads"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "Users can insert own leads"
  on public.leads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own leads"
  on public.leads for update
  using (auth.uid() = user_id);

create policy "Users can delete own leads"
  on public.leads for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Projects (jobs — tied to a client, optionally to a lead)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  lead_id         uuid references public.leads (id) on delete set null,
  title           text not null,
  slug            text not null default '',
  scope           text not null default '',
  status          text not null default 'new'
                  check (status in ('new', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  requested_date  date,
  scheduled_date  date,
  completion_date date,
  est_value       numeric(10,2) not null default 0,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Generated slug is cosmetic; we use the PK for lookups.
create index if not exists projects_user_idx on public.projects (user_id);
create index if not exists projects_client_idx on public.projects (client_id);
create index if not exists projects_status_idx on public.projects (user_id, status);

alter table public.projects enable row level security;

create policy "Users can view own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Email captures (visitor email capture tracking for the marketing widget)
-- ----------------------------------------------------------------------------
create table if not exists public.email_captures (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  email       text not null,
  capture_source text not null default 'website' check (capture_source in ('website', 'widget', 'landing', 'promo', 'other')),
  full_name   text not null default '',
  phone       text not null default '',
  message     text not null default '',
  ip_address  text not null default '',
  user_agent  text not null default '',
  lead_id     uuid references public.leads (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists email_captures_user_idx on public.email_captures (user_id);
create index if not exists email_captures_email_idx on public.email_captures (user_id, lower(email));

alter table public.email_captures enable row level security;

create policy "Users can view own email captures"
  on public.email_captures for select
  using (auth.uid() = user_id);

create policy "Users can insert own email captures"
  on public.email_captures for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own email captures"
  on public.email_captures for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Email log (every automated email sent via Resend — auditable trail)
-- ----------------------------------------------------------------------------
create table if not exists public.email_logs (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  lead_id    uuid references public.leads (id) on delete set null,
  client_id  uuid references public.clients (id) on delete set null,
  to_email   text not null,
  subject    text not null,
  template   text not null,
  status     text not null default 'sent' check (status in ('sent', 'failed', 'pending')),
  provider   text not null default 'resend' check (provider in ('resend', 'console')),
  sent_at    timestamptz not null default now()
);

create index if not exists email_logs_user_idx on public.email_logs (user_id);

alter table public.email_logs enable row level security;

create policy "Users can view own email logs"
  on public.email_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert email logs"
  on public.email_logs for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Settings (per-user customizations — business profile, Resend config, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.settings (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null default '',
  business_type text not null default '',
  reply_to_email text not null default '',
  currency  text not null default 'USD',
  email_notifications bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "Users can view own settings"
  on public.settings for select
  using (auth.uid() = user_id);

create policy "Users can insert own settings"
  on public.settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.settings for update
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Auto-update updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists settings_updated_at on public.settings;
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-create profile + settings when a new user signs up via Supabase Auth
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, business_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'business_name', ''), new.email)
  on conflict (id) do nothing;

  insert into public.settings (id, business_name, business_type, reply_to_email)
  values (new.id, coalesce(new.raw_user_meta_data->>'business_name', ''), coalesce(new.raw_user_meta_data->>'business_type', ''), new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();