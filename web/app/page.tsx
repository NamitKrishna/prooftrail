'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface Disbursement {
  disb_id: number;
  scheme_id: number;
  scheme_name: string;
  department: string;
  beneficiary_id: number;
  beneficiary_name: string;
  district: string;
  amount: string | number;
  disbursed_on: string;
  officer: string;
}

interface LedgerEntry {
  seq: number;
  op: string;
  payload: any;
  created_at: string;
  prev_hash: string;
  row_hash: string;
}

interface VerifyResult {
  verified: boolean;
  chain: Array<{ bad_seq: number | string; problem: string }>;
  live: Array<{ disb_id: number; problem: string }>;
}

interface Scheme {
  scheme_id: number;
  name: string;
  department: string;
}

interface Beneficiary {
  beneficiary_id: number;
  full_name: string;
  district: string;
}

export default function ProofTrailPage() {
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  
  // Verification state: null = not checked, or VerifyResult
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [loadingVerify, setLoadingVerify] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string>('');

  // Add form state
  const [schemeId, setSchemeId] = useState<string>('');
  const [beneficiaryId, setBeneficiaryId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [officer, setOfficer] = useState<string>('officer_a');
  const [formError, setFormError] = useState<string>('');

  // Fetch all tables
  const refreshData = useCallback(async () => {
    try {
      const [disbRes, ledgerRes, metaRes] = await Promise.all([
        fetch('/api/disbursements'),
        fetch('/api/ledger'),
        fetch('/api/meta'),
      ]);

      if (disbRes.ok) {
        const disbData = await disbRes.json();
        setDisbursements(Array.isArray(disbData) ? disbData : []);
      }

      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        setLedger(Array.isArray(ledgerData) ? ledgerData : []);
      }

      if (metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData.schemes?.length) {
          setSchemes(metaData.schemes);
          if (!schemeId) setSchemeId(String(metaData.schemes[0].scheme_id));
        }
        if (metaData.beneficiaries?.length) {
          setBeneficiaries(metaData.beneficiaries);
          if (!beneficiaryId) setBeneficiaryId(String(metaData.beneficiaries[0].beneficiary_id));
        }
      }
    } catch (err: any) {
      console.error('Failed to refresh data:', err);
    }
  }, [schemeId, beneficiaryId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Big Verify button handler
  const handleVerify = async () => {
    setLoadingVerify(true);
    setActionStatus('Verifying ledger hash chain and live table consistency...');
    try {
      const res = await fetch('/api/verify');
      const data = await res.json();
      if (res.ok) {
        setVerifyResult({
          verified: true,
          chain: data.chain || [],
          live: data.live || [],
        });
        if ((data.chain?.length || 0) === 0 && (data.live?.length || 0) === 0) {
          setActionStatus('Verification completed: Chain intact and live data consistent.');
        } else {
          setActionStatus('Verification completed: Discrepancies detected!');
        }
      } else {
        setActionStatus(`Verify error: ${data.error}`);
      }
      await refreshData();
    } catch (err: any) {
      setActionStatus(`Verification network failure: ${err.message}`);
    } finally {
      setLoadingVerify(false);
    }
  };

  // Tamper handler (Demo)
  const handleTamper = async () => {
    if (!confirm('DEMO ACTION: This will bypass the trigger and mutate disbursement #2 amount to 1. Proceed?')) {
      return;
    }
    setActionLoading('tamper');
    setActionStatus('Tampering database (disabling trigger trg_log, updating disb_id=2, enabling trigger)...');
    try {
      const res = await fetch('/api/demo/tamper', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setActionStatus('Database tampered! disb_id = 2 was altered without trigger. Now click "Verify Integrity" to see detection.');
      } else {
        setActionStatus(`Tamper failed: ${data.error}`);
      }
      await refreshData();
    } catch (err: any) {
      setActionStatus(`Tamper error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Reset handler (Demo)
  const handleReset = async () => {
    setActionLoading('reset');
    setActionStatus('Resetting database via psql -f ../db/01_core.sql...');
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setActionStatus('Database successfully reset to clean state (db/01_core.sql reloaded).');
        setVerifyResult(null); // Clear previous verification report
      } else {
        setActionStatus(`Reset failed: ${data.error} (${data.details || ''})`);
      }
      await refreshData();
    } catch (err: any) {
      setActionStatus(`Reset error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Add Disbursement form submit handler
  const handleAddDisbursement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!schemeId || !beneficiaryId || !amount || !officer) {
      setFormError('Please fill in all fields.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount greater than 0.');
      return;
    }

    setActionLoading('add');
    try {
      const res = await fetch('/api/disbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheme_id: parseInt(schemeId, 10),
          beneficiary_id: parseInt(beneficiaryId, 10),
          amount: numAmount,
          officer: officer.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setAmount('');
        setActionStatus(`Disbursement #${data.disb_id} added successfully and recorded to ledger.`);
        await refreshData();
      } else {
        setFormError(data.error || 'Failed to add disbursement.');
      }
    } catch (err: any) {
      setFormError(`Network error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Helper to determine if a specific disbursement is flagged in verify results
  const isFlaggedDisbursement = (disbId: number) => {
    if (!verifyResult || !verifyResult.live) return false;
    return verifyResult.live.some((err) => Number(err.disb_id) === Number(disbId));
  };

  // Helper to determine if a specific ledger seq is flagged
  const isFlaggedSeq = (seq: number) => {
    if (!verifyResult || !verifyResult.chain) return false;
    return verifyResult.chain.some((err) => Number(err.bad_seq) === Number(seq));
  };

  const hasIssues =
    verifyResult &&
    verifyResult.verified &&
    ((verifyResult.chain && verifyResult.chain.length > 0) ||
      (verifyResult.live && verifyResult.live.length > 0));

  const isIntact =
    verifyResult &&
    verifyResult.verified &&
    (!verifyResult.chain || verifyResult.chain.length === 0) &&
    (!verifyResult.live || verifyResult.live.length === 0);

  return (
    <main className="container">
      {/* Header */}
      <header className="header">
        <div className="title-group">
          <h1>
            ProofTrail
            <span className="badge-chain">PostgreSQL Hash Chain</span>
          </h1>
          <p className="subtitle">
            Cryptographically tamper-evident public welfare disbursement ledger (PostgreSQL 16, PL/pgSQL triggers, SHA-256)
          </p>
        </div>
      </header>

      {/* Control Toolbar */}
      <section className="toolbar-card">
        <div className="toolbar-buttons">
          <button
            type="button"
            className="btn-verify"
            onClick={handleVerify}
            disabled={loadingVerify || !!actionLoading}
          >
            {loadingVerify ? 'Verifying...' : '🔍 Verify Integrity'}
          </button>

          <button
            type="button"
            className="btn-tamper"
            onClick={handleTamper}
            disabled={loadingVerify || !!actionLoading}
          >
            {actionLoading === 'tamper' ? 'Tampering...' : '⚡ Tamper DB (Demo)'}
          </button>

          <button
            type="button"
            className="btn-reset"
            onClick={handleReset}
            disabled={loadingVerify || !!actionLoading}
          >
            {actionLoading === 'reset' ? 'Resetting...' : '↺ Reset DB'}
          </button>

          <button
            type="button"
            className="btn-reset"
            style={{ marginLeft: 'auto' }}
            onClick={() => refreshData()}
            disabled={loadingVerify || !!actionLoading}
          >
            Refresh Tables
          </button>
        </div>

        {/* Verification Status Banner */}
        {verifyResult === null ? (
          <div className="verification-banner idle">
            <span>
              Status: <strong>Unchecked</strong>. Click <strong>Verify Integrity</strong> to check ledger hash links and live table consistency.
            </span>
          </div>
        ) : isIntact ? (
          <div className="verification-banner success">
            <div className="banner-title">
              <span>✓ Chain intact</span>
            </div>
            <p style={{ fontSize: '14px', color: '#7ee787' }}>
              All SHA-256 ledger links match LAG() window validation. No live disbursement rows differ from ledger payloads.
            </p>
          </div>
        ) : hasIssues ? (
          <div className="verification-banner danger">
            <div className="banner-title">
              <span>⚠ Tampering Detected! Chain or Live Integrity Compromised</span>
            </div>
            <p style={{ fontSize: '13px', color: '#ff7b72' }}>
              The following discrepancies were identified by verify_chain() and verify_live:
            </p>
            <div className="error-list">
              {verifyResult.chain?.map((item, idx) => (
                <div key={`chain-${idx}`} className="error-item">
                  <span className="error-badge">LEDGER CHAIN</span>
                  <strong>bad_seq: {item.bad_seq}</strong> — {item.problem}
                </div>
              ))}
              {verifyResult.live?.map((item, idx) => (
                <div key={`live-${idx}`} className="error-item">
                  <span className="error-badge">LIVE TABLE</span>
                  <strong>disb_id: {item.disb_id}</strong> — {item.problem}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {actionStatus && (
          <div className="status-msg">
            <span>ℹ {actionStatus}</span>
          </div>
        )}
      </section>

      {/* Add Disbursement Form */}
      <section className="card">
        <div className="card-title">
          <span>Record New Disbursement</span>
          <span className="card-subtitle">Inserts trigger automatic ledger entry with previous hash link</span>
        </div>

        <form onSubmit={handleAddDisbursement} className="form-grid">
          <div className="form-group">
            <label htmlFor="scheme_select">Welfare Scheme</label>
            <select
              id="scheme_select"
              className="form-select"
              value={schemeId}
              onChange={(e) => setSchemeId(e.target.value)}
              required
            >
              {schemes.length > 0 ? (
                schemes.map((s) => (
                  <option key={s.scheme_id} value={s.scheme_id}>
                    {s.name} ({s.department})
                  </option>
                ))
              ) : (
                <>
                  <option value="1">Post-Matric Scholarship (Education)</option>
                  <option value="2">Flood Relief Fund (Revenue)</option>
                  <option value="3">Senior Citizen Pension (Social Welfare)</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="beneficiary_select">Beneficiary</label>
            <select
              id="beneficiary_select"
              className="form-select"
              value={beneficiaryId}
              onChange={(e) => setBeneficiaryId(e.target.value)}
              required
            >
              {beneficiaries.length > 0 ? (
                beneficiaries.map((b) => (
                  <option key={b.beneficiary_id} value={b.beneficiary_id}>
                    {b.full_name} ({b.district})
                  </option>
                ))
              ) : (
                <>
                  <option value="1">Asha Rao (Bengaluru Urban)</option>
                  <option value="2">Imran Khan (Mysuru)</option>
                  <option value="3">Lakshmi N (Tumakuru)</option>
                  <option value="4">Ravi Kumar (Belagavi)</option>
                  <option value="5">Meera S (Hassan)</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="amount_input">Amount (₹)</label>
            <input
              id="amount_input"
              type="number"
              step="0.01"
              min="0.01"
              className="form-input"
              placeholder="e.g. 20000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="officer_input">Disbursing Officer</label>
            <input
              id="officer_input"
              type="text"
              className="form-input"
              placeholder="e.g. officer_a"
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
              required
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn-submit"
              disabled={actionLoading === 'add'}
              style={{ width: '100%' }}
            >
              {actionLoading === 'add' ? 'Recording...' : '+ Add Disbursement'}
            </button>
          </div>
        </form>

        {formError && (
          <p style={{ color: '#f85149', fontSize: '13px', marginTop: '4px' }}>
            {formError}
          </p>
        )}
      </section>

      {/* Disbursements Table */}
      <section className="card">
        <div className="card-title">
          <span>Live Disbursements Table (<code>disbursement</code>)</span>
          <span className="card-subtitle">{disbursements.length} records</span>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Scheme</th>
                <th>Department</th>
                <th>Beneficiary</th>
                <th>District</th>
                <th>Amount (₹)</th>
                <th>Disbursed On</th>
                <th>Officer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No disbursements found.
                  </td>
                </tr>
              ) : (
                disbursements.map((row) => {
                  const flagged = isFlaggedDisbursement(row.disb_id);
                  return (
                    <tr key={row.disb_id} className={flagged ? 'row-tampered' : ''}>
                      <td><strong>#{row.disb_id}</strong></td>
                      <td>{row.scheme_name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{row.department}</td>
                      <td><strong>{row.beneficiary_name}</strong></td>
                      <td>{row.district}</td>
                      <td className="currency">
                        ₹{Number(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td>{String(row.disbursed_on).slice(0, 10)}</td>
                      <td><code>{row.officer}</code></td>
                      <td>
                        {flagged ? (
                          <span style={{ color: '#f85149', fontWeight: 600 }}>
                            <span className="status-dot red" />
                            Tampered
                          </span>
                        ) : (
                          <span style={{ color: '#3fb950', fontSize: '12px' }}>
                            <span className="status-dot green" />
                            Live
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Ledger Table */}
      <section className="card">
        <div className="card-title">
          <span>Audit Ledger Chain (<code>ledger</code>)</span>
          <span className="card-subtitle">
            Cryptographic SHA-256 hash chain ({ledger.length} blocks)
          </span>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Seq</th>
                <th>Op</th>
                <th>Disb ID</th>
                <th>Payload</th>
                <th>Timestamp</th>
                <th>Prev Hash (8 chars)</th>
                <th>Row Hash (8 chars)</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    Ledger is currently empty.
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => {
                  const flagged = isFlaggedSeq(entry.seq);
                  const disbId = entry.payload?.disb_id ?? '-';
                  const shortPrev = entry.prev_hash ? entry.prev_hash.slice(0, 8) : '--------';
                  const shortRow = entry.row_hash ? entry.row_hash.slice(0, 8) : '--------';

                  return (
                    <tr key={entry.seq} className={flagged ? 'row-tampered' : ''}>
                      <td><strong>#{entry.seq}</strong></td>
                      <td>
                        <span className={`badge-op ${entry.op.toLowerCase()}`}>
                          {entry.op}
                        </span>
                      </td>
                      <td>#{disbId}</td>
                      <td>
                        <div className="code-payload" title={JSON.stringify(entry.payload)}>
                          {JSON.stringify(entry.payload)}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td>
                        <span className="code-hash" title={`Full Prev Hash: ${entry.prev_hash}`}>
                          {shortPrev}
                        </span>
                      </td>
                      <td>
                        <span className="code-hash" title={`Full Row Hash: ${entry.row_hash}`}>
                          {shortRow}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
