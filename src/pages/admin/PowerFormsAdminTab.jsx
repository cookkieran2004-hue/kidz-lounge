import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useStaffNames } from '../../staffDirectory';
import { PowerFormInputs, PowerFormField, PowerFormLetterhead, PatientLabel } from '../../PowerFormFields';
import { startingAnswers } from '../../powerForms';
import { Tag } from '../../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, ACCENT, TONES, NUMERIC, buttonStyle, choiceStyle } from '../../uiTokens';

// The Power Forms page (/power-forms, footer link; Admins and Developers; kidz-lounge-api
// routes/powerForms.js). Build the forms staff send from a patient's chart.
// The builder works like Google Forms (Kieran, Oct 2026): you build on the
// form itself. Each question shows the way the parent will see it; click one
// to edit it in place, with its settings (Required, update the chart) under
// it. A question can update a chart field (parent phone, allergies...), which
// staff review before it's saved. Editing a form doesn't change ones already
// sent (they keep a copy).

const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #D4D4D8', fontSize: 14, fontFamily: 'inherit', color: INK, background: 'white' };
const card = { background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '16px 18px' };
const newId = () => `f${Math.random().toString(16).slice(2, 12)}`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const hasOptions = (type) => type === 'choice' || type === 'checkboxes';
const blankQuestion = () => ({ id: newId(), type: 'text', label: '', help: '', required: false, chart_field: '' });
const blankHeading = () => ({ id: newId(), type: 'heading', label: '', help: '', required: false, chart_field: '' });

// What the parent's answer looks like, shown under a question being edited.
const ANSWER_HINT = {
  text: 'Short answer',
  textarea: 'Long answer',
  date: 'Month / day / year',
  phone: '(555) 555-5555',
  email: 'name@example.com',
  yesno: 'Yes  /  No',
  signature: 'Typed full name, and a box to sign in',
};

// A list of choices, edited one per row. Enter adds the next one.
function OptionsEditor({ field, onChange }) {
  const refs = useRef([]);
  const focusNext = useRef(null);
  const options = field.options || [];
  useEffect(() => {
    if (focusNext.current !== null) { refs.current[focusNext.current]?.focus(); focusNext.current = null; }
  });
  const set = (list) => onChange(list);
  const add = (at) => { const n = [...options]; n.splice(at, 0, ''); focusNext.current = at; set(n); };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {options.map((o, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type={field.type === 'choice' ? 'radio' : 'checkbox'} disabled tabIndex={-1} aria-hidden="true" style={{ width: 16, height: 16, margin: 0 }} />
          <input ref={el => { refs.current[i] = el; }} aria-label={`Option ${i + 1}`} value={o} placeholder={`Option ${i + 1}`}
            style={{ ...input, border: 'none', borderBottom: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '6px 2px' }}
            onChange={e => set(options.map((x, j) => (j === i ? e.target.value : x)))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(i + 1); } }} />
          <button type="button" aria-label={`Remove option ${i + 1}`} disabled={options.length <= 1}
            onClick={() => set(options.filter((_, j) => j !== i))} style={buttonStyle('text', { padding: '2px 8px', fontSize: 18, color: MUTED })}>×</button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type={field.type === 'choice' ? 'radio' : 'checkbox'} disabled tabIndex={-1} aria-hidden="true" style={{ width: 16, height: 16, margin: 0, opacity: 0.5 }} />
        <button type="button" onClick={() => add(options.length)} style={buttonStyle('text', { padding: '4px 2px' })}>Add option</button>
      </div>
    </div>
  );
}

// The preview's answers: starting answers, and "[Child's full name]" where
// a question fills in from the chart (a real patient's details when sent).
function previewAnswers(fields, setup) {
  const out = startingAnswers(fields);
  for (const f of fields) {
    if (!f.prefill) continue;
    if (f.type === 'date') out[f.id] = f.prefill === 'today' ? new Date().toLocaleDateString('en-CA') : '2023-01-15';
    else if (f.type !== 'phone' && f.type !== 'email') out[f.id] = `[${setup.prefill?.[f.prefill]?.label || f.prefill}]`;
  }
  return out;
}

// What a question starts with (filled in by the office before it's sent;
// the parent can change it). Not for dates, signatures or headings.
function StartingAnswer({ field, onChange }) {
  const t = field.type;
  const options = (field.options || []).filter(o => o.trim());
  const row = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: MUTED };
  if (t === 'text' || t === 'textarea' || t === 'email' || t === 'phone') {
    return (
      <label style={row}>
        Starts filled in with
        <input value={field.default || ''} onChange={e => onChange(e.target.value || undefined)} placeholder="Nothing (optional)"
          style={{ ...input, flex: '1 1 200px', width: 'auto', padding: '5px 8px', fontSize: 13 }} />
      </label>
    );
  }
  if (t === 'choice' || t === 'yesno') {
    const list = t === 'yesno' ? [['yes', 'Yes'], ['no', 'No']] : options.map(o => [o, o]);
    return (
      <label style={row}>
        Starts with
        <select value={field.default || ''} onChange={e => onChange(e.target.value || undefined)} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: 13 }}>
          <option value="">Nothing picked</option>
          {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    );
  }
  if (t === 'checkboxes' && options.length) {
    const on = Array.isArray(field.default) ? field.default : [];
    return (
      <div style={row}>
        Starts ticked:
        {options.map(o => (
          <label key={o} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: INK }}>
            <input type="checkbox" checked={on.includes(o)} onChange={e => {
              const next = e.target.checked ? options.filter(x => x === o || on.includes(x)) : on.filter(x => x !== o);
              onChange(next.length ? next : undefined);
            }} /> {o}
          </label>
        ))}
      </div>
    );
  }
  return null;
}

// The question being edited.
function QuestionEditor({ field, index, count, setup, onChange, onMove, onDuplicate, onRemove }) {
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => onChange({ ...field, ...patch });
  const heading = field.type === 'heading';
  const chartChoices = Object.entries(setup.chart_fields).filter(([, v]) => v.types.includes(field.type));
  const prefillChoices = Object.entries(setup.prefill || {}).filter(([, v]) => v.types.includes(field.type));
  const changeType = (type) => {
    const patch = { type, default: undefined };
    if (!setup.chart_fields[field.chart_field]?.types.includes(type)) patch.chart_field = '';
    if (!setup.prefill?.[field.prefill]?.types.includes(type)) patch.prefill = '';
    if (hasOptions(type) && !(field.options || []).length) patch.options = ['Option 1'];
    set(patch);
  };
  const small = { padding: '5px 10px', fontSize: 13 };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <input autoFocus aria-label={heading ? 'Section title' : 'Question'} value={field.label} placeholder={heading ? 'Section title' : 'Question'}
          style={{ ...input, flex: '1 1 260px', fontSize: heading ? 17 : 15, fontWeight: heading ? 600 : 400, background: PAGE_BG }}
          onChange={e => set({ label: e.target.value })} />
        {!heading && (
          <select aria-label="Question type" value={field.type} onChange={e => changeType(e.target.value)} style={{ ...input, flex: '0 1 200px' }}>
            {Object.entries(setup.types).filter(([k]) => k !== 'heading').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>
      <textarea aria-label={heading ? 'Text under the title' : 'Description'} rows={1} value={field.help || ''}
        placeholder={heading ? 'Text under the title (optional)' : 'Description (optional)'}
        style={{ ...input, minHeight: 36, resize: 'vertical', fontSize: 13.5 }} onChange={e => set({ help: e.target.value })} />
      {hasOptions(field.type) && <OptionsEditor field={field} onChange={options => set({ options })} />}
      {!heading && !hasOptions(field.type) && (
        <div style={{ fontSize: 13.5, color: SUBTLE, borderBottom: `1px dashed ${HAIRLINE}`, padding: '4px 2px 6px', maxWidth: 360 }}>{ANSWER_HINT[field.type]}</div>
      )}
      {prefillChoices.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: MUTED }}>
          Fill in from the chart
          <select value={field.prefill || ''} onChange={e => set({ prefill: e.target.value })} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: 13 }}>
            <option value="">Don't fill in</option>
            {prefillChoices.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {field.prefill && <span>The parent can change it.</span>}
        </label>
      )}
      <StartingAnswer field={field} onChange={v => set({ default: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
        {chartChoices.length > 0 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: INK }}>
            Also update chart
            <select value={field.chart_field || ''} onChange={e => set({ chart_field: e.target.value })} style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: 13 }}>
              <option value="">Don't update</option>
              {chartChoices.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => onMove(-1)} style={buttonStyle('secondary', small)}>↑</button>
        <button type="button" aria-label="Move down" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)} style={buttonStyle('secondary', small)}>↓</button>
        <button type="button" onClick={onDuplicate} style={buttonStyle('secondary', small)}>Duplicate</button>
        {confirm ? (
          <>
            <button type="button" onClick={onRemove} style={buttonStyle('danger', small)}>Delete</button>
            <button type="button" onClick={() => setConfirm(false)} style={buttonStyle('secondary', small)}>Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} style={buttonStyle('text', { ...small, color: TONES.danger.fg })}>Delete</button>
        )}
        {!heading && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK, marginLeft: 6 }}>
            <input type="checkbox" checked={!!field.required} onChange={e => set({ required: e.target.checked })} style={{ width: 16, height: 16, margin: 0 }} /> Required
          </label>
        )}
      </div>
      {field.chart_field && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
          The answer is offered as a change to the chart's {setup.chart_fields[field.chart_field]?.label.toLowerCase()}. Staff review it before it's saved.
        </p>
      )}
    </div>
  );
}

// A question not being edited: shown as the parent will see it.
function QuestionPreview({ field, setup }) {
  const empty = !field.label.trim();
  const shown = { ...field, label: empty ? (field.type === 'heading' ? 'Untitled section' : 'Untitled question') : field.label, options: (field.options || []).filter(o => o.trim()) };
  return (
    <div>
      <div aria-hidden="true" style={{ pointerEvents: 'none', opacity: empty ? 0.6 : 1 }}>
        <PowerFormField field={shown} value={field.default} onChange={() => {}} disabled />
      </div>
      {(field.prefill || field.chart_field) && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: MUTED }}>
          {[field.prefill && `Filled in from the chart: ${setup.prefill?.[field.prefill]?.label || field.prefill}`,
            field.chart_field && `Updates chart: ${setup.chart_fields[field.chart_field]?.label}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function TemplateEditor({ template, setup, onDone, onCancel }) {
  const [name, setName] = useState(template?.name || '');
  const [intro, setIntro] = useState(template?.intro || '');
  const [fields, setFields] = useState(() => (template?.fields?.length
    ? template.fields.map(f => ({ ...f, help: f.help || '', chart_field: f.chart_field || '' }))
    : [blankQuestion()]));
  const [selected, setSelected] = useState(() => (template ? null : fields[0]?.id));
  const [preview, setPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState({});
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const cardRefs = useRef({});
  const [start] = useState(() => JSON.stringify({ name, intro, fields }));
  const dirty = JSON.stringify({ name, intro, fields }) !== start;

  const select = (id) => { setSelected(id); setLeaving(false); };
  const update = (i, f) => setFields(list => list.map((x, j) => (j === i ? f : x)));
  const moveTo = (from, to) => setFields(list => {
    if (from === to || to < 0 || to >= list.length) return list;
    const n = [...list];
    const [f] = n.splice(from, 1);
    n.splice(to, 0, f);
    return n;
  });
  // New questions go under the one being edited (or at the end).
  const insert = (f) => {
    setFields(list => {
      const at = list.findIndex(x => x.id === selected);
      const n = [...list];
      n.splice(at < 0 ? n.length : at + 1, 0, f);
      return n;
    });
    setSelected(f.id);
  };
  useEffect(() => {
    if (selected) cardRefs.current[selected]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const save = async () => {
    setBusy(true); setError(null);
    const payload = {
      name, intro,
      fields: fields.map(f => {
        const g = { ...f, chart_field: f.chart_field || null };
        if (hasOptions(f.type)) g.options = (f.options || []).map(o => o.trim()).filter(Boolean);
        else delete g.options;
        // A starting answer whose option was renamed or removed is dropped.
        if (f.type === 'choice' && !g.options.includes(g.default)) delete g.default;
        if (f.type === 'checkboxes') g.default = (g.default || []).filter(o => g.options.includes(o));
        return g;
      }),
    };
    try {
      if (template) await api.updatePowerFormTemplate(template.id, payload);
      else await api.createPowerFormTemplate(payload);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
      // "Field 3: ..." -> open that question so it can be fixed.
      const n = Number((/^Field (\d+)/.exec(err.message) || [])[1]);
      if (n && fields[n - 1]) { setPreview(false); setSelected(fields[n - 1].id); }
    }
  };
  const leave = () => { if (dirty && !leaving) setLeaving(true); else onCancel(); };

  const dropAt = (i) => { if (dragFrom !== null) moveTo(dragFrom, i); setDragFrom(null); setDragOver(null); };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 780 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={leave} disabled={busy} style={buttonStyle('text', { padding: '4px 2px' })}>← All forms</button>
        <span style={{ flex: 1 }} />
        <div role="tablist" aria-label="View" style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)} style={choiceStyle(!preview)}>Edit</button>
          <button type="button" role="tab" aria-selected={preview} onClick={() => { setPreviewValues(previewAnswers(fields, setup)); setPreview(true); }} style={choiceStyle(preview)}>Preview</button>
        </div>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save form'}</button>
      </div>
      {leaving && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 8, background: TONES.warning.bg, color: TONES.warning.fg, fontSize: 13.5 }}>
          <span style={{ flex: '1 1 200px' }}>Leave without saving? Your changes to this form will be lost.</span>
          <button type="button" onClick={onCancel} style={buttonStyle('danger', { padding: '5px 10px' })}>Leave</button>
          <button type="button" onClick={() => setLeaving(false)} style={buttonStyle('secondary', { padding: '5px 10px' })}>Keep editing</button>
        </div>
      )}
      {error && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 8, background: TONES.danger.bg, color: TONES.danger.fg, fontSize: 13.5 }}>{error}</p>}

      {preview ? (
        <div style={{ background: PAGE_BG, borderRadius: 8, padding: '20px 16px' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <PowerFormLetterhead />
            <div style={{ ...card, padding: '22px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 6 }}>
                <h3 style={{ fontSize: 26, fontWeight: 650, margin: '2px 0 0', color: INK, lineHeight: 1.25, flex: '1 1 260px' }}>{name || 'Untitled form'}</h3>
                <PatientLabel label={{ name: 'Sample Child', dob: '2023-01-15', id_number: '1234567' }} />
              </div>
              {intro && <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: INK }}>{intro}</p>}
              <PowerFormInputs fields={fields.filter(f => f.label.trim()).map(f => ({ ...f, options: (f.options || []).filter(o => o.trim()) }))}
                values={previewValues} onChange={(id, v) => setPreviewValues(x => ({ ...x, [id]: v }))} />
              <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
                <button type="button" disabled style={buttonStyle('primary', { padding: '10px 18px', fontSize: 15 })}>Submit</button>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: MUTED, margin: '10px 0 0' }}>This is a preview. Answers here aren't saved.</p>
          </div>
        </div>
      ) : (
        <>
          <div style={card}>
            <input aria-label="Form name" value={name} placeholder="Form name" onChange={e => setName(e.target.value)}
              style={{ ...input, border: 'none', borderBottom: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '6px 2px', fontSize: 22, fontWeight: 600 }} />
            <textarea aria-label="Description" value={intro} rows={2} placeholder="Description (optional): shown to the parent at the top of the form"
              onChange={e => setIntro(e.target.value)}
              style={{ ...input, border: 'none', borderBottom: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '8px 2px', marginTop: 8, resize: 'vertical', fontSize: 14 }} />
          </div>

          {fields.map((f, i) => {
            const isSel = f.id === selected;
            return (
              <div key={f.id} ref={el => { cardRefs.current[f.id] = el; }}
                onDragOver={e => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                onDrop={e => { e.preventDefault(); dropAt(i); }}
                style={{
                  ...card, position: 'relative', paddingTop: 22,
                  borderColor: isSel ? ACCENT : HAIRLINE,
                  outline: dragOver === i && dragFrom !== i ? `2px dashed ${ACCENT}` : 'none', outlineOffset: 2,
                  opacity: dragFrom === i ? 0.5 : 1,
                }}>
                <span draggable title="Drag to move" aria-hidden="true"
                  onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', f.id); if (cardRefs.current[f.id]) e.dataTransfer.setDragImage(cardRefs.current[f.id], 20, 20); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', padding: '0 14px', cursor: 'grab', color: SUBTLE, fontSize: 14, letterSpacing: 2, userSelect: 'none', lineHeight: '18px' }}>
                  ⠿⠿
                </span>
                {isSel ? (
                  <QuestionEditor field={f} index={i} count={fields.length} setup={setup}
                    onChange={nf => update(i, nf)}
                    onMove={d => moveTo(i, i + d)}
                    onDuplicate={() => insert({ ...f, id: newId(), chart_field: '', options: f.options ? [...f.options] : undefined })}
                    onRemove={() => { setFields(list => list.filter(x => x.id !== f.id)); setSelected(fields[i + 1]?.id || fields[i - 1]?.id || null); }} />
                ) : (
                  <div role="button" tabIndex={0} aria-label={`Edit ${f.type === 'heading' ? 'section' : 'question'} ${i + 1}${f.label ? `: ${f.label}` : ''}`}
                    onClick={() => select(f.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(f.id); } }}
                    style={{ cursor: 'pointer' }}>
                    <QuestionPreview field={f} setup={setup} />
                  </div>
                )}
              </div>
            );
          })}
          {fields.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>No questions yet.</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => insert(blankQuestion())} style={buttonStyle('secondary')}>+ Add question</button>
            <button type="button" onClick={() => insert(blankHeading())} style={buttonStyle('secondary')}>+ Add section heading</button>
          </div>
        </>
      )}
    </div>
  );
}

// A package: forms sent to a family as one link (e.g. Initial Clearance
// Forms). When sending, staff can untick forms the family doesn't need.
function PackageEditor({ pkg, templates, onDone, onCancel }) {
  const [name, setName] = useState(pkg?.name || '');
  const [ids, setIds] = useState(pkg?.template_ids || []);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const byId = new Map(templates.map(t => [t.id, t]));
  const addable = templates.filter(t => !t.archived && !ids.includes(t.id));
  const move = (i, d) => setIds(l => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (pkg) await api.updatePowerFormPackage(pkg.id, { name, template_ids: ids });
      else await api.createPowerFormPackage({ name, template_ids: ids });
      onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const small = { padding: '4px 9px', fontSize: 13 };
  return (
    <div style={{ ...card, display: 'grid', gap: 12 }}>
      <input aria-label="Package name" value={name} placeholder="Package name" onChange={e => setName(e.target.value)}
        style={{ ...input, border: 'none', borderBottom: `1px solid ${HAIRLINE}`, borderRadius: 0, padding: '6px 2px', fontSize: 18, fontWeight: 600 }} />
      <div style={{ fontSize: 13, color: MUTED }}>Forms, in the order the family fills them in</div>
      <ol style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 6 }}>
        {ids.map((id, i) => (
          <li key={id} style={{ fontSize: 13.5, color: INK }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>{byId.get(id)?.name || 'A deleted form'}{byId.get(id)?.archived ? ' (archived, left out when sending)' : ''}</span>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={buttonStyle('secondary', small)}>↑</button>
              <button type="button" aria-label="Move down" disabled={i === ids.length - 1} onClick={() => move(i, 1)} style={buttonStyle('secondary', small)}>↓</button>
              <button type="button" onClick={() => setIds(l => l.filter(x => x !== id))} style={buttonStyle('text', { ...small, color: TONES.danger.fg })}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      {addable.length > 0 && (
        <select aria-label="Add a form" value="" onChange={e => e.target.value && setIds(l => [...l, Number(e.target.value)])} style={{ ...input, width: 'auto', maxWidth: '100%' }}>
          <option value="">+ Add a form</option>
          {addable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save package'}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle('secondary')}>Cancel</button>
      </div>
    </div>
  );
}

function PackagesSection({ templates, showArchived }) {
  const nameOf = useStaffNames();
  const [packages, setPackages] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | package
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    api.getPowerFormPackages(true)
      .then(k => { if (alive) setPackages(k || []); })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [reload]);
  const archive = async (k, archived) => {
    try { await api.archivePowerFormPackage(k.id, archived); setReload(n => n + 1); } catch (err) { setError(err.message); }
  };
  const byId = new Map(templates.map(t => [t.id, t]));
  const shown = (packages || []).filter(k => showArchived || !k.archived);
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>Packages</h2>
        {!editing && <button type="button" onClick={() => setEditing('new')} style={buttonStyle('secondary', { marginLeft: 'auto' })}>New package</button>}
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      {editing && <PackageEditor pkg={editing === 'new' ? null : editing} templates={templates}
        onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setReload(n => n + 1); }} />}
      {packages && shown.length === 0 && !editing && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No packages yet. A package sends several forms to a family as one link.</p>}
      {shown.length > 0 && (
        <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, overflow: 'hidden', background: 'white' }}>
          {shown.map((k, i) => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: k.archived ? MUTED : INK }}>{k.name} {k.archived && <Tag>Archived</Tag>}</div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {k.template_ids.length} forms: {k.template_ids.map(id => byId.get(id)?.name).filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: 12, color: MUTED, ...NUMERIC }}>{k.updated_at ? `edited ${fmt(k.updated_at)} by ${nameOf(k.updated_by)}` : `made ${fmt(k.created_at)} by ${nameOf(k.created_by)}`}</div>
              </div>
              <button type="button" onClick={() => setEditing(k)} disabled={!!editing} style={buttonStyle('secondary')}>Edit</button>
              <button type="button" onClick={() => archive(k, !k.archived)} style={buttonStyle('text')}>{k.archived ? 'Restore' : 'Archive'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PowerFormsAdminTab() {
  const nameOf = useStaffNames();
  const [setup, setSetup] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null); // 'new' | template
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api.getPowerFormSetup()
      .then(s => { if (!alive) return; setSetup(s); return s.available ? api.getPowerFormTemplates(true) : []; })
      .then(t => { if (alive) setTemplates(t || []); })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [reload]);

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!setup || !templates) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (!setup.available) return <p style={{ fontSize: 13, color: TONES.warning.fg }}>Power Forms need the 2026-10-27 database update. Ask an admin to run it.</p>;
  if (editing) {
    return <TemplateEditor template={editing === 'new' ? null : editing} setup={setup}
      onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setReload(n => n + 1); }} />;
  }
  const shown = templates.filter(t => showArchived || !t.archived);
  const archive = async (t, archived) => {
    try { await api.archivePowerFormTemplate(t.id, archived); setReload(n => n + 1); } catch (err) { setError(err.message); }
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setEditing('new')} style={buttonStyle('primary')}>New form</button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK, marginLeft: 'auto' }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
      </div>
      {shown.length === 0 && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No forms yet. Click New form to build one.</p>}
      {shown.length > 0 && (
        <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, overflow: 'hidden', background: 'white' }}>
          {shown.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: t.archived ? MUTED : INK }}>{t.name} {t.archived && <Tag>Archived</Tag>}</div>
                <div style={{ fontSize: 12, color: MUTED, ...NUMERIC }}>
                  {(n => `${n} question${n === 1 ? '' : 's'}`)(t.fields.filter(f => f.type !== 'heading').length)} · {t.updated_at ? `edited ${fmt(t.updated_at)} by ${nameOf(t.updated_by)}` : `made ${fmt(t.created_at)} by ${nameOf(t.created_by)}`}
                </div>
              </div>
              <button type="button" onClick={() => setEditing(t)} style={buttonStyle('secondary')}>Edit</button>
              <button type="button" onClick={() => archive(t, !t.archived)} style={buttonStyle('text')}>{t.archived ? 'Restore' : 'Archive'}</button>
            </div>
          ))}
        </div>
      )}
      {setup.packages_available && <PackagesSection templates={templates} showArchived={showArchived} />}
    </div>
  );
}
