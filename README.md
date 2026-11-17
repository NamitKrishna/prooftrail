# ProofTrail

**A Tamper-Evident, Hash-Chained Ledger for Transparent Welfare Fund Disbursement**

Solo DBMS mini project (PES University, UE24 DBMS, Units 1–4). Built in one day with PostgreSQL 16.

## What It Does

Every `INSERT`/`UPDATE`/`DELETE` on the `disbursement` table is captured by a trigger into an append-only `ledger`. Each ledger row stores `prev_hash` and `row_hash` (SHA-256 over seq, op, payload, timestamp, prev hash), forming a cryptographic chain.

- `verify_chain()` — detects altered rows, reordering, truncation, trigger-bypass edits
- `verify_live` view — catches live-table edits that bypassed the trigger
- Tamper demo: disable trigger → edit row → re-enable → `verify_live` flags exact row

## Syllabus Coverage

| Unit | Topic | Implementation |
|------|-------|----------------|
| 1 | ER diagram, reduction, constraints, 5 RA expressions | `docs/er.md` |
| 2 | Triggers, functions, views, recursive CTE, window functions, full-text search, set ops, NULL handling | `db/02_queries.sql` |
| 3 | Normalization (1NF→BCNF), `EXPLAIN ANALYZE` before/after index on 200k+ rows | `db/05_normalization.md`, `db/04_optimization/` |
| 4 | Concurrency (`FOR UPDATE` on `chain_head`), deadlock demo, Next.js web app | `db/03_concurrency/`, `web/` |

## Quick Start

```bash
# 1. Start PostgreSQL 16
docker run -d --name prooftrail-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=prooftrail \
  -p 5432:5432 postgres:16

# 2. Load schema & seed data
psql -d prooftrail -f db/01_core.sql
psql -d prooftrail -f db/01b_extra.sql
psql -d prooftrail -f db/02_queries.sql

# 3. Verify chain integrity
psql -d prooftrail -c "SELECT * FROM verify_chain(); SELECT * FROM verify_live;"

# 4. Run concurrency tests (two terminals)
psql -d prooftrail -f db/03_concurrency/race_a.sql
psql -d prooftrail -f db/03_concurrency/race_b.sql

# 5. Optimization demo
psql -d prooftrail -f db/04_optimization/seed_big.sql
psql -d prooftrail -f db/01_core.sql  # rebuild ledger
psql -d prooftrail -c "EXPLAIN ANALYZE SELECT * FROM disbursement WHERE beneficiary_id = 4;"
psql -d prooftrail -c "CREATE INDEX idx_disbursement_beneficiary ON disbursement(beneficiary_id);"
psql -d prooftrail -c "EXPLAIN ANALYZE SELECT * FROM disbursement WHERE beneficiary_id = 4;"

# 6. Web app (separate folder)
cd web && npm install && npm run dev
# Open http://localhost:3000
```

## Project Structure

```
prooftrail/
├── db/
│   ├── 01_core.sql          # Core schema (hash-chained ledger, triggers, views)
│   ├── 01b_extra.sql        # official hierarchy + disburse() function
│   ├── 02_queries.sql       # 7 queries covering Unit 2 syllabus
│   ├── 03_concurrency/      # Race condition + deadlock demos
│   ├── 04_optimization/     # 200k rows + index comparison
│   └── 05_normalization.md  # Full normalization writeup
├── docs/
│   ├── er.md                # Mermaid ER diagram + 5 RA expressions
│   └── report.md            # Complete project report
├── web/                     # Next.js + pg (App Router, TypeScript)
└── scripts/ci_check.sh      # CI regression test
```

## Key Commands

```bash
# Verify chain (should return 0 rows)
psql -d prooftrail -c "SELECT * FROM verify_chain();"

# Tamper demo (manual)
psql -d prooftrail -c "
  ALTER TABLE disbursement DISABLE TRIGGER trg_log;
  UPDATE disbursement SET amount = 1000 WHERE disb_id = 2;
  ALTER TABLE disbursement ENABLE TRIGGER trg_log;
  SELECT * FROM verify_live;  -- flags disb_id 2
"
```

## License

MIT — see [LICENSE](LICENSE)