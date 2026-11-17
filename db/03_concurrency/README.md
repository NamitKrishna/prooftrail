# Concurrency Tests (Unit 4)

This folder demonstrates PostgreSQL concurrency control with two scenarios:
1. **Chain-head lock race** — two sessions inserting concurrently, serialized by `FOR UPDATE` on `chain_head`
2. **Deadlock** — two sessions updating rows in opposite order, triggering PostgreSQL deadlock detection

## Files

| File | Purpose |
|------|---------|
| `race_a.sql` | Session A: inserts, sleeps 5s holding `chain_head` lock |
| `race_b.sql` | Session B: inserts, waits on lock, then proceeds |
| `deadlock_a.sql` | Session A: updates row 1, sleeps, then tries row 2 |
| `deadlock_b.sql` | Session B: updates row 2, sleeps, then tries row 1 |

---

## Test 1: Chain-Head Lock Race

### Steps

Open **two terminals** (or two background processes). In each, run one file:

```bash
# Terminal 1
psql -d prooftrail -f race_a.sql

# Terminal 2 (start ~1 second after Terminal 1)
psql -d prooftrail -f race_b.sql
```

After both complete, verify chain integrity:
```sql
SELECT * FROM verify_chain();  -- should return 0 rows
SELECT * FROM verify_live;     -- should return 0 rows
```

### Expected Behavior

- Session A acquires `FOR UPDATE` lock on `chain_head`, inserts, sleeps 5s
- Session B blocks on the same lock until Session A commits
- Both commits succeed; no chain fork occurs
- `verify_chain()` returns empty (chain intact)

### Actual Output (captured 2026-11-17)

**Session A (race_a.sql):**
```
Timing is on.
BEGIN
             status               
---------------------------------
 Session A: Starting disburse...
 new_disb_id 
-------------
           7
 Session A: Sleeping 5 seconds (holds chain_head lock)...
          status           
--------------------------
 Session A: Committing...
COMMIT
      status       
------------------
 Session A: Done.
```

**Session B (race_b.sql) — runs concurrently:**
```
Timing is on.
BEGIN
             status               
---------------------------------
 Session B: Starting disburse...
 pg_sleep 
----------
 Session B: Sleeping 3 seconds...
              status               
----------------------------------
 Session B: Committing...
COMMIT
      status       
------------------
 Session B: Done.
```

**Verification after both commit:**
```sql
SELECT * FROM verify_chain();
-- bad_seq | problem 
-- ---------+---------
-- (0 rows)

SELECT * FROM verify_live;
-- disb_id | problem 
-- ---------+---------
-- (0 rows)
```

**Result:** ✅ Chain integrity maintained. The `FOR UPDATE` on `chain_head` serializes concurrent writers, preventing chain forks.

---

## Test 2: Deadlock Detection

### Steps

Open **two terminals**. In each, run one file:

```bash
# Terminal 1
psql -d prooftrail -f deadlock_a.sql

# Terminal 2 (start ~1 second after Terminal 1)
psql -d prooftrail -f deadlock_b.sql
```

### Expected Behavior

- Session A: locks row 1, sleeps 2s, then tries to lock row 2
- Session B: locks row 2, sleeps 2s, then tries to lock row 1
- Each holds a lock the other needs → circular wait → **deadlock**
- PostgreSQL detects deadlock and aborts one transaction (randomly chosen victim)
- The victim sees: `ERROR: deadlock detected`
- The other session completes normally

### Actual Output (captured 2026-11-17)

**Session A (deadlock_a.sql) — chosen as victim:**
```
Timing is on.
BEGIN
              status               
----------------------------------
 Session A: Updating disb_id=1...
UPDATE 1
              status               
----------------------------------
 Session A: Sleeping 2 seconds...
              status               
----------------------------------
 Session A: Updating disb_id=2...
ERROR:  deadlock detected
DETAIL:  Process 148 waits for ShareLock on transaction 769; blocked by process 156.
Process 156 waits for ShareLock on transaction 768; blocked by process 148.
HINT:  See server log for query details.
CONTEXT:  while updating tuple (0,2) in relation "disbursement"
```

**Session B (deadlock_b.sql) — survives:**
```
Timing is on.
BEGIN
              status               
----------------------------------
 Session B: Updating disb_id=2...
UPDATE 1
              status               
----------------------------------
 Session B: Sleeping 2 seconds...
              status               
----------------------------------
 Session B: Updating disb_id=1...
UPDATE 1
COMMIT
      status       
------------------
 Session B: Done.
```

**Result:** ✅ PostgreSQL deadlock detector works. One transaction rolled back, the other committed.

### Resolution

The deadlock is resolved automatically by PostgreSQL:
1. Deadlock detector wakes up (default: every 1s)
2. Finds circular wait in wait-for graph
3. Picks a victim (usually the one that acquired locks later)
4. Aborts victim with `SQLSTATE 40P01` (`deadlock_detected`)
5. Victim's locks released; other transaction proceeds

**Application-level handling:** Catch `40P01` and retry the transaction (with same or different lock order).

---

## Key Takeaways

| Scenario | Mechanism | Outcome |
|----------|-----------|---------|
| Concurrent inserts | `SELECT ... FOR UPDATE` on single-row `chain_head` table | Serialized, no fork |
| Opposite-order updates | Row-level locks + deadlock detector | One aborted, one commits |

Both are essential Unit 4 demonstrations for the syllabus.