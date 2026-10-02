-- DocuMind AI — Supabase/Postgres schema
-- Replaces the previous MongoDB collections (User, UserDocument, UserQuestion, ShareLink, ActivityLog).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE).

create extension if not exists pgcrypto;

-- ─── 1. USERS (auth + profile) ─────────────────────────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password text not null,
  name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  phone text not null default '',
  address text not null default '',
  total_queries integer not null default 0,
  current_step integer not null default 1,
  storage_used bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_users_email on users (email);

-- ─── 2. USER DOCUMENTS ──────────────────────────────────────────────────────
create table if not exists user_documents (
  id uuid primary key default gen_random_uuid(),
  doc_id text not null,              -- app-level short id (generated client/server side)
  user_email text not null,
  name text not null,
  size bigint not null default 0,
  type text not null default '',
  url text not null default '',
  content text not null default '',  -- base64 file bytes
  summary text not null default '',
  document_type text not null default 'General',
  tags text[] not null default '{}',
  uploaded_at timestamptz not null default now(),
  nodes jsonb not null default '[]',
  edges jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, name)
);
create index if not exists idx_user_documents_email on user_documents (user_email);
create index if not exists idx_user_documents_doc_id on user_documents (doc_id);

-- ─── 3. USER QUESTIONS ──────────────────────────────────────────────────────
create table if not exists user_questions (
  id uuid primary key default gen_random_uuid(),
  q_id text not null,
  user_email text not null,
  text text not null,
  answer text not null default '',
  citation text not null default '',
  confidence integer not null default 95,
  sources text[] not null default '{}',
  document_name text not null default '',
  found_in_document boolean not null default true,
  "timestamp" timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_user_questions_email on user_questions (user_email);

-- ─── 4. SHARE LINKS ─────────────────────────────────────────────────────────
create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique,
  user_email text not null,
  document_names text[] not null default '{}',
  answers jsonb not null default '[]',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists idx_share_links_share_id on share_links (share_id);

-- ─── 5. ACTIVITY LOGS ───────────────────────────────────────────────────────
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  action text not null,
  details text not null default '',
  "timestamp" timestamptz not null default now()
);
create index if not exists idx_activity_logs_email on activity_logs (user_email);
create index if not exists idx_activity_logs_timestamp on activity_logs ("timestamp" desc);

-- ─── updated_at auto-touch trigger (users, user_documents) ─────────────────
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_user_documents_updated_at on user_documents;
create trigger trg_user_documents_updated_at before update on user_documents
  for each row execute function set_updated_at();
