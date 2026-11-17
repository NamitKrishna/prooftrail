-- ProofTrail: advanced SQL queries (Unit 2 syllabus topics)
-- Run AFTER db/01_core.sql and db/01b_extra.sql
-- Each query has a comment naming the syllabus topic

-- ============================================================
-- 1. RECURSIVE CTE: official hierarchy (manager chain)
-- Syllabus: recursive CTE over approval hierarchy
-- ============================================================
WITH RECURSIVE org_chart AS (
  -- anchor: top-level officials (no manager)
  SELECT official_id, name, manager_id, 1 AS level, name::text AS path
  FROM official
  WHERE manager_id IS NULL

  UNION ALL

  -- recursive: find direct reports
  SELECT o.official_id, o.name, o.manager_id, oc.level + 1,
         oc.path || ' > ' || o.name
  FROM official o
  JOIN org_chart oc ON o.manager_id = oc.official_id
)
SELECT level, name, path
FROM org_chart
ORDER BY level, name;

-- ============================================================
-- 2. CORRELATED SUBQUERY: beneficiaries paid twice by same scheme
-- Syllabus: correlated subquery finding duplicate payouts
-- ============================================================
SELECT d1.disb_id, d1.scheme_id, d1.beneficiary_id, d1.amount, d1.disbursed_on
FROM disbursement d1
WHERE EXISTS (
  SELECT 1
  FROM disbursement d2
  WHERE d2.scheme_id = d1.scheme_id
    AND d2.beneficiary_id = d1.beneficiary_id
    AND d2.disb_id <> d1.disb_id
    AND d2.disbursed_on = d1.disbursed_on
)
ORDER BY d1.scheme_id, d1.beneficiary_id, d1.disbursed_on;

-- ============================================================
-- 3. WINDOW FUNCTION: running total of amount per scheme
-- Syllabus: window function running total (SUM() OVER)
-- ============================================================
SELECT
  d.disb_id,
  d.scheme_id,
  s.name AS scheme_name,
  d.amount,
  d.disbursed_on,
  SUM(d.amount) OVER (
    PARTITION BY d.scheme_id
    ORDER BY d.disbursed_on, d.disb_id
    ROWS UNBOUNDED PRECEDING
  ) AS running_total
FROM disbursement d
JOIN scheme s ON s.scheme_id = d.scheme_id
ORDER BY d.scheme_id, d.disbursed_on, d.disb_id;

-- ============================================================
-- 4. FULL-TEXT SEARCH: to_tsvector / to_tsquery
-- Syllabus: full-text search over scheme.name and beneficiary.full_name
-- ============================================================
SELECT
  d.disb_id,
  s.name AS scheme_name,
  b.full_name AS beneficiary,
  d.amount,
  d.disbursed_on
FROM disbursement d
JOIN scheme s ON s.scheme_id = d.scheme_id
JOIN beneficiary b ON b.beneficiary_id = d.beneficiary_id
WHERE to_tsvector('english', s.name || ' ' || b.full_name) @@
      plainto_tsquery('english', 'scholarship asha')
ORDER BY d.disbursed_on DESC;

-- ============================================================
-- 5. SET OPERATION: UNION (beneficiaries in scheme 1 OR scheme 2)
-- Syllabus: set operation (UNION / EXCEPT / INTERSECT)
-- ============================================================
-- Beneficiaries who received from scheme 1 (Post-Matric Scholarship)
SELECT b.beneficiary_id, b.full_name, b.district
FROM disbursement d
JOIN beneficiary b ON b.beneficiary_id = d.beneficiary_id
WHERE d.scheme_id = 1

UNION

-- Beneficiaries who received from scheme 2 (Flood Relief Fund)
SELECT b.beneficiary_id, b.full_name, b.district
FROM disbursement d
JOIN beneficiary b ON b.beneficiary_id = d.beneficiary_id
WHERE d.scheme_id = 2

ORDER BY full_name;

-- ============================================================
-- 6. NULL HANDLING: COALESCE / IS NULL
-- Syllabus: NULL handling example
-- Shows officials; if manager is NULL, show 'Top Level'
-- ============================================================
SELECT
  o.name AS official,
  COALESCE(m.name, 'Top Level') AS manager_name,
  CASE WHEN m.name IS NULL THEN 'Director' ELSE 'Reports To' END AS role
FROM official o
LEFT JOIN official m ON o.manager_id = m.official_id
ORDER BY o.official_id;

-- ============================================================
-- 7. VIEW: public receipt with short hash of latest ledger row
-- Syllabus: view for public receipt
-- ============================================================
CREATE OR REPLACE VIEW public_receipt AS
SELECT
  d.disb_id,
  s.name AS scheme,
  b.district,
  d.amount,
  d.disbursed_on AS date,
  encode(l.row_hash, 'hex') AS ledger_hash_short
FROM disbursement d
JOIN scheme s ON s.scheme_id = d.scheme_id
JOIN beneficiary b ON b.beneficiary_id = d.beneficiary_id
JOIN LATERAL (
  SELECT row_hash
  FROM ledger
  WHERE (payload->>'disb_id')::int = d.disb_id
  ORDER BY seq DESC
  LIMIT 1
) l ON true;

-- Demo the view
-- SELECT * FROM public_receipt;