# Query Optimization Demo (Unit 3)

This folder demonstrates the performance impact of an index on a 200k+ row table.

## Setup

```bash
# 1. Load core schema (creates tables, trigger, ledger)
psql -d prooftrail -f ../01_core.sql

# 2. Bulk-insert 200,000 rows (trigger disabled for speed)
psql -d prooftrail -f seed_big.sql

# 3. Re-run core schema to rebuild ledger chain from all 200k rows
psql -d prooftrail -f ../01_core.sql

# 4. Run EXPLAIN ANALYZE before and after index (see below)
```

**Note on bulk load strategy:** The trigger on `disbursement` writes to the hash-chained ledger for every row. Firing it 200k times takes ~30-60s. We use the standard textbook optimization:
1. `ALTER TABLE disbursement DISABLE TRIGGER trg_log` — skip ledger during bulk load
2. `INSERT ... FROM generate_series(1, 200000)` — fast bulk insert (~7s)
3. `ALTER TABLE disbursement ENABLE TRIGGER trg_log` — re-enable trigger
4. Re-run `01_core.sql` — drops and recreates ledger, rebuilding chain from all live rows

This is a standard pattern: **bulk load without triggers, then rebuild derived structures**.

---

## Query Under Test

```sql
SELECT * FROM disbursement WHERE beneficiary_id = 4;
```

Beneficiary 4 has **50,201 rows** out of 200,005 total (~25% selectivity).

---

## Before Index: Sequential Scan

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM disbursement WHERE beneficiary_id = 4;
```

**Output:**
```
                                                   QUERY PLAN                                                    
-----------------------------------------------------------------------------------------------------------------
 Seq Scan on disbursement  (cost=0.00..3500.70 rows=733 width=64) (actual time=0.012..40.326 rows=50201 loops=1)
   Filter: (beneficiary_id = 4)
   Rows Removed by Filter: 149804
   Buffers: shared hit=1667
 Planning:
   Buffers: shared hit=75
 Planning Time: 0.531 ms
 Execution Time: 44.986 ms
```

**Key observations:**
- **Seq Scan** — reads all 1667 buffers (entire table)
- **Rows Removed by Filter: 149,804** — 75% of rows scanned and discarded
- **Execution Time: 44.986 ms**

---

## After Index: Bitmap Heap Scan

```sql
CREATE INDEX idx_disbursement_beneficiary ON disbursement(beneficiary_id);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM disbursement WHERE beneficiary_id = 4;
```

**Output:**
```
                                                                 QUERY PLAN                                                                  
---------------------------------------------------------------------------------------------------------------------------------------------
 Bitmap Heap Scan on disbursement  (cost=12.04..1534.58 rows=1000 width=64) (actual time=3.882..22.864 rows=50201 loops=1)
   Recheck Cond: (beneficiary_id = 4)
   Heap Blocks: exact=1667
   Buffers: shared hit=1667 read=44
   ->  Bitmap Index Scan on idx_disbursement_beneficiary  (cost=0.00..11.79 rows=1000 width=0) (actual time=3.452..3.453 rows=50201 loops=1)
         Index Cond: (beneficiary_id = 4)
         Buffers: shared read=44
 Planning:
   Buffers: shared hit=87 read=1
 Planning Time: 0.781 ms
 Execution Time: 27.549 ms
```

**Key observations:**
- **Bitmap Heap Scan** — not a pure Index Scan because 25% selectivity is high; PostgreSQL chooses bitmap for "many rows"
- **Bitmap Index Scan** on `idx_disbursement_beneficiary` finds matching row locations
- **Heap Blocks: exact=1667** — still visits all table blocks (same I/O), but avoids filter CPU
- **Execution Time: 27.549 ms** — **~39% faster**

---

## 5-Line Comparison

| Metric | Before Index (Seq Scan) | After Index (Bitmap Heap Scan) |
|--------|------------------------|--------------------------------|
| **Plan Type** | Sequential Scan | Bitmap Heap Scan + Bitmap Index Scan |
| **Blocks Read** | 1,667 (shared hit) | 1,667 hit + 44 read (index pages) |
| **Rows Filtered** | 149,804 removed by Filter | 0 (index finds exact matches) |
| **Execution Time** | 44.986 ms | 27.549 ms (**39% faster**) |
| **Why Not Index Scan?** | N/A | 25% selectivity → Bitmap more efficient |

---

## Why Bitmap Heap Scan, Not Index Scan?

PostgreSQL's planner estimates 1,000 rows (default statistics) but actual is 50,201 (~25%). For high selectivity:
- **Index Scan** = random I/O per row (slow for many rows)
- **Bitmap Index Scan** = build in-memory bitmap of matching pages, then sequential heap fetch
- **Seq Scan** = purely sequential, no random I/O

With 25% selectivity, Bitmap Heap Scan wins. For <5% selectivity, it would choose Index Scan.

---

## Files

| File | Purpose |
|------|---------|
| `seed_big.sql` | Bulk insert 200k rows (trigger disabled, then reset chain) |
| `README.md` | This file — steps, plans, comparison |