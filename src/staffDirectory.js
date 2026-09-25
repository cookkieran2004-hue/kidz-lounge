import { useState, useEffect, useCallback } from 'react';
import { api } from './api';

// Active staff (username + display name), fetched once per page load and
// shared -- used for the meeting "With" picker and to show names instead
// of usernames wherever a meeting lists who's in it.
let cached = null;
function loadDirectory() {
  if (!cached) cached = api.getStaffDirectory().catch(() => { cached = null; return []; });
  return cached;
}

export function useStaffDirectory() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    loadDirectory().then(d => { if (alive) setList(d || []); });
    return () => { alive = false; };
  }, []);
  return list;
}

export function staffName(directory, username) {
  return directory.find(s => s.username === username)?.display_name || username;
}

// Turns a stored username (who wrote, added, uploaded or submitted
// something) into the person's name. Covers archived staff too, so things
// done by someone who has since left still say who it was. Falls back to
// the username only while the list is loading or for an unknown account.
let cachedNames = null;
function loadAllNames() {
  if (!cachedNames) {
    cachedNames = api.getAllStaffNames()
      .then(list => Object.fromEntries((list || []).map(s => [s.username, s.display_name])))
      .catch(() => { cachedNames = null; return {}; });
  }
  return cachedNames;
}

export function useStaffNames() {
  const [names, setNames] = useState({});
  useEffect(() => {
    let alive = true;
    loadAllNames().then(n => { if (alive) setNames(n); });
    return () => { alive = false; };
  }, []);
  return useCallback((username) => (username ? names[username] || username : username), [names]);
}
