-- ProofTrail: extra schema objects (Unit 1 + Unit 2 additions)
-- Run AFTER db/01_core.sql
-- Adds: official hierarchy table, disburse() function

-- ---------- Unit 1: official hierarchy (recursive CTE demo) ----------
CREATE TABLE official (
  official_id serial PRIMARY KEY,
  name        text NOT NULL,
  manager_id  int REFERENCES official(official_id)  -- self-ref for hierarchy
);

-- Seed: 3 levels (director -> manager -> officer)
INSERT INTO official(name, manager_id) VALUES
  ('Director Sharma', NULL),           -- level 1: director (no manager)
  ('Manager Patel',   1),              -- level 2: reports to director
  ('Officer Singh',   2);              -- level 3: reports to manager

-- ---------- Unit 2: disburse() function (stored procedure) ----------
-- Inserts a disbursement row; the AFTER trigger on disbursement
-- automatically writes the change into the hash-chained ledger.
CREATE OR REPLACE FUNCTION disburse(
  p_scheme      int,
  p_beneficiary int,
  p_amount      numeric,
  p_officer     text
) RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  v_disb_id int;
BEGIN
  INSERT INTO disbursement(scheme_id, beneficiary_id, amount, officer)
  VALUES (p_scheme, p_beneficiary, p_amount, p_officer)
  RETURNING disb_id INTO v_disb_id;
  RETURN v_disb_id;
END $$;

-- Quick demo: call the function
-- SELECT disburse(1, 1, 5000.00, 'Officer Singh');
-- SELECT * FROM verify_chain();  -- should return 0 rows (chain intact)