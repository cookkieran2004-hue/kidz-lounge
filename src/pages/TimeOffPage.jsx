import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';

const BRAND_PURPLE = '#6D28D9';
const BRAND_TINT = '#F5F3FF';
const BORDER = '#e2e4e9';

const BALANCE_TYPES = ['Vacation', 'Sick', 'Personal'];
const BALANCE_NEUTRAL_TYPES = ['Lunch', 'Meeting', 'Unavailable', 'Other'];
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function StatusBadge({ status }) {
  const colors = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    approved: { bg: '#D1FAE5', text: '#065F46' },
    denied: { bg: '#FEE2E2', text: '#991B1B' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: c.bg, color: c.text, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function requestSummary(req) {
  if (req.is_balance_type) {
    const dayLabel = req.is_half_day ? `half day (${req.half_day_period})` : (req.start_date === req.end_date ? '1 day' : `${formatDate(req.start_date)} - ${formatDate(req.end_date)}`);
    return `${req.request_type} \u2014 ${req.start_date === req.end_date ? formatDate(req.start_date) : ''} ${dayLabel}`.trim();
  }
  if (req.is_recurring) {
    return `${req.request_type} \u2014 every ${WEEKDAY_LABELS[req.weekday]}, ${req.start_time?.slice(0, 5)}-${req.end_time?.slice(0, 5)}, starting ${formatDate(req.recurring_start_date)}`;
  }
  return `${req.request_type} \u2014 ${formatDate(req.ooo_date)}, ${req.start_time?.slice(0, 5)}-${req.end_time?.slice(0, 5)}`;
}

function RequestForm({ onSubmitted, onCancel }) {
  const isMobile = useIsMobile(768);
  const [requestType, setRequestType] = useState('Vacation');
  const [isRecurring, setIsRecurring] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState('AM');
  const [oooDate, setOooDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [weekday, setWeekday] = useState(1);
  const [recurringStartDate, setRecurringStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isBalanceType = BALANCE_TYPES.includes(requestType);

  useEffect(() => {
    if (isBalanceType && isRecurring) setIsRecurring(false);
  }, [isBalanceType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setError(null);
    const record = { request_type: requestType, is_recurring: isRecurring, notes };
    if (isBalanceType) {
      if (!startDate || !endDate) { setError('Start and end dates are required.'); return; }
      Object.assign(record, { start_date: startDate, end_date: isHalfDay ? startDate : endDate, is_half_day: isHalfDay, half_day_period: isHalfDay ? halfDayPeriod : null });
    } else if (isRecurring) {
      if (!startTime || !endTime || !recurringStartDate) { setError('Start time, end time, and a starting date are required.'); return; }
      Object.assign(record, { weekday, start_time: startTime, end_time: endTime, recurring_start_date: recurringStartDate });
    } else {
      if (!oooDate || !startTime || !endTime) { setError('Date, start time, and end time are required.'); return; }
      Object.assign(record, { ooo_date: oooDate, start_time: startTime, end_time: endTime });
    }
    setSaving(true);
    try {
      await api.submitTimeOffRequest(record);
    } catch (err) {
      setSaving(false); setError(err.message); return;
    }
    setSaving(false);
    onSubmitted();
  };

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const inputStyle = { width: '100%', padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };

  return (
    <div style={{ padding: isMobile ? 16 : 20, border: `1.5px solid ${BORDER}`, borderRadius: 10, marginBottom: 20, background: '#fafafa' }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Type</label>
        <select style={inputStyle} value={requestType} onChange={e => setRequestType(e.target.value)}>
          <optgroup label="Balance types">
            {BALANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
          <optgroup label="Other">
            {BALANCE_NEUTRAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </select>
      </div>

      {isBalanceType ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            {!isHalfDay && (
              <div>
                <label style={labelStyle}>End Date</label>
                <input type="date" style={inputStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            )}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={isHalfDay} onChange={e => setIsHalfDay(e.target.checked)} />
            Half day only
          </label>
          {isHalfDay && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Which half</label>
              <select style={inputStyle} value={halfDayPeriod} onChange={e => setHalfDayPeriod(e.target.value)}>
                <option value="AM">Morning</option>
                <option value="PM">Afternoon</option>
              </select>
            </div>
          )}
        </>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            Repeats weekly
          </label>
          {isRecurring ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Day of week</label>
                <select style={inputStyle} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
                  {WEEKDAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Starting</label>
                <input type="date" style={inputStyle} value={recurringStartDate} onChange={e => setRecurringStartDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={oooDate} onChange={e => setOooDate(e.target.value)} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Notes (optional)</label>
        <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={handleSubmit} disabled={saving} style={{ padding: isMobile ? '11px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer' }}>
          {saving ? 'Submitting...' : 'Submit Request'}
        </button>
        <button onClick={onCancel} disabled={saving} style={{ padding: isMobile ? '11px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function BalanceCards({ balances, isMobile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
      {balances.map(b => (
        <div key={b.balance_type} style={{ padding: 16, borderRadius: 10, border: `1.5px solid ${BORDER}`, background: b.balance_days < 0 ? '#FEF2F2' : BRAND_TINT }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>{b.balance_type}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: b.balance_days < 0 ? '#991B1B' : '#241A33' }}>
            {b.balance_days} <span style={{ fontSize: 13, fontWeight: 500 }}>days</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestList({ requests, isMobile, showUsername, onApprove, onDeny }) {
  if (requests.length === 0) {
    return <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 24 }}>Nothing here yet.</p>;
  }
  return (
    <div>
      {requests.map(req => (
        <div key={req.id} style={{ padding: '12px 4px', borderBottom: `1px solid #f1f2f4`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
          <div>
            {showUsername && <div style={{ fontSize: 12, fontWeight: 700, color: BRAND_PURPLE, marginBottom: 2 }}>{req.username}</div>}
            <div style={{ fontSize: 13.5, color: '#111827' }}>{requestSummary(req)}</div>
            {req.notes && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{req.notes}</div>}
            {req.status === 'denied' && req.review_note && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>Reason: {req.review_note}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={req.status} />
            {req.status === 'pending' && onApprove && (
              <>
                <button onClick={() => onApprove(req.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', background: '#059669', color: 'white', cursor: 'pointer' }}>Approve</button>
                <button onClick={() => onDeny(req.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>Deny</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TimeOffPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(768);
  const [tab, setTab] = useState('mine');
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [denyingId, setDenyingId] = useState(null);
  const [denyNote, setDenyNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [b, mine] = await Promise.all([api.getMyTimeOffBalances(), api.getMyTimeOffRequests()]);
    setBalances(b);
    setMyRequests(mine);
    if (user.role === 'admin') {
      const pending = await api.getAllTimeOffRequests('pending');
      setPendingRequests(pending);
    }
    setLoading(false);
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    await api.approveTimeOffRequest(id);
    load();
  };
  const handleDenyConfirm = async () => {
    await api.denyTimeOffRequest(denyingId, denyNote);
    setDenyingId(null);
    setDenyNote('');
    load();
  };

  if (loading) return <div style={{ padding: 24, fontSize: 14, color: '#6b7280' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: isMobile ? 16 : 28, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: isMobile ? 19 : 22, fontWeight: 700, color: '#241A33', marginBottom: 18 }}>Time Off</h1>

      <BalanceCards balances={balances} isMobile={isMobile} />

      {showForm ? (
        <RequestForm onSubmitted={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: isMobile ? '12px' : '9px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer', marginBottom: 20, width: isMobile ? '100%' : 'auto' }}
        >
          + Request Time Off
        </button>
      )}

      {user.role === 'admin' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1.5px solid ${BORDER}` }}>
          {[{ key: 'mine', label: 'My Requests' }, { key: 'pending', label: `Pending Approvals${pendingRequests.length ? ` (${pendingRequests.length})` : ''}` }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13.5, fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? BRAND_PURPLE : '#6b7280',
                borderBottom: tab === t.key ? `2px solid ${BRAND_PURPLE}` : '2px solid transparent',
                marginBottom: -2,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' || user.role !== 'admin' ? (
        <RequestList requests={myRequests} isMobile={isMobile} />
      ) : (
        <RequestList
          requests={pendingRequests}
          isMobile={isMobile}
          showUsername
          onApprove={handleApprove}
          onDeny={(id) => setDenyingId(id)}
        />
      )}

      {denyingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => setDenyingId(null)}>
          <div style={{ background: 'white', borderRadius: 10, padding: 20, maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Deny this request?</h3>
            <textarea
              placeholder="Reason (optional, shown to the employee)"
              value={denyNote}
              onChange={e => setDenyNote(e.target.value)}
              style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: 'border-box', marginBottom: 12, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDenyingId(null)} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDenyConfirm} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer' }}>Deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
