-- Row-level security: one account can never read or write another account's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.dev', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.dev', 'authenticated', 'authenticated');

create function pg_temp.act_as(account uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', account, 'role', 'authenticated')::text, true);
  set local role authenticated;
end;
$$;

-- Rows an UPDATE or DELETE actually touched (data-modifying CTEs can't sit inside is()).
create function pg_temp.affected(statement text) returns int
language plpgsql as $$
declare
  touched int;
begin
  execute statement;
  get diagnostics touched = row_count;
  return touched;
end;
$$;
grant execute on function pg_temp.affected(text) to authenticated;

-- Every table in public has RLS on.
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'row-level security is enabled on every public table'
);

-- Account A creates a deck and a card.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok(
  $$ insert into public.decks (id, name) values ('d1', 'A deck') $$,
  'an account can add its own deck'
);
select lives_ok(
  $$ insert into public.cards (id, deck_id, front, back, box, due_day) values ('c1', 'd1', 'hola', 'hello', 1, 20000) $$,
  'an account can add its own card'
);
select is((select user_id from public.decks where id = 'd1'), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'user_id defaults to the caller');
reset role;

-- Account B sees and changes nothing of A's.
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select is((select count(*)::int from public.decks), 0, 'another account cannot read the decks');
select is((select count(*)::int from public.cards), 0, 'another account cannot read the cards');
select is(pg_temp.affected($$ update public.cards set front = 'pwned', updated_at = now() where id = 'c1' $$), 0, 'another account cannot update the cards');
select is(pg_temp.affected($$ delete from public.decks where id = 'd1' $$), 0, 'another account cannot delete the decks');
select throws_ok(
  $$ insert into public.decks (user_id, id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'evil', 'x') $$,
  '42501',
  null,
  'another account cannot insert rows owned by someone else'
);
select throws_ok(
  $$ insert into public.cards (user_id, id, deck_id, front, back, box, due_day)
     values ('aaaaaaaa-0000-4000-8000-000000000001', 'c1', 'd1', 'x', 'x', 1, 1)
     on conflict (user_id, id) do update set front = excluded.front, updated_at = now() $$,
  '42501',
  null,
  'another account cannot upsert over someone else''s card'
);
select throws_ok(
  $$ insert into public.cards (id, deck_id, front, back, box, due_day) values ('c2', 'd1', 'x', 'x', 1, 1) $$,
  '23503',
  null,
  'a card cannot point at another account''s deck'
);
select lives_ok(
  $$ insert into public.decks (id, name) values ('d1', 'B deck with the same id') $$,
  'two accounts can hold the same deck id (shared sample deck and backup ids)'
);
reset role;

select is((select front from public.cards where id = 'c1'), 'hola', 'A''s card is untouched');
select is((select count(*)::int from public.decks where id = 'd1'), 2, 'both accounts own a d1');

-- Signed-out visitors can't touch the tables or delete accounts.
set local role anon;
select throws_ok($$ select count(*) from public.decks $$, '42501', null, 'anon cannot read decks');
select throws_ok($$ select public.delete_account() $$, '42501', null, 'anon cannot call delete_account');
reset role;

select * from finish();
rollback;
