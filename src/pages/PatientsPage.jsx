import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import {
  pageWrap, pillTabsWrap, primaryBtnStyle, rowStyle, smallBtnStyle,
  presetTabsWrap, presetTabStyle, filterBarStyle, filterInputStyle,
  matchesPreset, matchesSearchText, matchesOnProgram, splitMultiValue, programColor, serviceColor,
  PATIENT_PRESETS, PatientFilterBuilder, matchesPatientFilters,
  PatientModal, DataTableOverlay, PasswordConfirmModal,
} from './ManageDataPage';

export default function PatientsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Patients</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0, marginBottom: 20 }}>
            Click a patient to open their chart.
          </p>
        </div>
        {/* Right side: On Program | All toggle, with Data Table stacked underneath it */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #e2e4e9' }}>
            <button
              type="button"
              onClick={() => setShowAllPatients(false)}
              style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', background: !showAllPatients ? '#6D28D9' : 'white', color: !showAllPatients ? 'white' : '#374151' }}
            >
              On Program
            </button>
            <button
              type="button"
              onClick={() => setShowAllPatients(true)}
              style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', background: showAllPatients ? '#6D28D9' : 'white', color: showAllPatients ? 'white' : '#374151' }}
            >
              All
            </button>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setConfirmingDataTablePassword(true)}
              title="View and edit all patient data as a table"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e4e9', background: 'white',
                color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '7px 14px', borderRadius: 8,
              }}
            >
              <span aria-hidden="true">&#9635;</span> Data Table
            </button>
          )}
        </div>
      </div>

      {loadError && <p style={{ color: '#dc2626', fontSize: 13 }}>{loadError}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={primaryBtnStyle()} onClick={() => setModalTarget({ existing: null })}>+ Add Patient</button>
      </div>

      <div style={presetTabsWrap()}>
        {PATIENT_PRESETS.map(p => (
          <button key={p.key} type="button" onClick={() => setPreset(p.key)} style={presetTabStyle(preset === p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={filterBarStyle()}>
        <input
          style={filterInputStyle(220)}
          placeholder="Search all fields..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <PatientFilterBuilder filters={filters} onChange={setFilters} patients={patients} staffDirectory={staffDirectory} />
        {(preset !== 'all' || searchText || filters.length > 0) && (
          <button type="button" onClick={clearFilters} style={smallBtnStyle(false)}>Clear Filters</button>
        )}
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
          {filteredPatients.length} of {patients.length}
        </span>
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
              {splitMultiValue(p.Program).map(prog => (
                <span key={'prog-' + prog} style={{
                  fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                  background: programColor(prog) + '20', color: programColor(prog),
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
