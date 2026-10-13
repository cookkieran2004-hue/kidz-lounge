import { useEffect, useRef } from 'react';
import { DateField } from './pages/SchedulePage';
import { formatPhone } from './phone';
import { INK, MUTED, HAIRLINE, TONES, NUMERIC, buttonStyle } from './uiTokens';
import { pfInputStyle, answerText } from './powerForms';

// Power Forms' fields (kidz-lounge-api lib/powerForms.js): filled in by a
// parent on the public page (PowerFormPage.jsx) and shown to staff with the
// answers (PowerFormsChartTab.jsx), and previewed in the builder.
//   field: { id, type, label, help, required, options, chart_field }
// Answers: text for most types, a list for checkboxes, 'yes' / 'no', and
// { name, image, signed_at } for a signature (image: a PNG data URL).

const inputStyle = pfInputStyle;
const labelStyle = { display: 'block', fontSize: 14, fontWeight: 600, color: INK, marginBottom: 4 };
const helpStyle = { fontSize: 13, color: MUTED, margin: '0 0 6px', lineHeight: 1.45, whiteSpace: 'pre-wrap' };

// A box to sign in with a finger, pen or mouse. onChange gets a PNG data
// URL, or null once cleared.
function SignaturePad({ value, onChange, disabled }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const last = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    // A signature already given (e.g. going back to the form) is drawn back in.
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.offsetWidth, c.offsetHeight);
      img.src = value;
      drawn.current = true;
    }
    // Drawn once: later values come from this pad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const point = (e) => { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const p = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    drawn.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (drawn.current) onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    onChange(null);
  };
  return (
    <div>
      <canvas ref={canvasRef} aria-label="Sign here" role="img"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ width: '100%', height: 150, border: `1px solid #D4D4D8`, borderRadius: 6, background: 'white', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair', display: 'block' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 12.5, color: MUTED }}>Sign above with your finger or mouse.</span>
        {!disabled && <button type="button" onClick={clear} style={buttonStyle('text', { padding: '2px 4px', fontSize: 13 })}>Clear</button>}
      </div>
    </div>
  );
}

// One field to fill in.
function FieldInput({ field, value, onChange, error, disabled }) {
  const id = `pf-${field.id}`;
  const label = (
    <label htmlFor={id} style={labelStyle}>
      {field.label}{field.required && <span style={{ color: TONES.danger.fg }}> *</span>}
    </label>
  );
  const help = field.help && <p style={helpStyle}>{field.help}</p>;
  const errStyle = error ? { borderColor: TONES.danger.fg } : {};
  if (field.type === 'heading') {
    return (
      <div style={{ paddingTop: 6 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: INK, margin: '0 0 4px' }}>{field.label}</h3>
        {help}
      </div>
    );
  }
  let input = null;
  if (field.type === 'text' || field.type === 'email') {
    input = <input id={id} type={field.type === 'email' ? 'email' : 'text'} style={{ ...inputStyle, ...errStyle }} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} />;
  } else if (field.type === 'phone') {
    input = <input id={id} type="tel" inputMode="tel" style={{ ...inputStyle, maxWidth: 240, ...errStyle, ...NUMERIC }} value={value || ''} disabled={disabled} onChange={e => onChange(formatPhone(e.target.value))} placeholder="(555) 555-5555" />;
  } else if (field.type === 'textarea') {
    input = <textarea id={id} style={{ ...inputStyle, minHeight: 90, resize: 'vertical', ...errStyle }} value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)} />;
  } else if (field.type === 'date') {
    input = <DateField id={id} ariaLabel={field.label} yearNav clearable disabled={disabled} style={{ ...inputStyle, maxWidth: 240, ...errStyle }} value={value || ''} onChange={v => onChange(v || '')} />;
  } else if (field.type === 'choice' || field.type === 'yesno') {
    const options = field.type === 'yesno' ? [['yes', 'Yes'], ['no', 'No']] : field.options.map(o => [o, o]);
    input = (
      <div role="radiogroup" aria-labelledby={`${id}-l`} style={{ display: 'grid', gap: 6 }}>
        {options.map(([v, text]) => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: INK, cursor: disabled ? 'default' : 'pointer' }}>
            <input type="radio" name={id} checked={value === v} disabled={disabled} onChange={() => onChange(v)} style={{ width: 18, height: 18, margin: 0 }} />
            {text}
          </label>
        ))}
      </div>
    );
  } else if (field.type === 'checkboxes') {
    const list = Array.isArray(value) ? value : [];
    input = (
      <div style={{ display: 'grid', gap: 6 }}>
        {field.options.map(o => (
          <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: INK, cursor: disabled ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={list.includes(o)} disabled={disabled}
              onChange={e => onChange(e.target.checked ? [...list, o] : list.filter(x => x !== o))} style={{ width: 18, height: 18, margin: 0 }} />
            {o}
          </label>
        ))}
      </div>
    );
  } else if (field.type === 'signature') {
    const v = value || {};
    input = (
      <div style={{ display: 'grid', gap: 8 }}>
        <input id={id} style={{ ...inputStyle, maxWidth: 360, ...errStyle }} placeholder="Type your full name" value={v.name || ''} disabled={disabled}
          onChange={e => onChange({ ...v, name: e.target.value })} />
        <SignaturePad value={v.image || null} disabled={disabled} onChange={image => onChange({ ...v, image })} />
      </div>
    );
  }
  return (
    <div id={`${id}-l`}>
      {label}
      {help}
      {input}
      {error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg, margin: '5px 0 0' }}>{error}</p>}
    </div>
  );
}

// The whole form to fill in. errors: { [field id]: message }.
export function PowerFormInputs({ fields, values, onChange, errors = {}, disabled }) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {fields.map(f => (
        <FieldInput key={f.id} field={f} value={values[f.id]} error={errors[f.id]} disabled={disabled}
          onChange={v => onChange(f.id, v)} />
      ))}
    </div>
  );
}

// The answers, read-only (staff).
export function PowerFormAnswers({ fields, answers }) {
  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {fields.map(f => {
        if (f.type === 'heading') {
          return <div key={f.id} style={{ fontSize: 13.5, fontWeight: 600, color: INK, padding: '12px 0 4px' }}>{f.label}</div>;
        }
        const v = answers[f.id];
        return (
          <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 12, padding: '8px 0', borderTop: `1px solid ${HAIRLINE}`, fontSize: 13.5 }}>
            <span style={{ color: MUTED }}>{f.label}</span>
            <span style={{ color: v === undefined ? MUTED : INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {f.type === 'signature' && v ? (
                <>
                  <img src={v.image} alt={`Signature of ${v.name}`} style={{ display: 'block', maxWidth: 260, maxHeight: 90, border: `1px solid ${HAIRLINE}`, borderRadius: 4, background: 'white' }} />
                  <span style={{ fontSize: 12.5, color: MUTED }}>{v.name}{v.signed_at ? ` · ${new Date(v.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</span>
                </>
              ) : (answerText(f, v) || '—')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
