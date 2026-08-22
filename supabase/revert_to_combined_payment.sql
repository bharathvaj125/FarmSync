-- Reverts the two-leg payment split back to one combined payment: the
-- buyer pays the farmer everything (produce cost + transport cost) in
-- one transfer, and the farmer is responsible for separately settling
-- with the transporter off-platform. transport_cost stays on
-- transactions (still needed to compute the combined amount owed) --
-- only the now-unused separate transport-payment tracking is dropped.
--
-- Run once in the SQL Editor, after add_transport_payment_split.sql has run.

alter table transactions drop column if exists transport_payment_status;
alter table transactions drop column if exists transport_payment_screenshot_path;
alter table transactions drop column if exists transport_payment_uploaded_at;
