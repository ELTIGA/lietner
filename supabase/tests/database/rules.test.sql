-- Write rules: last write wins, clock cap, final deletions, deck cascade, limits, account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.dev', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.dev', 'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-000000000003', 'c@test.dev', 'authenticated', 'authenticated');

create function pg_temp.act_as(account uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', account, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

-- What a device push looks like: PostgREST upsert of the whole row.
create function pg_temp.push_card(card_id text, deck text, new_front text, edited timestamptz, deleted timestamptz default null) returns void
language sql as $$
  insert into public.cards (id, deck_id, front, back, box, due_day, updated_at, deleted_at)
  values (card_id, deck, new_front, 'back', 1, 20000, edited, deleted)
  on conflict (user_id, id) do update
  set front = excluded.front, deck_id = excluded.deck_id, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at;
$$;
grant execute on function pg_temp.push_card(text, text, text, timestamptz, timestamptz) to authenticated;

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.decks (id, name, updated_at) values ('d1', 'Deck', now() - interval '1 hour');
select pg_temp.push_card('c1', 'd1', 'v1', now() - interval '10 minutes');

-- Last write wins.
select pg_temp.push_card('c1', 'd1', 'older', now() - interval '20 minutes');
select is((select front from public.cards where id = 'c1'), 'v1', 'an older edit does not overwrite a newer one');
select pg_temp.push_card('c1', 'd1', 'same time', now() - interval '10 minutes');
select is((select front from public.cards where id = 'c1'), 'v1', 'an edit with the same time does not overwrite');
select pg_temp.push_card('c1', 'd1', 'newer', now() - interval '5 minutes');
select is((select front from public.cards where id = 'c1'), 'newer', 'a newer edit wins');
select is((select server_at from public.cards where id = 'c1'), now(), 'every accepted write stamps server_at');

-- A fast device clock is capped at the server clock.
select pg_temp.push_card('c1', 'd1', 'from the future', now() + interval '1 day');
select is((select updated_at from public.cards where id = 'c1'), now(), 'updated_at is capped at now()');
select is((select front from public.cards where id = 'c1'), 'from the future', 'the capped edit still applies');

-- Deletions are final and always win.
select pg_temp.push_card('c1', 'd1', 'deleted', now() - interval '1 hour', now() - interval '1 hour');
select isnt((select deleted_at from public.cards where id = 'c1'), null, 'a deletion wins even with an older timestamp');
select is((select front from public.cards where id = 'c1'), '', 'tombstones keep no card text');
select pg_temp.push_card('c1', 'd1', 'revived', now(), null);
select isnt((select deleted_at from public.cards where id = 'c1'), null, 'an edit cannot revive a deleted card');

-- Deleting a deck deletes its cards; cards added or edited offline afterwards end up deleted too.
insert into public.decks (id, name) values ('d2', 'Doomed');
select pg_temp.push_card('c2', 'd2', 'x', now() - interval '1 minute');
select pg_temp.push_card('c3', 'd2', 'y', now() - interval '1 minute');
update public.decks set deleted_at = now(), updated_at = now() where id = 'd2';
select is((select count(*)::int from public.cards where deck_id = 'd2' and deleted_at is null), 0, 'a deck tombstone cascades to its cards');
select is((select name from public.decks where id = 'd2'), '', 'deck tombstones keep no name');
select pg_temp.push_card('c4', 'd2', 'created offline', now());
select isnt((select deleted_at from public.cards where id = 'c4'), null, 'a card added to a deleted deck arrives deleted, not orphaned');
select pg_temp.push_card('c2', 'd2', 'edited offline', now());
select isnt((select deleted_at from public.cards where id = 'c2'), null, 'an offline edit cannot revive a card of a deleted deck');

-- Text limits.
select throws_ok(
  $$ select pg_temp.push_card('long', 'd1', repeat('x', 1001), now()) $$,
  '23514',
  null,
  'a card side is limited to 1,000 characters'
);
select lives_ok(
  $$ select pg_temp.push_card('emoji', 'd1', repeat('😀', 1000), now()) $$,
  'the limit counts characters, not bytes'
);
reset role;

-- Count limits, on a fresh account.
select pg_temp.act_as('cccccccc-0000-4000-8000-000000000003');
select lives_ok(
  $$ insert into public.decks (id, name) select 'deck' || n, 'Deck ' || n from generate_series(1, 100) n $$,
  '100 decks fit'
);
select throws_like(
  $$ insert into public.decks (id, name) values ('deck101', 'One too many') $$,
  'LIMIT_DECKS%',
  'the 101st deck is refused'
);
select lives_ok(
  $$ insert into public.cards (id, deck_id, front, back, box, due_day)
     select 'card' || n, 'deck1', 'f', 'b', 1, 1 from generate_series(1, 5000) n $$,
  '5,000 cards fit'
);
select throws_like(
  $$ insert into public.cards (id, deck_id, front, back, box, due_day) values ('card5001', 'deck1', 'f', 'b', 1, 1) $$,
  'LIMIT_CARDS%',
  'the 5,001st card is refused'
);
update public.cards set deleted_at = now(), updated_at = now() where id = 'card1';
select lives_ok(
  $$ insert into public.cards (id, deck_id, front, back, box, due_day) values ('card5001', 'deck1', 'f', 'b', 1, 1) $$,
  'deleted cards free up room'
);
reset role;

-- Account deletion removes the caller and everything they own, and nothing else.
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
insert into public.decks (id, name) values ('d1', 'B deck');
select public.delete_account();
reset role;
select is(
  (select count(*)::int from auth.users where id = 'bbbbbbbb-0000-4000-8000-000000000002')
    + (select count(*)::int from public.decks where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'),
  0,
  'delete_account removes the user and cascades to their data'
);

select * from finish();
rollback;
