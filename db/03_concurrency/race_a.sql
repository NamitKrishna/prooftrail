-- race_a.sql: Session A in the chain_head FOR UPDATE race
-- Run in FIRST terminal: psql -d prooftrail -f race_a.sql
-- In SECOND terminal, run race_b.sql at roughly the same time
-- Both call disburse(), sleep, then commit. Session B waits on chain_head lock.
-- After both commit, verify_chain() shows no fork.

\set ON_ERROR_STOP on
\timing on

BEGIN;
SELECT 'Session A: Starting disburse...' AS status;
SELECT disburse(1, 2, 1000.00, 'Race Officer A') AS new_disb_id;
SELECT 'Session A: Sleeping 5 seconds (holds chain_head lock)...' AS status;
SELECT pg_sleep(5);
SELECT 'Session A: Committing...' AS status;
COMMIT;
SELECT 'Session A: Done.' AS status;

-- After both sessions complete, run this to verify chain integrity:
-- SELECT * FROM verify_chain();