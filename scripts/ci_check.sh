#!/usr/bin/env bash
# CI regression test for ProofTrail
# Runs in GitHub Actions: starts Postgres, loads schema, runs verification queries

set -euo pipefail

echo "=== ProofTrail CI Regression Test ==="

# Start PostgreSQL (using Docker in CI)
echo "Starting PostgreSQL..."
docker run -d --name prooftrail-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=prooftrail \
  -p 5432:5432 postgres:16

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
for i in {1..30}; do
  if docker exec prooftrail-db pg_isready -U postgres >/dev/null 2>&1; then
    echo "PostgreSQL ready"
    break
  fi
  sleep 1
done

# Load schema
echo "Loading schema..."
docker exec -i prooftrail-db psql -U postgres -d prooftrail < db/01_core.sql
docker exec -i prooftrail-db psql -U postgres -d prooftrail < db/01b_extra.sql
docker exec -i prooftrail-db psql -U postgres -d prooftrail < db/02_queries.sql

# Test 1: Chain integrity on clean load
echo "Test 1: Chain integrity (clean load)..."
CHAIN_RESULT=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "SELECT count(*) FROM verify_chain();")
LIVE_RESULT=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "SELECT count(*) FROM verify_live;")

if [[ "$CHAIN_RESULT" -eq 0 && "$LIVE_RESULT" -eq 0 ]]; then
  echo "  PASS: verify_chain and verify_live return 0 rows"
else
  echo "  FAIL: verify_chain=$CHAIN_RESULT, verify_live=$LIVE_RESULT"
  exit 1
fi

# Test 2: disburse function works and maintains chain
echo "Test 2: disburse() function..."
NEW_ID=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "SELECT disburse(1, 1, 5000.00, 'CI Test');")
CHAIN_RESULT=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "SELECT count(*) FROM verify_chain();")

if [[ -n "$NEW_ID" && "$CHAIN_RESULT" -eq 0 ]]; then
  echo "  PASS: disburse() returned $NEW_ID, chain intact"
else
  echo "  FAIL: disburse() failed or chain broken"
  exit 1
fi

# Test 3: Tamper detection (trigger bypass)
echo "Test 3: Tamper detection..."
docker exec -i prooftrail-db psql -U postgres -d prooftrail -c "
  ALTER TABLE disbursement DISABLE TRIGGER trg_log;
  UPDATE disbursement SET amount = 1000 WHERE disb_id = 2;
  ALTER TABLE disbursement ENABLE TRIGGER trg_log;
"
LIVE_RESULT=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "SELECT count(*) FROM verify_live WHERE disb_id = 2;")

if [[ "$LIVE_RESULT" -eq 1 ]]; then
  echo "  PASS: verify_live flags tampered disb_id=2"
else
  echo "  FAIL: verify_live did not detect tamper"
  exit 1
fi

# Test 4: Recursive CTE works
echo "Test 4: Recursive CTE (official hierarchy)..."
CTE_ROWS=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "
  WITH RECURSIVE org_chart AS (
    SELECT official_id, name, manager_id, 1 AS level FROM official WHERE manager_id IS NULL
    UNION ALL
    SELECT o.official_id, o.name, o.manager_id, oc.level + 1
    FROM official o JOIN org_chart oc ON o.manager_id = oc.official_id
  )
  SELECT count(*) FROM org_chart;
")
if [[ "$CTE_ROWS" -ge 3 ]]; then
  echo "  PASS: Recursive CTE returns $CTE_ROWS rows"
else
  echo "  FAIL: Recursive CTE returned only $CTE_ROWS rows"
  exit 1
fi

# Test 5: Full-text search works
echo "Test 5: Full-text search..."
FTS_ROWS=$(docker exec -i prooftrail-db psql -U postgres -d prooftrail -tAc "
  SELECT count(*) FROM disbursement d
  JOIN scheme s ON s.scheme_id = d.scheme_id
  JOIN beneficiary b ON b.beneficiary_id = d.beneficiary_id
  WHERE to_tsvector('english', s.name || ' ' || b.full_name) @@ plainto_tsquery('english', 'scholarship asha');
")
if [[ "$FTS_ROWS" -ge 1 ]]; then
  echo "  PASS: Full-text search returns $FTS_ROWS row(s)"
else
  echo "  FAIL: Full-text search returned 0 rows"
  exit 1
fi

# Cleanup
echo "Cleaning up..."
docker stop prooftrail-db >/dev/null
docker rm prooftrail-db >/dev/null

echo ""
echo "=== All CI tests PASSED ==="