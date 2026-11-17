# ProofTrail: project brief for coding agents

Solo DBMS mini project (PES University, UE24 DBMS, Units 1 to 4). Must be finished in ONE day. Favor working and demonstrable over elaborate.

## What it is
A PostgreSQL system that makes public welfare disbursements (scholarships, relief funds, pensions) tamper-evident.
Every insert/update/delete on `disbursement` is written by a trigger into an append-only `ledger`.
Each ledger row stores `prev_hash` and `row_hash` (SHA-256 over seq, op, payload, timestamp, prev hash), forming a chain.
`verify_chain()` and the `verify_live` view detect edits, deletions, reordering, truncation, and trigger-bypassing edits, and name the exact row.

## Hard rules
- `db/01_core.sql` (from prooftrail_core.sql) is tested and working. Do NOT change the hash format or the chain logic. Extend around it.
- PostgreSQL 16, plain SQL/plpgsql only. No ORMs. Web app uses the `pg` package with parameterized queries.
- No new databases or services unless a task explicitly says so (Neo4j/pgvector/Redis are OUT of scope today).
- Every task ends with a command I can run to see it work. Show the output.
- Keep files small and commented; this is a student project that must be explainable line by line.

## Layout and ownership (two agents work in parallel, never edit each other's folders)
```
prooftrail/
  CLAUDE.md
  db/            <- Claude Code owns
    01_core.sql
    02_queries.sql
    03_concurrency/
    04_optimization/
    05_normalization.md
  docs/          <- Claude Code owns (report, ER notes, screenshots/)
  web/           <- Antigravity CLI owns (Next.js, App Router, TypeScript)
```

## API contract (web calls these; db side guarantees they exist)
- `SELECT * FROM verify_chain()` -> rows (bad_seq, problem); empty = chain intact
- `SELECT * FROM verify_live` -> rows (disb_id, problem); empty = live table matches ledger
- `SELECT * FROM ledger ORDER BY seq` and `SELECT * FROM disbursement`
- Web routes: `GET /api/verify`, `GET /api/ledger`, `GET|POST /api/disbursements`, `POST /api/demo/tamper` (DEMO ONLY: disables trigger, edits one row, re-enables), `POST /api/demo/reset` (re-runs db/01_core.sql)
- DB connection from env var `DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/prooftrail`)

## Syllabus checklist (what must be demonstrable)
- Unit 1: ER diagram, ER-to-relational reduction, constraints, relational algebra for 5 queries
- Unit 2: triggers (done), functions/procedures (`disburse()` to add), views (done), CTE (recursive approval hierarchy), window functions (done: LAG; add a running total), correlated subquery (duplicate payouts), full-text search, set operations, NULL handling
- Unit 3: normalization (flat table, FDs, 1NF to BCNF), `EXPLAIN ANALYZE` before/after index on a 300k+ row table
- Unit 4: concurrency (two psql sessions racing on `chain_head` FOR UPDATE), a deliberate deadlock and its resolution, Next.js + SQL web app

## Definition of done
1. `psql -f db/01_core.sql` loads clean; verify returns nothing.
2. Tamper demo works from the web UI: click Tamper, click Verify, exact row flagged.
3. Report in `docs/report.md` has a section and screenshot for every item in the checklist.
