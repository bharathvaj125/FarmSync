-- Uploading a payment screenshot was never actually proof the money
-- arrived -- anyone could upload any image and the system just trusted
-- it. This adds a real verification step: uploading now moves a leg to
-- 'submitted', and only the person who actually received the money can
-- move it to 'paid', by explicitly reviewing the screenshot and clicking
-- "Verify payment" (confirmed with a popup in the UI). Applies to both
-- legs -- the buyer's produce payment to the farmer, and the farmer's
-- transport payment to the truck -- and the existing rule that the
-- transport leg only unlocks once the produce leg is truly 'paid'
-- (not just 'submitted') already enforces exactly the order described:
-- buyer pays -> farmer verifies -> farmer pays truck -> truck verifies.
--
-- Run once in the SQL Editor.

alter table transactions add column if not exists payment_verified_at timestamptz;
alter table transactions add column if not exists transport_payment_verified_at timestamptz;

alter table transactions drop constraint if exists transactions_payment_status_check;
alter table transactions add constraint transactions_payment_status_check
  check (payment_status in ('pending', 'submitted', 'paid'));

alter table transactions drop constraint if exists transactions_transport_payment_status_check;
alter table transactions add constraint transactions_transport_payment_status_check
  check (transport_payment_status in ('pending', 'submitted', 'paid'));

-- Any row that already reached 'paid' under the old upload-marks-paid
-- behavior stays 'paid' -- this only changes what happens going forward,
-- it doesn't retroactively demote already-completed payments.

-- ---------- check ----------
select
  (select count(*) from transactions where payment_status = 'submitted') as produce_awaiting_verification,
  (select count(*) from transactions where transport_payment_status = 'submitted') as transport_awaiting_verification;
