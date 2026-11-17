-- seed_big.sql: Insert 200,000 extra disbursement rows for optimization demo
-- Run AFTER db/01_core.sql and db/01b_extra.sql
--
-- NOTE: The trigger on disbursement fires for each row, making this slow (~30-60s).
-- For faster bulk load, we temporarily DISABLE the trigger, load data,
-- then RE-ENABLE it and reset chain state by re-running 01_core.sql.
-- This is explained in README.md.

\set ON_ERROR_STOP on
\timing on

-- ============================================================
-- FAST BULK LOAD: Disable trigger, insert, re-enable, reset chain
-- ============================================================

-- 1. Disable the ledger trigger so we can bulk-insert fast
ALTER TABLE disbursement DISABLE TRIGGER trg_log;

-- 2. Insert 200,000 rows using generate_series
--    We pick random scheme_id (1-3), random beneficiary_id (1-5),
--    random amount (1000-50000), random officer from a small pool
INSERT INTO disbursement (scheme_id, beneficiary_id, amount, disbursed_on, officer)
SELECT
  (random() * 2 + 1)::int,                              -- scheme_id 1-3
  (random() * 4 + 1)::int,                              -- beneficiary_id 1-5
  (random() * 49000 + 1000)::numeric(12,2),             -- amount 1000-50000
  (current_date - (random() * 365)::int)::date,         -- random date in last year
  ('officer_' || chr(97 + (random() * 9)::int))::text   -- officer_a through officer_j
FROM generate_series(1, 200000);

-- 3. Re-enable the trigger
ALTER TABLE disbursement ENABLE TRIGGER trg_log;

-- 4. Reset chain state by re-running core schema (clears ledger, rebuilds from seed)
--    Run this separately: psql -d prooftrail -f /home/namit/projects/prooftrail/db/01_core.sql
--    This is done in the README steps.

-- ============================================================
-- ALTERNATIVE: SLOW BUT CORRECT (uncomment if you want full ledger)
-- ============================================================
-- INSERT INTO disbursement (scheme_id, beneficiary_id, amount, disbursed_on, officer)
-- SELECT ... FROM generate_series(1, 200000);
-- -- This fires trigger 200k times; takes ~30-60 seconds.