create table if not exists public.knowledge_terms (
  user_id text primary key,
  terms jsonb not null default '{}'::jsonb,
  product jsonb not null default '{}'::jsonb,
  model_config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_templates (
  user_id text primary key,
  templates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_profiles (
  id text primary key,
  user_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists product_profiles_user_updated_idx
  on public.product_profiles (user_id, updated_at desc);

create table if not exists public.hotspot_imports (
  id bigserial primary key,
  user_id text not null,
  raw_text text not null,
  hotspots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists hotspot_imports_user_created_idx
  on public.hotspot_imports (user_id, created_at desc);

create table if not exists public.notes (
  id text primary key,
  user_id text not null,
  data jsonb not null default '{}'::jsonb,
  publish_status text not null default 'draft' check (publish_status in ('draft', 'published')),
  batch_id text,
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create table if not exists public.generation_batches (
  id text primary key,
  user_id text not null,
  product_name text,
  note_ids jsonb not null default '[]'::jsonb,
  notes_snapshot jsonb not null default '[]'::jsonb,
  count integer not null default 0,
  stage text,
  created_at timestamptz not null default now()
);

create index if not exists generation_batches_user_created_idx
  on public.generation_batches (user_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;
