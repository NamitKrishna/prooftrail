# Normalization: From Flat Table to BCNF (Unit 3)

## 1. Messy Flat Table (Unnormalized)

```
disbursement_flat (
  disb_id,           -- disbursement ID
  scheme_name,       -- e.g., 'Post-Matric Scholarship'
  scheme_dept,       -- e.g., 'Education'
  beneficiary_name,  -- e.g., 'Asha Rao'
  district,          -- e.g., 'Bengaluru Urban'
  amount,            -- e.g., 25000.00
  officer,           -- e.g., 'officer_a'
  officer_manager    -- e.g., 'Manager Patel'
)
```

Sample data:
| disb_id | scheme_name            | scheme_dept     | beneficiary_name | district         | amount   | officer     | officer_manager |
|---------|------------------------|-----------------|------------------|------------------|----------|-------------|-----------------|
| 1       | Post-Matric Scholarship| Education       | Asha Rao         | Bengaluru Urban  | 25000.00 | officer_a   | Manager Patel   |
| 2       | Flood Relief Fund      | Revenue         | Imran Khan       | Mysuru           | 10000.00 | officer_b   | Director Sharma |
| 3       | Senior Citizen Pension | Social Welfare  | Lakshmi N        | Tumakuru         | 3000.00  | officer_a   | Manager Patel   |
| 4       | Post-Matric Scholarship| Education       | Ravi Kumar       | Belagavi         | 25000.00 | officer_c   | Manager Patel   |

---

## 2. Functional Dependencies (FDs)

From the data semantics:

| # | Functional Dependency | Reason |
|---|----------------------|--------|
| FD1 | `disb_id → scheme_name, scheme_dept, beneficiary_name, district, amount, officer, officer_manager` | disb_id is the primary identifier |
| FD2 | `scheme_name → scheme_dept` | Each scheme belongs to exactly one department |
| FD3 | `beneficiary_name → district` | Each beneficiary lives in one district |
| FD4 | `officer → officer_manager` | Each officer has exactly one manager |
| FD5 | `scheme_name, beneficiary_name, disbursed_on → amount, officer` | (Not in flat table above, but realistic) |

**Note:** `disbursed_on` is not shown in flat table but would be in real data. For this exercise we assume the flat table has one row per disbursement event.

---

## 3. Candidate Key (using Armstrong's Axioms)

**Given FDs:** FD1-FD4 above.

**Closure of {disb_id}:**
```
{disb_id}⁺ = {disb_id}                    (reflexivity)
          ∪ {scheme_name, scheme_dept, beneficiary_name, district, amount, officer, officer_manager}  (by FD1, augmentation+transitivity)
          = all attributes
```

**Closure of other combinations:**
- `{scheme_name, beneficiary_name}⁺` = {scheme_name, scheme_dept, beneficiary_name, district} — missing disb_id, amount, officer, officer_manager
- `{officer}⁺` = {officer, officer_manager} — missing most attributes

**Conclusion:** `{disb_id}` is the **only candidate key** (and thus the primary key).

---

## 4. Normalization Steps

### 1NF: Eliminate Repeating Groups
The flat table already has atomic values (no arrays, no composite attributes). **Already in 1NF.**

### 2NF: Eliminate Partial Dependencies
**Definition:** No non-prime attribute depends on a proper subset of a candidate key.

Since the candidate key is a **single attribute** (`disb_id`), there are **no proper subsets**. **Already in 2NF.**

*But wait — the FDs FD2, FD3, FD4 show non-key attributes determining other non-key attributes. These are **transitive dependencies**, not partial dependencies. They are addressed in 3NF.*

### 3NF: Eliminate Transitive Dependencies
**Definition:** No non-prime attribute transitively depends on the candidate key.

**Transitive dependencies found:**
- `disb_id → scheme_name → scheme_dept`  (FD1 + FD2)
- `disb_id → beneficiary_name → district`  (FD1 + FD3)
- `disb_id → officer → officer_manager`  (FD1 + FD4)

**Decompose into 3NF relations:**

| Relation | Attributes | PK | FDs |
|----------|------------|-----|-----|
| **scheme** | scheme_id, scheme_name, scheme_dept | scheme_id | scheme_name → scheme_dept |
| **beneficiary** | beneficiary_id, beneficiary_name, district | beneficiary_id | beneficiary_name → district |
| **official** | official_id, officer_name, manager_id | official_id | officer_name → manager_id |
| **disbursement** | disb_id, scheme_id, beneficiary_id, amount, official_id, disbursed_on | disb_id | — |

All non-key attributes now depend **only on the key** (or are keys themselves). **In 3NF.**

### BCNF: Every Determinant is a Candidate Key
**Definition:** For every non-trivial FD X → Y, X is a superkey.

Check each 3NF relation:

| Relation | FDs | Is LHS a superkey? |
|----------|-----|-------------------|
| scheme | scheme_name → scheme_dept | **NO** — scheme_name is not a key (scheme_id is) |
| beneficiary | beneficiary_name → district | **NO** — beneficiary_name is not a key |
| official | officer_name → manager_id | **NO** — officer_name is not a key |
| disbursement | (none besides PK) | YES |

**Violations found!** The 3NF relations still have FDs where the determinant is not a superkey.

**Decompose to BCNF:**

For **scheme**: FD `scheme_name → scheme_dept` violates BCNF.
- Create `scheme_dept_lookup(scheme_name PK, scheme_dept)`
- But `scheme_name` is already unique in practice → make it a candidate key
- Or: accept that `scheme_id` is surrogate, `scheme_name` is natural key

**Practical BCNF for this schema:**
- Add `UNIQUE(scheme_name)` to scheme table → `scheme_name` becomes candidate key
- Add `UNIQUE(beneficiary_name)` to beneficiary table
- Add `UNIQUE(officer_name)` to official table

With these unique constraints, all FDs have superkeys on LHS. **Schema is now in BCNF.**

---

## 5. 3NF but not BCNF: Classic Example

A relation can be in 3NF but violate BCNF when:
- A non-prime attribute determines another non-prime attribute
- But that determinant is part of a candidate key

**Example:**
```
student_course (
  student_id,
  course_id,
  instructor,      -- each course has one instructor
  instructor_dept  -- each instructor belongs to one dept
)
PK: (student_id, course_id)
FDs:
  (student_id, course_id) → instructor, instructor_dept
  instructor → instructor_dept
  course_id → instructor
```

**Is it in 3NF?**
- `instructor_dept` depends on `instructor` (non-prime)
- But `instructor` is **not a non-prime attribute** — it's part of candidate key `(course_id, instructor)`!
- 3NF allows this (determinant is part of a key)

**Is it in BCNF?**
- `instructor → instructor_dept`: LHS `instructor` is NOT a superkey
- **VIOLATES BCNF**

**Fix:** Decompose into:
- `course_instructor(course_id PK, instructor)`
- `instructor_dept(instructor PK, instructor_dept)`

---

## 6. Mapping to ProofTrail Actual Schema

| Normalized Relation | ProofTrail Table | Notes |
|---------------------|------------------|-------|
| scheme | `scheme(scheme_id, name, department)` | `name` has UNIQUE constraint → BCNF |
| beneficiary | `beneficiary(beneficiary_id, full_name, district)` | `full_name` not unique in practice (could have duplicates) → 3NF only |
| official | `official(official_id, name, manager_id)` | Self-ref FK; `name` not forced unique → 3NF |
| disbursement | `disbursement(disb_id, scheme_id, beneficiary_id, amount, disbursed_on, officer)` | `officer` is text, not FK to official (simplified) |

**Why not full BCNF in ProofTrail?**
- `beneficiary.full_name` not unique (two people can have same name)
- `official.name` not unique (could have same name)
- `disbursement.officer` is free-text, not FK

This is a **pragmatic 3NF design** — good enough for the application, avoids over-normalization where natural keys aren't truly unique.