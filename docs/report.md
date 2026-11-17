# ProofTrail: A Tamper-Evident, Hash-Chained Ledger for Transparent Welfare Fund Disbursement

**Course:** UE24 DBMS (PES University) — Units 1–4  
**Date:** November 2026  
**Author:** [Student Name]

---

## 1. Problem

Public welfare disbursements (scholarships, relief funds, pensions) are vulnerable to silent tampering:
- A DBA or privileged user can `UPDATE` the `disbursement` table directly, changing amounts or beneficiaries
- Standard audit logs can be deleted or modified by the same privileged users
- No built-in mechanism detects *reordering*, *truncation*, or *trigger-bypass* edits

**Goal:** Build a PostgreSQL system where *every* change to `disbursement` is recorded in an **append-only, hash-chained ledger** that detects any tampering — including edits that bypass the trigger.

---

## 2. Architecture

```
┌─────────────────┐     AFTER INSERT/UPDATE/DELETE      ┌──────────────┐
│  disbursement   │ ──────────────────────────────────▶ │    ledger    │
│    (live table) │        trigger: log_change()        │ (hash chain) │
└─────────────────┘                                     └──────┬───────┘
                                                                 │
                                          ┌──────────────────────┘
                                          ▼
                                 ┌──────────────────┐
                                 │   chain_head     │
                                 │  (single row,    │
                                 │   FOR UPDATE     │
                                 │   serializes     │
                                 │   writers)       │
                                 └──────────────────┘
```

**Key components:**
1. **`ledger` table** — append-only, each row has `prev_hash` and `row_hash` (SHA-256)
2. **`chain_head` table** — single row holding latest hash; `SELECT ... FOR UPDATE` serializes concurrent inserts
3. **`log_change()` trigger** — fires on every disbursement change, writes to ledger atomically
4. **`verify_chain()` function** — uses `LAG()` window function to check every link
5. **`verify_live` view** — compares live table to latest ledger entry per disbursement

---

## 3. ER Diagram and Schema

See [`docs/er.md`](er.md) for:
- Mermaid ER diagram
- ER-to-relational reduction table
- 5 relational algebra expressions tied to real queries

**Core tables:**
```sql
scheme(scheme_id PK, name UK, department)
beneficiary(beneficiary_id PK, full_name, district)
official(official_id PK, name, manager_id FK→official)  -- 3-level hierarchy
disbursement(disb_id PK, scheme_id FK, beneficiary_id FK, amount, disbursed_on, officer)
ledger(seq PK, op, payload JSONB, created_at, prev_hash, row_hash)
chain_head(id=1 PK, last_hash)
```

---

## 4. Advanced SQL (Unit 2)

All implemented in [`db/02_queries.sql`](../db/02_queries.sql) with syllabus-topic comments:

| Topic | Query | Output Sample |
|-------|-------|---------------|
| **Recursive CTE** | Official hierarchy (director → manager → officer) | `Director Sharma > Manager Patel > Officer Singh` |
| **Correlated Subquery** | Beneficiaries paid twice by same scheme on same day | Returns duplicates (0 in seed data) |
| **Window Function (SUM OVER)** | Running total per scheme ordered by date | `25000 → 50000` for scheme 1 |
| **Full-Text Search** | `to_tsvector @@ plainto_tsquery` over scheme+beneficiary | Finds "scholarship asha" → 1 row |
| **Set Operation (UNION)** | Beneficiaries in scheme 1 ∪ scheme 2 | 4 distinct beneficiaries |
| **NULL Handling** | `COALESCE(manager, 'Top Level')` + `CASE WHEN IS NULL` | Shows "Top Level" for director |
| **View** | `public_receipt` with short ledger hash | 5 rows with 64-char hex hashes |

**Verification that chain works:**
```sql
SELECT * FROM verify_chain();  -- 0 rows = intact
SELECT * FROM verify_live;     -- 0 rows = live matches ledger
```

---

## 5. Normalization (Unit 3)

See [`db/05_normalization.md`](../db/05_normalization.md) for full derivation.

**Summary:**
1. **Flat table** with FDs: `disb_id → all`, `scheme_name → dept`, `beneficiary_name → district`, `officer → manager`
2. **Candidate key:** `{disb_id}` (Armstrong's axioms)
3. **1NF:** Atomic values ✓
4. **2NF:** Single-attribute key → no partial deps ✓
5. **3NF:** Decomposed to `scheme`, `beneficiary`, `official`, `disbursement` — removes transitive deps ✓
6. **BCNF:** Requires `UNIQUE` on natural keys (`scheme.name`, `beneficiary.full_name`, `official.name`); ProofTrail uses 3NF pragmatically

**3NF ≠ BCNF example:** `student_course(student_id, course_id, instructor, instructor_dept)` with `instructor → instructor_dept` and `course_id → instructor`. In 3NF (instructor part of key), violates BCNF (instructor not superkey).

---

## 6. Query Optimization (Unit 3)

See [`db/04_optimization/README.md`](../db/04_optimization/README.md) for full plans.

**Setup:** 200,005 rows in `disbursement` (5 seed + 200k bulk). Beneficiary 4 has 50,201 rows (~25%).

| Metric | Before Index (Seq Scan) | After Index (Bitmap Heap Scan) |
|--------|------------------------|--------------------------------|
| **Plan** | Sequential Scan | Bitmap Heap Scan + Bitmap Index Scan |
| **Blocks** | 1,667 shared hit | 1,667 hit + 44 read (index) |
| **Rows Filtered** | 149,804 removed | 0 (index finds exact) |
| **Execution Time** | **44.986 ms** | **27.549 ms (39% faster)** |

**Why Bitmap?** 25% selectivity → planner chooses bitmap over index scan (random I/O too expensive for many rows).

**Bulk-load pattern used:**
```sql
ALTER TABLE disbursement DISABLE TRIGGER trg_log;
INSERT ... FROM generate_series(1, 200000);  -- ~7s
ALTER TABLE disbursement ENABLE TRIGGER trg_log;
-- Re-run 01_core.sql to rebuild ledger chain
```

---

## 7. Concurrency and Locking (Unit 4)

See [`db/03_concurrency/README.md`](../db/03_concurrency/README.md) for full output.

### Test 1: Chain-Head Lock Race
Two sessions call `disburse()` concurrently. `log_change()` does `SELECT last_hash FROM chain_head WHERE id=1 FOR UPDATE`.

**Result:** Session B blocks on `FOR UPDATE` until Session A commits. Both succeed. `verify_chain()` returns 0 rows — **no fork**.

### Test 2: Deadlock
- Session A: `UPDATE disbursement SET amount=amount+1 WHERE disb_id=1; pg_sleep(2); UPDATE ... disb_id=2;`
- Session B: `UPDATE ... disb_id=2; pg_sleep(2); UPDATE ... disb_id=1;`

**Result:** PostgreSQL detects circular wait, aborts one session with:
```
ERROR: deadlock detected
DETAIL: Process 148 waits for ShareLock on transaction 769; blocked by process 156.
Process 156 waits for ShareLock on transaction 768; blocked by process 148.
```
Other session commits. **Resolution:** Catch `SQLSTATE 40P01` and retry.

---

## 8. Tamper-Detection Demo

### Web UI (Next.js in `web/`)
- `GET /api/verify` → runs `verify_chain()` + `verify_live`
- `GET /api/ledger` → full ledger
- `GET|POST /api/disbursements` → CRUD
- `POST /api/demo/tamper` → disables trigger, edits row, re-enables
- `POST /api/demo/reset` → re-runs `01_core.sql`

### Manual Demo (psql)
```sql
-- 1. Healthy chain
SELECT * FROM verify_chain();  -- 0 rows
SELECT * FROM verify_live;     -- 0 rows

-- 2. Silent edit (bypasses trigger)
ALTER TABLE disbursement DISABLE TRIGGER trg_log;
UPDATE disbursement SET amount = 1000 WHERE disb_id = 2;
ALTER TABLE disbursement ENABLE TRIGGER trg_log;
SELECT * FROM verify_live;     -- flags disb_id 2

-- 3. Edit history in ledger itself
ALTER TABLE ledger DISABLE TRIGGER no_edit;
UPDATE ledger SET payload = jsonb_set(payload,'{amount}','1') WHERE seq = 3;
ALTER TABLE ledger ENABLE TRIGGER no_edit;
SELECT * FROM verify_chain();  -- flags seq 3
```

**Real output from demo:**
```
 verify_live (after silent edit of disb_id=2):
 disb_id |              problem
---------+-------------------------------------
       2 | table row differs from its last ledger entry

 verify_chain (after ledger edit of seq=3):
 bad_seq |           problem
---------+-------------------------------
       3 | row content or hash was altered
```

*Screenshot pending: web UI showing "Tamper" button click → "Verify" → red row flagged*

---

## 9. Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **Detection, not prevention** | Tampering detected after the fact | External monitoring / alerts |
| **DBA can disable triggers** | `ALTER TABLE ... DISABLE TRIGGER` bypasses ledger | Audit DBA actions; WAL/pg_audit |
| **Single database** | If DB is compromised, ledger is too | Periodic external hash digests (Merkle root to S3/blockchain) |
| **No replication** | Chain only as durable as PostgreSQL WAL | Stream ledger to immutable store |

---

## 10. Future Work

- **External digests:** Publish `chain_head.last_hash` daily to S3, blockchain, or newspaper classifieds
- **Graph analysis:** Load `official` hierarchy + disbursements into **Neo4j** for fraud pattern detection (circular approvals, collusion)
- **Vector search:** Embed beneficiary narratives in **pgvector** for semantic duplicate detection
- **Cryptographic upgrade:** Replace SHA-256 with BLAKE3 or Ed25519 signatures for non-repudiation

---

## 11. Conclusion

ProofTrail demonstrates a complete, syllabus-aligned DBMS project:
- **Unit 1:** ER design, relational mapping, constraints, 5 RA expressions
- **Unit 2:** Triggers, functions, views, recursive CTE, window functions, full-text search, set ops, NULL handling
- **Unit 3:** Normalization to 3NF/BCNF, 200k-row optimization with `EXPLAIN ANALYZE` before/after index
- **Unit 4:** Concurrency via `FOR UPDATE` on singleton `chain_head`, deadlock demo with resolution
- **Web App:** Next.js + `pg` parameterized queries, tamper demo endpoints

All code is plain SQL/plpgsql, no ORMs, explainable line-by-line. The hash-chained ledger provides **tamper-evidence** for public welfare funds — a practical application of database security concepts.

---

## Appendix: Running the Project

```bash
# 1. Start PostgreSQL (Docker)
docker run -d --name prooftrail-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=prooftrail -p 5432:5432 postgres:16

# 2. Load schema
psql -d prooftrail -f db/01_core.sql
psql -d prooftrail -f db/01b_extra.sql
psql -d prooftrail -f db/02_queries.sql

# 3. Verify chain
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

# 6. Web app
cd web && npm install && npm run dev
# Open http://localhost:3000
```