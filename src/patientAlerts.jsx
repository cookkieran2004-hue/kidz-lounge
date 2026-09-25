import { useState, useEffect } from 'react';
import { api } from './api';

// Allergy / immunization alerts. Shown in bright yellow: a warning triangle
// for allergies, a syringe for immunizations -- on the patient chart banner
// (full text) and as small icons on schedule appointment cards (text on
// hover). Only when the patient's record has that note filled in.

export const ALERT_YELLOW = '#FDE047';
export const ALERT_YELLOW_BORDER = '#EAB308';
export const ALERT_INK = '#422006';

export function WarningIcon({ size = 14, color = ALERT_INK, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'} style={{ flexShrink: 0 }}>
      {title && <title>{title}</title>}
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function SyringeIcon({ size = 14, color = ALERT_INK, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'} style={{ flexShrink: 0 }}>
      {title && <title>{title}</title>}
      <path d="m18 2 4 4" />
      <path d="m17 7 3-3" />
      <path d="M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5" />
      <path d="m9 11 4 4" />
      <path d="m5 19-3 3" />
      <path d="m14 4 6 6" />
    </svg>
  );
}

// The symbol on a small bright-yellow circle -- visible on light
// backgrounds without boxing in the text next to it.
export function AlertSymbol({ kind, size = 18, title }) {
  const Icon = kind === 'immunizations' ? SyringeIcon : WarningIcon;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: size, height: size, borderRadius: '50%', background: ALERT_YELLOW, border: `1px solid ${ALERT_YELLOW_BORDER}`,
      }}
    >
      <Icon size={Math.round(size * 0.62)} title={title} />
    </span>
  );
}

// Full-text alerts as shown on the patient chart banner and in the
// appointment window: yellow symbol, "Allergies:" / "Immunizations:", text.
// Renders nothing when both are empty. Right-aligned, wraps if long.
export function PatientAlertsInline({ allergies, immunizations, maxWidth = '55%', style }) {
  const alerts = [
    { key: 'allergies', label: 'Allergies', text: (allergies || '').trim() },
    { key: 'immunizations', label: 'Immunizations', text: (immunizations || '').trim() },
  ].filter(a => a.text);
  if (!alerts.length) return null;
  return (
    <div role="note" aria-label="Patient alerts" style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-start', columnGap: 18, rowGap: 4, maxWidth, ...style }}>
      {alerts.map(({ key, label, text }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0, color: ALERT_INK }}>
          <AlertSymbol kind={key} size={18} />
          <span style={{ fontSize: 13, lineHeight: '18px', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            <strong style={{ fontWeight: 800, marginRight: 5 }}>{label}:</strong>
            <span style={{ fontWeight: 600 }}>{text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Which patients have alerts, by name (appointments store the patient's
// name). Fetched once and shared by every card; refreshed every 5 minutes
// and right after a patient is saved (refreshPatientAlerts).
let cache = null;
let inflight = null;
let firstFetchScheduled = false;
const listeners = new Set();
function fetchAlerts() {
  inflight = api.getPatientAlerts()
    .then(rows => {
      cache = new Map((rows || []).map(r => [String(r.Name || '').trim().toLowerCase(), { allergies: (r.Allergies || '').trim(), immunizations: (r.Immunizations || '').trim() }]));
      listeners.forEach(fn => fn(cache));
      return cache;
    })
    .catch(() => cache || new Map())
    .finally(() => { inflight = null; });
  return inflight;
}
export function refreshPatientAlerts() { return fetchAlerts(); }

export function usePatientAlerts() {
  const [map, setMap] = useState(cache || new Map());
  useEffect(() => {
    listeners.add(setMap);
    // First load waits a moment so the schedule's own requests go first
    // (once for the whole page, however many cards mount).
    if (!cache && !inflight && !firstFetchScheduled) {
      firstFetchScheduled = true;
      setTimeout(() => { if (!cache && !inflight) fetchAlerts(); }, 1000);
    }
    const timer = setInterval(() => { if (!inflight) fetchAlerts(); }, 5 * 60 * 1000);
    return () => { listeners.delete(setMap); clearInterval(timer); };
  }, []);
  return map;
}

export function alertsFor(map, patientName) {
  return map.get(String(patientName || '').trim().toLowerCase()) || null;
}
