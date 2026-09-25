import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';

// Help & Support: a deliberately plain page. Your image on top, then the
// ticket form: issue, urgency, contact info, Submit. Works signed in or
// not (from the login screen too). Every ticket goes to KJC135's Support
// tickets inbox and bell.
//
// The picture is public/support-desk.jpg. If it can't load, a plain
// placeholder box shows in its place.
const SUPPORT_IMAGE = '/support-desk.jpg';

const URGENCY = [
  { value: 'Low', hint: 'Whenever you get to it. Question or small annoyance.' },
  { value: 'Medium', hint: 'Something is wrong, but I can work around it.' },
  { value: 'High', hint: 'Part of my work is blocked.' },
  { value: 'Urgent', hint: 'The app is down or I cannot see patients / the schedule.' },
];

const plain = { fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' };
const labelStyle = { display: 'block', fontWeight: 'bold', fontSize: 14, margin: '16px 0 4px' };
const boxStyle = { width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 14, border: '1px solid #999', fontFamily: 'inherit' };

function displayNameOf(user) {
  if (!user) return '';
  const first = user.preferredName || user.firstName;
  return first ? `${first} ${user.lastName || ''}`.trim() : user.username;
}

export default function SupportPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [imageMissing, setImageMissing] = useState(false);
  const [issue, setIssue] = useState('');
  const [urgency, setUrgency] = useState('');
  const [name, setName] = useState(displayNameOf(user));
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState(''); // hidden; only bots fill it in
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sentId, setSentId] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!issue.trim()) { setError('Please describe the issue.'); return; }
    if (!urgency) { setError('Please choose an urgency level.'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!contact.trim()) { setError('Please enter an email or phone number so we can reach you.'); return; }
    setSending(true);
    try {
      const res = await api.submitSupportTicket({
        issue, urgency, contact_name: name, contact_info: contact, website,
        page: params.get('from') || (user ? '' : 'login screen'),
      });
      setSentId(res?.id ?? '');
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  const startOver = () => { setSentId(null); setIssue(''); setUrgency(''); };

  return (
    <div style={{ ...plain, maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Help &amp; Support</h1>

      {imageMissing ? (
        <div style={{ border: '1px dashed #999', padding: 40, textAlign: 'center', color: '#777', fontSize: 13 }}>[ image ]</div>
      ) : (
        <img src={SUPPORT_IMAGE} alt="Notice: Complaints Department, 100 miles that way" onError={() => setImageMissing(true)} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }} />
      )}

      {sentId !== null ? (
        <div role="status" style={{ border: '1px solid #999', padding: 16, marginTop: 20 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>Thanks. Your ticket{sentId ? ` #${sentId}` : ''} was sent.</p>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>We'll contact you at {contact}.</p>
          <button type="button" onClick={startOver} style={{ fontSize: 14, padding: '4px 12px' }}>Send another</button>{' '}
          <Link to={user ? '/' : '/login'} style={{ fontSize: 14, marginLeft: 8 }}>{user ? 'Back to the schedule' : 'Back to sign in'}</Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <label htmlFor="support-issue" style={labelStyle}>What's the issue?</label>
          <textarea id="support-issue" rows={6} value={issue} onChange={e => setIssue(e.target.value)} style={{ ...boxStyle, resize: 'vertical' }}
            placeholder="What happened, what you expected, and which page you were on." />

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Urgency</legend>
            {URGENCY.map(u => (
              <label key={u.value} style={{ display: 'block', fontSize: 14, margin: '4px 0', cursor: 'pointer' }}>
                <input type="radio" name="urgency" value={u.value} checked={urgency === u.value} onChange={() => setUrgency(u.value)} />{' '}
                <b>{u.value}</b> <span style={{ color: '#555' }}>- {u.hint}</span>
              </label>
            ))}
          </fieldset>

          <label htmlFor="support-name" style={labelStyle}>Your name</label>
          <input id="support-name" value={name} onChange={e => setName(e.target.value)} style={boxStyle} autoComplete="name" />

          <label htmlFor="support-contact" style={labelStyle}>Email or phone</label>
          <input id="support-contact" value={contact} onChange={e => setContact(e.target.value)} style={boxStyle} placeholder="How should we reach you?" autoComplete="email" />

          {/* Hidden from people; bots that fill every field get ignored. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
            <label>Website <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
          </div>

          {error && <p role="alert" style={{ color: '#b00020', fontSize: 14, margin: '14px 0 0' }}>{error}</p>}

          <button type="submit" disabled={sending} style={{ marginTop: 18, fontSize: 15, padding: '6px 20px' }}>
            {sending ? 'Sending...' : 'Submit'}
          </button>
          {!user && <p style={{ fontSize: 13, marginTop: 16 }}><Link to="/login">Back to sign in</Link></p>}
        </form>
      )}
    </div>
  );
}
