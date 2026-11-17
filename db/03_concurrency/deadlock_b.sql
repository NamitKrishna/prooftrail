-- deadlock_b.sql: Session B in deadlock demo
-- Run in SECOND terminal: psql -d prooftrail -f deadlock_b.sql
-- Start this shortly after starting deadlock_a.sql in the first terminal
-- Both update two disbursement rows in opposite order with pg_sleep between
-- This triggers a deadlock; PostgreSQL will abort one session with:
-- ERROR:  deadlock detected

\set ON_ERROR_STOP on
\timing on

BEGIN;
SELECT 'Session B: Updating disb_id=2...' AS status;
UPDATE disbursement SET amount = amount + 1 WHERE disb_id = 2;
SELECT 'Session B: Sleeping 2 seconds...' AS status;
SELECT pg_sleep(2);
SELECT 'Session B: Updating disb_id=1...' AS status;
UPDATE disbursement SET amount = amount + 1 WHERE disb_id = 1;
COMMIT;
SELECT 'Session B: Done.' AS status;