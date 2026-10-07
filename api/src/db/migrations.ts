// Schema migrations, applied in order by the migrate function (as the cluster's master user).
// The API connects as APP_ROLE, which owns nothing and has no BYPASSRLS, so every query it runs
// is filtered by the row-level security policies below. Each API transaction first sets
// app.user_sub to the caller's Cognito subject; policies read it through app.current_sub().

export const APP_ROLE = 'co2trace_app';

export const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** One migration as one statement, so it applies atomically together with its bookkeeping row. */
export const migrationStatement = (m: { id: string; sql: string }) =>
  `do $migration$ begin execute ${quote(m.sql)}; insert into schema_migrations (id) values (${quote(m.id)}); end $migration$`;

export const migrations: { id: string; sql: string }[] = [
  {
    id: '001_core',
    sql: `
create schema if not exists app;

-- Declaration order is privilege order, so roles compare with >=.
create type member_role as enum ('viewer', 'editor', 'admin', 'owner');

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  country text not null default 'mx' check (country in ('mx', 'us')),
  data_region text not null default 'us' check (data_region in ('us', 'mx')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table memberships (
  company_id uuid not null references companies on delete cascade,
  user_sub text not null,
  email text not null,
  role member_role not null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_sub)
);
create index memberships_user on memberships (user_sub);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  email text not null check (email = lower(email)),
  role member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by text
);
create index invitations_company on invitations (company_id);

create table inventories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  year int not null check (year between 1990 and 2100),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (company_id, year)
);

create table lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  inventory_id uuid not null references inventories on delete cascade,
  client_id text,
  position int not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  unique (inventory_id, client_id)
);
create index lines_inventory on lines (inventory_id, position);

create table evidence_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  line_id uuid not null references lines on delete cascade,
  s3_key text not null unique,
  name text not null check (length(name) between 1 and 255),
  size bigint not null check (size > 0),
  content_type text not null,
  status text not null default 'pending' check (status in ('pending', 'stored')),
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);
create index evidence_line on evidence_files (line_id);

create table audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  user_sub text,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb,
  at timestamptz not null default now()
);
create index audit_company on audit_log (company_id, at desc);

-- Caller identity and membership helpers
create function app.current_sub() returns text language sql stable as $$
  select nullif(current_setting('app.user_sub', true), '')
$$;

create function app.role_in(cid uuid) returns member_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from memberships where company_id = cid and user_sub = app.current_sub()
$$;

create function app.has_role(cid uuid, min member_role) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(app.role_in(cid) >= min, false)
$$;

-- Row-level security: viewers read, editors write ledger data, admins manage people
alter table companies enable row level security;
create policy companies_read on companies for select using (app.has_role(id, 'viewer'));
create policy companies_update on companies for update using (app.has_role(id, 'admin')) with check (app.has_role(id, 'admin'));
create policy companies_delete on companies for delete using (app.has_role(id, 'owner'));

alter table memberships enable row level security;
create policy memberships_read on memberships for select using (app.has_role(company_id, 'viewer'));
create policy memberships_update on memberships for update using (app.has_role(company_id, 'admin')) with check (app.has_role(company_id, 'admin'));
create policy memberships_delete on memberships for delete
  using (app.has_role(company_id, 'admin') or user_sub = app.current_sub());

alter table invitations enable row level security;
create policy invitations_admin on invitations for all
  using (app.has_role(company_id, 'admin')) with check (app.has_role(company_id, 'admin'));

alter table inventories enable row level security;
create policy inventories_read on inventories for select using (app.has_role(company_id, 'viewer'));
create policy inventories_write on inventories for insert with check (app.has_role(company_id, 'editor'));
create policy inventories_update on inventories for update using (app.has_role(company_id, 'editor')) with check (app.has_role(company_id, 'editor'));
create policy inventories_delete on inventories for delete using (app.has_role(company_id, 'admin'));

alter table lines enable row level security;
create policy lines_read on lines for select using (app.has_role(company_id, 'viewer'));
create policy lines_insert on lines for insert with check (
  app.has_role(company_id, 'editor')
  and exists (select 1 from inventories i where i.id = inventory_id and i.company_id = lines.company_id));
create policy lines_update on lines for update using (app.has_role(company_id, 'editor')) with check (app.has_role(company_id, 'editor'));
create policy lines_delete on lines for delete using (app.has_role(company_id, 'editor'));

alter table evidence_files enable row level security;
create policy files_read on evidence_files for select using (app.has_role(company_id, 'viewer'));
create policy files_insert on evidence_files for insert with check (
  app.has_role(company_id, 'editor')
  and exists (select 1 from lines l where l.id = line_id and l.company_id = evidence_files.company_id));
create policy files_update on evidence_files for update using (app.has_role(company_id, 'editor')) with check (app.has_role(company_id, 'editor'));
create policy files_delete on evidence_files for delete using (app.has_role(company_id, 'editor'));

-- The audit log is append-only and written by triggers; members can read their company's entries.
alter table audit_log enable row level security;
create policy audit_read on audit_log for select using (app.has_role(company_id, 'viewer'));

create function app.audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  cid uuid := coalesce(r->>'company_id', r->>'id')::uuid;
  eid text := coalesce(r->>'user_sub', r->>'id');
  det jsonb;
begin
  det := case tg_table_name
    when 'lines' then jsonb_build_object('before', o->'data', 'after', n->'data')
    when 'memberships' then jsonb_build_object('email', r->'email', 'role', r->'role', 'from', case when tg_op = 'UPDATE' then o->'role' end)
    when 'evidence_files' then jsonb_build_object('name', r->'name', 'line', r->'line_id', 'status', r->'status')
    when 'inventories' then jsonb_build_object('year', r->'year')
    when 'invitations' then jsonb_build_object('email', r->'email', 'role', r->'role', 'accepted', r->'accepted_at' <> 'null'::jsonb)
    else jsonb_build_object('name', r->'name')
  end;
  if not exists (select 1 from companies where id = cid) then
    return null; -- company deleted: its log goes with it
  end if;
  insert into audit_log (company_id, user_sub, action, entity, entity_id, detail)
  values (cid, app.current_sub(), lower(tg_op), tg_table_name, eid, det);
  return null;
end $$;

create trigger audit_companies after insert or update on companies for each row execute function app.audit();
create trigger audit_memberships after insert or update or delete on memberships for each row execute function app.audit();
create trigger audit_invitations after insert or update or delete on invitations for each row execute function app.audit();
create trigger audit_inventories after insert or update or delete on inventories for each row execute function app.audit();
create trigger audit_lines after insert or update or delete on lines for each row execute function app.audit();
create trigger audit_files after insert or update or delete on evidence_files for each row execute function app.audit();

create function app.cascade_audit_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from audit_log where company_id = old.id;
  return old;
end $$;
create trigger companies_audit_cleanup after delete on companies for each row execute function app.cascade_audit_delete();

-- Creating a company makes the caller its owner in one step (a policy can't, since no membership exists yet).
create function app.create_company(p_name text, p_country text, p_region text, p_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; sub text := app.current_sub();
begin
  if sub is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into companies (name, country, data_region, created_by) values (p_name, p_country, p_region, sub) returning id into cid;
  insert into memberships (company_id, user_sub, email, role) values (cid, sub, lower(p_email), 'owner');
  return cid;
end $$;

-- Accepting an invitation: the token must be unexpired and unused, and addressed to the caller's verified email.
create function app.accept_invitation(p_token_hash text, p_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv invitations; sub text := app.current_sub();
begin
  if sub is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into inv from invitations where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invitation invalid or expired' using errcode = 'P0002';
  end if;
  if inv.email <> lower(p_email) then
    raise exception 'invitation is for a different email' using errcode = '42501';
  end if;
  insert into memberships (company_id, user_sub, email, role) values (inv.company_id, sub, lower(p_email), inv.role)
    on conflict (company_id, user_sub) do update set role = greatest(memberships.role, excluded.role);
  update invitations set accepted_at = now(), accepted_by = sub where id = inv.id;
  return inv.company_id;
end $$;

-- A company always keeps at least one owner.
create function app.keep_an_owner() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from companies where id = old.company_id)
     and not exists (select 1 from memberships where company_id = old.company_id and role = 'owner' and user_sub <> old.user_sub) then
    raise exception 'a company needs at least one owner' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger memberships_keep_owner before update or delete on memberships for each row execute function app.keep_an_owner();
`,
  },
];

// Grants for the API role, re-applied after every migration run.
export const grantsSql = `
grant usage on schema app to ${APP_ROLE};
grant select, insert, update, delete on companies, memberships, invitations, inventories, lines, evidence_files to ${APP_ROLE};
grant select on audit_log to ${APP_ROLE};
grant execute on all functions in schema app to ${APP_ROLE};
`;
