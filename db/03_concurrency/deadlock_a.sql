-- deadlock_a.sql: Session A in deadlock demo
-- Run in FIRST terminal: psql -d prooftrail -f deadlock_a.sql
-- In SECOND terminal, run deadlock_b.sql at roughly the same time
-- Both update two disbursement rows in opposite order with pg_sleep between
-- This triggers a deadlock; PostgreSQL will abort one session.

\set ON_ERROR_STOP on
\timing on

BEGIN;
SELECT 'Session A: Updating disb_id=1...' AS status;
UPDATE disbursement SET amount = amount + 1 WHERE disb_id = 1;
SELECT 'Session A: Sleeping 2 seconds...' AS status;
SELECT pg_sleep(2);
SELECT 'Session A: Updating disb_id=2...' AS status;
UPDATE disbursement SET amount = amount + 1 WHERE disb_id = 2;
COMMIT;
SELECT 'Session A: Done.' AS status;