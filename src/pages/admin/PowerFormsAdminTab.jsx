import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useStaffNames } from '../../staffDirectory';
import { PowerFormInputs } from '../../PowerFormFields';
import { Tag } from '../../dashboardUi';
import { INK, MUTED, HAIRLINE, TONES, NUMERIC, buttonStyle, choiceStyle } from '../../uiTokens';

// Admin -> Power Forms (Admins and Developers; kidz-lounge-api
// routes/powerForms.js). Build the forms staff send from a patient's chart:
// a name, an intro the parent sees first, and fields. A field can update a
// chart field (parent phone, allergies...), which staff review before it's
// saved. Editing a form doesn't change ones already sent (they keep a copy).

const input = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6, border: '1px solid #D4D4D8', fontSize: 13, fontFamily: 'inherit', color: INK, background: 'white' };
const label = { display: 'block', fontSize: 12, fontWeight: 500, color: '#52525B', marginBottom: 4 };
const newId = () => `f${Math.random().toString(16).slice(2, 12)}`;
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function FieldEditor({ field, index, count, setup, onChange, onMove, onRemove }) {
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => onChange({ ...field, ...patch });
  const hasOptions = field.type === 'choice' || field.type === 'checkboxes';
  const chartChoices = Object.entries(setup.chart_fields).filter(([, v]) => v.types.includes(field.type));
  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: 12, background: 'white' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: MUTED, ...NUMERIC, minWidth: 18 }}>{index + 1}</span>
        <select aria-label="Field type" value={field.type} style={{ ...input, width: 'auto' }}
          onChange={e => set({ type: e.target.value, chart_field: setup.chart_fields[field.chart_field]?.types.includes(e.target.value) ? field.chart_field : '' })}>
          {Object.entries(setup.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {field.type !== 'heading' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK }}>
            <input type="checkbox" checked={!!field.required} onChange={e => set({ required: e.target.checked })} /> Required
          </label>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} style={buttonStyle('secondary', { padding: '4px 8px' })}>↑</button>
        <button type="button" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)} style={buttonStyle('secondary', { padding: '4px 8px' })}>↓</button>
        {confirm ? (
          <>
            <button type="button" onClick={onRemove} style={buttonStyle('danger', { padding: '4px 10px' })}>Remove</button>
            <button type="button" onClick={() => setConfirm(false)} style={buttonStyle('secondary', { padding: '4px 10px' })}>Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} style={buttonStyle('text', { color: TONES.danger.fg })}>Remove</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 10 }}>
        <div>
          <label style={label} htmlFor={`pfb-label-${field.id}`}>{field.type === 'heading' ? 'Heading' : 'Question'}</label>
          <input id={`pfb-label-${field.id}`} style={input} value={field.label} onChange={e => set({ label: e.target.value })} />
        </div>
        <div>
          <label style={label} htmlFor={`pfb-help-${field.id}`}>{field.type === 'heading' ? 'Text under it (optional)' : 'Help text (optional)'}</label>
          <input id={`pfb-help-${field.id}`} style={input} value={field.help || ''} onChange={e => set({ help: e.target.value })} />
        </div>
        {chartChoices.length > 0 && (
          <div>
            <label style={label} htmlFor={`pfb-chart-${field.id}`}>Updates chart field</label>
            <select id={`pfb-chart-${field.id}`} style={input} value={field.chart_field || ''} onChange={e => set({ chart_field: e.target.value })}>
              <option value="">No</option>
              {chartChoices.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        )}
      </div>
      {hasOptions && (
        <div style={{ marginTop: 10 }}>
          <label style={label} htmlFor={`pfb-opts-${field.id}`}>Choices (one per line)</label>
          <textarea id={`pfb-opts-${field.id}`} style={{ ...input, minHeight: 72, resize: 'vertical' }}
            value={field.optionsText ?? (field.options || []).join('\n')}
            onChange={e => set({ optionsText: e.target.value, options: e.target.value.split('\n').map(o => o.trim()).filter(Boolean) })} />
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, setup, onDone, onCancel }) {
  const [name, setName] = useState(template?.name || '');
  const [intro, setIntro] = useState(template?.intro || '');
  const [fields, setFields] = useState(() => (template?.fields || []).map(f => ({ ...f, chart_field: f.chart_field || '' })));
  const [addType, setAddType] = useState('text');
  const [preview, setPreview] = useState(false);
  const [previewValues, setPreviewValues] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = (i, f) => setFields(list => list.map((x, j) => (j === i ? f : x)));
  const move = (i, d) => setFields(list => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const add = () => setFields(list => [...list, { id: newId(), type: addType, label: '', help: '', required: false, chart_field: '', options: addType === 'choice' || addType === 'checkboxes' ? [] : undefined }]);
  const save = async () => {
    setBusy(true); setError(null);
    const payload = {
      name, intro,
      // optionsText is only the textarea's draft; the options list is what's saved.
      fields: fields.map(f => { const g = { ...f, chart_field: f.chart_field || null }; delete g.optionsText; return g; }),
    };
    try {
      if (template) await api.updatePowerFormTemplate(template.id, payload);
      else await api.createPowerFormTemplate(payload);
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: INK, margin: 0 }}>{template ? 'Edit form' : 'New form'}</h2>
        <span style={{ flex: 1 }} />
        <div role="tablist" aria-label="View" style={{ display: 'inline-flex', gap: 6 }}>
          <button type="button" role="tab" aria-selected={!preview} onClick={() => setPreview(false)} style={choiceStyle(!preview)}>Build</button>
          <button type="button" role="tab" aria-selected={preview} onClick={() => setPreview(true)} style={choiceStyle(preview)}>Preview</button>
        </div>
      </div>
      {preview ? (
        <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 18, background: 'white', maxWidth: 680 }}>
          <h3 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 6px', color: INK }}>{name || 'Untitled form'}</h3>
          {intro && <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', color: INK }}>{intro}</p>}
          <PowerFormInputs fields={fields.filter(f => f.label)} values={previewValues} onChange={(id, v) => setPreviewValues(x => ({ ...x, [id]: v }))} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
            <div>
              <label style={label} htmlFor="pfb-name">Form name</label>
              <input id="pfb-name" style={input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Contact info update" />
            </div>
            <div>
              <label style={label} htmlFor="pfb-intro">Intro (shown to the parent first, optional)</label>
              <textarea id="pfb-intro" style={{ ...input, minHeight: 60, resize: 'vertical' }} value={intro} onChange={e => setIntro(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {fields.length === 0 && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No fields yet. Add the first one below.</p>}
            {fields.map((f, i) => (
              <FieldEditor key={f.id} field={f} index={i} count={fields.length} setup={setup}
                onChange={nf => update(i, nf)} onMove={d => move(i, d)} onRemove={() => setFields(list => list.filter((_, j) => j !== i))} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select aria-label="New field type" value={addType} onChange={e => setAddType(e.target.value)} style={{ ...input, width: 'auto' }}>
              {Object.entries(setup.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" onClick={add} style={buttonStyle('secondary')}>Add field</button>
          </div>
        </>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save form'}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle('secondary')}>Cancel</button>
      </div>
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
    </div>
  );
}
