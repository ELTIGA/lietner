-- Lietner sync schema.
--
-- Each device keeps its decks and cards in IndexedDB (the source of truth). These tables are
-- a per-account mirror that devices push to and pull from:
--   * updated_at is the edit time used for last-write-wins, capped at the server clock;
--   * server_at is when the server stored the row, and is the cursor devices pull from
--     (an offline edit pushed days later keeps its old updated_at but gets a fresh server_at);
--   * deleted_at marks a tombstone. Deletions are final and always win.
-- Grade history never leaves the device, so it has no column here.

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.decks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null check (char_length(name) <= 80),
  sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.decks is 'Per-account mirror of the decks in each device''s IndexedDB.';

create table public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  deck_id text not null,
  front text not null check (char_length(front) <= 1000),
  back text not null check (char_length(back) <= 1000),
  box smallint not null check (box between 1 and 6),
  -- Local calendar day number; mastered cards use Number.MAX_SAFE_INTEGER, hence bigint.
  due_day bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

comment on table public.cards is 'Per-account mirror of the cards in each device''s IndexedDB (without grade history).';

-- Devices pull with keyset paging on (server_at, id).
create index decks_pull_idx on public.decks (user_id, server_at, id);
create index cards_pull_idx on public.cards (user_id, server_at, id);
-- Deck tombstones cascade to their cards; foreign key lookups.
create index cards_deck_idx on public.cards (user_id, deck_id);
-- Limit checks count live rows.
create index decks_live_idx on public.decks (user_id) where deleted_at is null;
create index cards_live_idx on public.cards (user_id) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: every row belongs to exactly one account and only that account sees it.
-- ---------------------------------------------------------------------------------------------

alter table public.decks enable row level security;
alter table public.cards enable row level security;

create policy "Owners read their decks" on public.decks for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners add their decks" on public.decks for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners change their decks" on public.decks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners delete their decks" on public.decks for delete to authenticated using (user_id = (select auth.uid()));

create policy "Owners read their cards" on public.cards for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners add their cards" on public.cards for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners change their cards" on public.cards for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owners delete their cards" on public.cards for delete to authenticated using (user_id = (select auth.uid()));

-- Signed-out visitors never touch these tables.
revoke all on public.decks, public.cards from anon;

-- ---------------------------------------------------------------------------------------------
-- Write rules (run before every insert and update)
-- ---------------------------------------------------------------------------------------------

-- Shared rules: cap edit times at the server clock, stamp server_at, keep deletions final,
-- and let the newer edit win.
create function public.sync_write_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A device with a fast clock can't claim an edit from the future and win every conflict.
  new.updated_at := least(new.updated_at, now());
  if new.deleted_at is not null then
    new.deleted_at := least(new.deleted_at, now());
  end if;
  new.server_at := now();

  if tg_op = 'UPDATE' then
    -- Deletions are final: nothing brings a tombstone back.
    if old.deleted_at is not null then
      return null;
    end if;
    -- Last write wins per row: an older edit never overwrites a newer one. Deletions always win.
    if new.deleted_at is null and new.updated_at <= old.updated_at then
      return null;
    end if;
  end if;
  return new;
end;
$$;

create function public.decks_write_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A tombstone keeps only what's needed to sync the deletion.
  if new.deleted_at is not null then
    new.name := '';
  end if;
  return new;
end;
$$;

create function public.cards_write_rules() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A card in a deleted deck is deleted too, even if it was edited or created offline later.
  if new.deleted_at is null and exists (
    select 1 from public.decks d
    where d.user_id = new.user_id and d.id = new.deck_id and d.deleted_at is not null
  ) then
    new.deleted_at := now();
  end if;
  if new.deleted_at is not null then
    new.front := '';
    new.back := '';
  end if;
  return new;
end;
$$;

-- Triggers fire in name order: the shared rules (a_) run before the per-table ones (b_).
create trigger a_sync_write_rules before insert or update on public.decks
  for each row execute function public.sync_write_rules();
create trigger b_decks_write_rules before insert or update on public.decks
  for each row execute function public.decks_write_rules();
create trigger a_sync_write_rules before insert or update on public.cards
  for each row execute function public.sync_write_rules();
create trigger b_cards_write_rules before insert or update on public.cards
  for each row execute function public.cards_write_rules();

-- Deleting a deck deletes its cards, so other devices pull the card tombstones too.
create function public.decks_cascade_delete() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.cards
  set deleted_at = new.deleted_at, updated_at = new.updated_at
  where user_id = new.user_id and deck_id = new.id and deleted_at is null;
  return null;
end;
$$;

create trigger decks_cascade_delete after update of deleted_at on public.decks
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.decks_cascade_delete();

-- ---------------------------------------------------------------------------------------------
-- Per-account limits: 100 decks and 5,000 cards (live rows; checked once per statement)
-- ---------------------------------------------------------------------------------------------

create function public.decks_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.decks d
    where d.user_id in (select distinct user_id from inserted) and d.deleted_at is null
    group by d.user_id having count(*) > 100
  ) then
    raise exception 'LIMIT_DECKS: an account can have up to 100 decks' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create function public.cards_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cards c
    where c.user_id in (select distinct user_id from inserted) and c.deleted_at is null
    group by c.user_id having count(*) > 5000
  ) then
    raise exception 'LIMIT_CARDS: an account can have up to 5,000 cards' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- Tombstones are final, so only inserts can raise the live count.
create trigger decks_limit after insert on public.decks
  referencing new table as inserted for each statement execute function public.decks_limit();
create trigger cards_limit after insert on public.cards
  referencing new table as inserted for each statement execute function public.cards_limit();

-- ---------------------------------------------------------------------------------------------
-- Account deletion: removes the caller's auth user; the foreign keys cascade to all their data.
-- ---------------------------------------------------------------------------------------------

create function public.delete_account() returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

comment on function public.delete_account() is 'Deletes the signed-in account and, by cascade, all of its decks and cards.';

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- Trigger functions are never called directly.
revoke execute on function public.sync_write_rules(), public.decks_write_rules(), public.cards_write_rules(),
  public.decks_cascade_delete(), public.decks_limit(), public.cards_limit() from public, anon, authenticated;
