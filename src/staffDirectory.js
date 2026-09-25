import { useState, useEffect } from 'react';
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