import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import {
  pageWrap, pillTabsWrap, rowStyle, filterInputStyle, presetTabsWrap, presetTabStyle,
  matchesPreset, matchesSearchText, matchesOnProgram, splitMultiValue, programColor, serviceColor,
  PATIENT_PRESETS, PatientFilterBuilder, matchesPatientFilters,
  PatientModal, DataTableOverlay, PasswordConfirmModal,
} from './ManageDataPage';
import { canManage } from '../roles';
import { useIsMobile } from '../useIsMobile';
import { PageHeader } from '../dashboardUi';
import { INK, MUTED, HAIRLINE, NUMERIC, TONES, buttonStyle } from '../uiTokens';

// Programs that aren't insurance; anything else is an insurer (shown as "INS").
const NON_INSURANCE_PROGRAMS = new Set(['EI', 'CPSE', 'CSE', 'DOE', 'P', 'PP', 'NONE']);

export default function PatientsPage() {
  const { user } = useAuth();
  const isAdmin = canManage(user);
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modalTarget, setModalTarget] = useState(null); // { existing: obj|null } | null
  const [preset, setPreset] = useState('all');
  const [searchText, setSearchText] = useState('');
  // Same filters as the Data Table: any number, AND-ed; set-value columns
  // take several exact values (e.g. Program: P or PP or CPSE).
  const [filters, setFilters] = useState([]);
  const [showDataTable, setShowDataTable] = useState(false);
  const [confirmingDataTablePassword, setConfirmingDataTablePassword] = useState(false);
  const [dataTablePassword, setDataTablePassword] = useState(null);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [showAllPatients, setShowAllPatients] = useState(false);

  useEffect(() => { api.getStaffDirectory().then(setStaffDirectory).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPatients(await api.getPatients());
    } catch (err) {
      setLoadError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredPatients = useMemo(() => {
    return patients.filter(p =>
      matchesPreset(p, preset) &&
      matchesSearchText(p, searchText) &&
      matchesPatientFilters(p, filters) &&
      matchesOnProgram(p, showAllPatients)
    );
  }, [patients, preset, searchText, filters, showAllPatients]);

  const clearFilters = () => {
    setPreset('all');
    setSearchText('');
    setFilters([]);
  };

  const closeModal = () => setModalTarget(null);
  const handleSaved = () => { closeModal(); load(); };

  return (
    <div style={{ ...pageWrap(), position: 'relative' }}>
      {/* Header, like the other pages: title with the page actions, the
          preset pills, then one row of search and filters. */}
      <PageHeader
        title="Patients"
        isMobile={isMobile}
        actions={(
          <>
            {isAdmin && (
              <button type="button" onClick={() => setConfirmingDataTablePassword(true)} title="View and edit all patient data as a table" style={buttonStyle('secondary')}>
                Data table
              </button>
            )}
            <button type="button" onClick={() => setModalTarget({ existing: null })} style={buttonStyle('primary')}>Add patient</button>
          </>
        )}
      />

      {loadError && <p style={{ color: TONES.danger.fg, fontSize: 13 }}>{loadError}</p>}

      <div style={presetTabsWrap()} role="group" aria-label="Patient groups">
        {PATIENT_PRESETS.map(p => (
          <button key={p.key} type="button" aria-pressed={preset === p.key} onClick={() => setPreset(p.key)} style={presetTabStyle(preset === p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          style={{ ...filterInputStyle(isMobile ? '100%' : 240), borderRadius: 6, borderColor: HAIRLINE }}
          placeholder="Search all fields"
          aria-label="Search patients"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <PatientFilterBuilder filters={filters} onChange={setFilters} patients={patients} staffDirectory={staffDirectory} />
        {(preset !== 'all' || searchText || filters.length > 0) && (
          <button type="button" onClick={clearFilters} style={buttonStyle('text', { fontSize: 12.5 })}>Clear filters</button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: isMobile ? 0 : 'auto' }}>
          <div role="group" aria-label="Which patients" style={{ display: 'flex', gap: 4 }}>
            {[[false, 'On program'], [true, 'All']].map(([all, label]) => (
              <button
                key={label} type="button" aria-pressed={showAllPatients === all} onClick={() => setShowAllPatients(all)}
                style={{
                  padding: '5px 10px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${showAllPatients === all ? INK : HAIRLINE}`, background: showAllPatients === all ? INK : 'white', color: showAllPatients === all ? 'white' : INK,
                }}
              >{label}</button>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: MUTED, ...NUMERIC }}>{filteredPatients.length} of {patients.length}</span>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
      ) : patients.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>No patients yet.</p>
      ) : filteredPatients.length === 0 ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>No patients match the current filters.</p>
      ) : (
        filteredPatients.map(p => (
          <div
            key={p.id}
            onClick={() => navigate(`/patients/${encodeURIComponent(p.Name)}`)}
            style={{ ...rowStyle(), cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{p.Name}</span>
              {p.mrn && (
                <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#9ca3af' }}>MRN {p.mrn}</span>
              )}
              {splitMultiValue(p.Services).map(s => (
                <span key={'svc-' + s} style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: serviceColor(s) + '20', color: serviceColor(s),
                }}>
                  {s}
                </span>
              ))}
              {/* Insurers (BCBS/Anthem, CIGNA, GHI, ...) show as one "INS" bubble;
                  EI, CPSE, CSE, P, PP and NONE show as themselves. */}
              {[...new Set(splitMultiValue(p.Program).map(prog => (NON_INSURANCE_PROGRAMS.has(prog.toUpperCase()) ? prog : 'INS')))].map(prog => (
                <span key={'prog-' + prog} style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: programColor(prog === 'INS' ? 'GHI' : prog) + '20', color: programColor(prog === 'INS' ? 'GHI' : prog),
                }}>
                  {prog}
                </span>
              ))}
              {p.Status && <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.Status}</span>}
              {p.Case_Manager && <span style={{ fontSize: 11.5, color: '#9ca3af' }}>CM: {p.Case_Manager}</span>}
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>View Chart &rarr;</span>
          </div>
        ))
      )}

      {modalTarget && (
        <PatientModal existing={modalTarget.existing} onClose={closeModal} onSaved={handleSaved} />
      )}
      {showDataTable && isAdmin && (
        <DataTableOverlay
          patients={patients}
          initialPassword={dataTablePassword}
          onClose={() => { setShowDataTable(false); setDataTablePassword(null); }}
          onPatientsChanged={load}
        />
      )}
      {confirmingDataTablePassword && (
        <PasswordConfirmModal
          expectedUsername={user?.username}
          actionLabel="Confirm your identity to open the data table for editing."
          onConfirm={async (password) => {
            setDataTablePassword(password);
            setConfirmingDataTablePassword(false);
            setShowDataTable(true);
          }}
          onCancel={() => setConfirmingDataTablePassword(false)}
        />
      )}
    </div>
  );
}
