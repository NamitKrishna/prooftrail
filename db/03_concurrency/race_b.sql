-- race_b.sql: Session B in the chain_head FOR UPDATE race
-- Run in SECOND terminal: psql -d prooftrail -f race_b.sql
-- Start this shortly after starting race_a.sql in the first terminal
-- Session B will wait on the chain_head FOR UPDATE lock held by Session A
-- After both commit, verify_chain() shows no fork.

\set ON_ERROR_STOP on
\timing on

BEGIN;
SELECT 'Session B: Starting disburse...' AS status;
SELECT disburse(2, 3, 2000.00, 'Race Officer B') AS new_disb_id;
SELECT 'Session B: Sleeping 3 seconds...' AS status;
SELECT pg_sleep(3);
SELECT 'Session B: Committing...' AS status;
COMMIT;
SELECT 'Session B: Done.' AS status;

-- After both sessions complete, run this to verify chain integrity:
-- SELECT * FROM verify_chain();