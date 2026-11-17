-- ProofTrail: tamper-evident ledger for public welfare disbursement (PostgreSQL 13+)
-- Run: psql -d prooftrail -f prooftrail_core.sql

DROP VIEW  IF EXISTS verify_live, latest_ledger;
DROP TABLE IF EXISTS ledger, chain_head, disbursement, beneficiary, scheme CASCADE;
DROP SEQUENCE IF EXISTS ledger_seq;
DROP FUNCTION IF EXISTS verify_chain(), log_change(), block_edit(), ledger_hash(bigint,text,jsonb,timestamptz,bytea);

-- ---------- Unit 1: schema with keys and constraints ----------
CREATE TABLE scheme (
  scheme_id  serial PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  department text NOT NULL
);

CREATE TABLE beneficiary (
  beneficiary_id serial PRIMARY KEY,
  full_name      text NOT NULL,
  district       text NOT NULL
);

CREATE TABLE disbursement (
  disb_id        serial PRIMARY KEY,
  scheme_id      int NOT NULL REFERENCES scheme(scheme_id),
  beneficiary_id int NOT NULL REFERENCES beneficiary(beneficiary_id),
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  disbursed_on   date NOT NULL DEFAULT current_date,
  officer        text NOT NULL
);

-- ---------- The ledger (hash chain) ----------
CREATE SEQUENCE ledger_seq;

CREATE TABLE ledger (
  seq        bigint PRIMARY KEY,
  op         text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  prev_hash  bytea NOT NULL,
  row_hash   bytea NOT NULL
);

-- single-row table: holds the chain head AND serves as the lock that prevents chain forks (Unit 4)
CREATE TABLE chain_head (
  id        int PRIMARY KEY CHECK (id = 1),
  last_hash bytea NOT NULL
);
INSERT INTO chain_head VALUES (1, sha256(convert_to('genesis','UTF8')));

CREATE FUNCTION ledger_hash(p_seq bigint, p_op text, p_payload jsonb, p_ts timestamptz, p_prev bytea)
RETURNS bytea LANGUAGE sql AS $$
  SELECT sha256(convert_to(
    p_seq::text || '|' || p_op || '|' || p_payload::text || '|' ||
    extract(epoch FROM p_ts)::text || '|' || encode(p_prev, 'hex'), 'UTF8'));
$$;

-- ---------- Unit 2: trigger that writes every change into the chain ----------
CREATE FUNCTION log_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prev bytea; rec jsonb; s bigint; h bytea;
  ts timestamptz := clock_timestamp();
BEGIN
  -- serialize writers: concurrent inserts would otherwise read the same prev_hash and fork the chain
  SELECT last_hash INTO prev FROM chain_head WHERE id = 1 FOR UPDATE;
  rec := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  s   := nextval('ledger_seq');
  h   := ledger_hash(s, TG_OP, rec, ts, prev);
  INSERT INTO ledger VALUES (s, TG_OP, rec, ts, prev, h);
  UPDATE chain_head SET last_hash = h WHERE id = 1;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_log
AFTER INSERT OR UPDATE OR DELETE ON disbursement
FOR EACH ROW EXECUTE FUNCTION log_change();

-- the ledger itself is append-only for normal users
CREATE FUNCTION block_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger is append-only'; END $$;

CREATE TRIGGER no_edit
BEFORE UPDATE OR DELETE ON ledger
FOR EACH ROW EXECUTE FUNCTION block_edit();

-- ---------- Verification: window function LAG() checks every link ----------
CREATE FUNCTION verify_chain() RETURNS TABLE(bad_seq bigint, problem text)
LANGUAGE sql AS $$
  WITH c AS (
    SELECT l.*, LAG(row_hash) OVER (ORDER BY seq) AS expected_prev
    FROM ledger l
  )
  SELECT seq, 'row content or hash was altered'
    FROM c WHERE row_hash <> ledger_hash(seq, op, payload, created_at, prev_hash)
  UNION ALL
  SELECT seq, 'chain link broken (row removed or reordered)'
    FROM c WHERE prev_hash <> COALESCE(expected_prev, sha256(convert_to('genesis','UTF8')))
  UNION ALL
  SELECT seq, 'tail truncated (head does not match last row)'
    FROM c WHERE seq = (SELECT max(seq) FROM ledger)
             AND row_hash <> (SELECT last_hash FROM chain_head)
  ORDER BY 1;
$$;

-- catches edits made to the live table that bypassed the trigger
CREATE VIEW latest_ledger AS
SELECT DISTINCT ON ((payload->>'disb_id')::int)
       (payload->>'disb_id')::int AS disb_id, op, payload
FROM ledger
ORDER BY (payload->>'disb_id')::int, seq DESC;

CREATE VIEW verify_live AS
SELECT l.disb_id, 'table row differs from its last ledger entry' AS problem
FROM latest_ledger l JOIN disbursement d USING (disb_id)
WHERE to_jsonb(d) <> l.payload
UNION ALL
SELECT l.disb_id, 'row missing from table (silent delete)'
FROM latest_ledger l
WHERE l.op <> 'DELETE'
  AND NOT EXISTS (SELECT 1 FROM disbursement d WHERE d.disb_id = l.disb_id);

-- ---------- Seed data ----------
INSERT INTO scheme(name, department) VALUES
  ('Post-Matric Scholarship', 'Education'),
  ('Flood Relief Fund',       'Revenue'),
  ('Senior Citizen Pension',  'Social Welfare');

INSERT INTO beneficiary(full_name, district) VALUES
  ('Asha Rao','Bengaluru Urban'), ('Imran Khan','Mysuru'), ('Lakshmi N','Tumakuru'),
  ('Ravi Kumar','Belagavi'), ('Meera S','Hassan');

INSERT INTO disbursement(scheme_id, beneficiary_id, amount, officer) VALUES
  (1,1,25000,'officer_a'), (2,2,10000,'officer_b'), (3,3,3000,'officer_a'),
  (1,4,25000,'officer_c'), (2,5,15000,'officer_b');

-- ---------- Demo ----------
-- 1) Healthy chain: both return 0 rows
--    SELECT * FROM verify_chain();   SELECT * FROM verify_live;
--
-- 2) Silent edit of the live table (DBA bypasses the trigger):
--    ALTER TABLE disbursement DISABLE TRIGGER trg_log;
--    UPDATE disbursement SET amount = 1000 WHERE disb_id = 2;
--    ALTER TABLE disbursement ENABLE TRIGGER trg_log;
--    SELECT * FROM verify_live;      -- flags disb_id 2
--
-- 3) Edit history inside the ledger itself:
--    ALTER TABLE ledger DISABLE TRIGGER no_edit;
--    UPDATE ledger SET payload = jsonb_set(payload,'{amount}','1') WHERE seq = 3;
--    ALTER TABLE ledger ENABLE TRIGGER no_edit;
--    SELECT * FROM verify_chain();   -- flags seq 3
