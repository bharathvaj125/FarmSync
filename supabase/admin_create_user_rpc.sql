-- Makes the admin screen's "Add a person" form create accounts directly
-- via this database function instead of Supabase's normal signUp() API --
-- that API needs to send a confirmation email even when "Confirm email"
-- is off in some cases, and burns from the same tiny free-tier email
-- quota that kept getting rate-limited. This function inserts straight
-- into auth.users with the email pre-confirmed, so account creation from
-- the app never depends on email sending or its rate limit again.
--
-- Run once in the SQL Editor, after setup_auth_complete.sql,
-- add_realtime_and_contact.sql, and add_home_zone.sql have all run.

-- The old 4-parameter version is replaced by a 6-parameter one (adds
-- phone_number and home_zone) -- drop it first so this doesn't just add
-- an overload alongside the old signature.
drop function if exists public.create_demo_user(text, text, text, text);

create or replace function public.create_demo_user(
  p_email text,
  p_password text,
  p_role text,
  p_display_name text,
  p_phone_number text default null,
  p_home_zone text default null
) returns uuid as $$
declare
  new_id uuid;
  caller_role text := auth.role(); -- 'anon' / 'authenticated' via the app, null from the SQL Editor
begin
  -- Calls with no JWT context at all (the SQL Editor, or a migration script
  -- run directly against the database) are trusted the same way they
  -- already are everywhere else in this schema. A call arriving through
  -- the app's REST/RPC layer, though, must come from a signed-in admin --
  -- otherwise anyone holding the public anon key could call this directly
  -- and mint themselves an admin account.
  if caller_role = 'anon' then
    raise exception 'Sign in as an admin to create accounts.';
  end if;
  if caller_role = 'authenticated' and public.current_role_name() <> 'admin' then
    raise exception 'Only an admin can create new accounts.';
  end if;

  select id into new_id from auth.users where email = p_email;
  if new_id is not null then
    return new_id;
  end if;

  new_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role', p_role,
      'display_name', p_display_name,
      'phone_number', p_phone_number,
      'home_zone', p_home_zone
    ),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', new_id::text,
    now(), now(), now()
  );

  return new_id;
end;
$$ language plpgsql security definer set search_path = public, auth, extensions;
