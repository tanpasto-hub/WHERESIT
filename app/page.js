'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Mic, MicOff, Plus, X, Check, Pencil, Trash2, Loader2, LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';

// Simple Levenshtein edit distance — used to catch near-duplicate typos
// ("ofice" vs "office") without pulling in a library.
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// Finds an existing value that's close-but-not-identical to what was typed,
// so we can ask "did you mean X?" instead of silently creating a near-duplicate.
function findCloseMatch(value, candidates) {
  const typed = value.trim();
  if (typed.length < 3) return null;
  const typedLower = typed.toLowerCase();
  if (candidates.some((c) => c.toLowerCase() === typedLower)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = levenshtein(typedLower, c.toLowerCase());
    const threshold = Math.max(1, Math.floor(Math.max(typedLower.length, c.length) * 0.3));
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Which field is currently being captured by voice: null, 'search', 'name', or 'location'.
  const [listeningField, setListeningField] = useState(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLocation, setEditLocation] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [addError, setAddError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [pendingDuplicate, setPendingDuplicate] = useState(null);
  const [skipSuggestFor, setSkipSuggestFor] = useState(() => new Set());
  const [editPendingConfirm, setEditPendingConfirm] = useState(null);
  const [editError, setEditError] = useState('');
  // Drives the fully hands-free "add by voice" flow: true while it's
  // running, and voiceCaption mirrors whatever is currently being spoken
  // so people who aren't only listening can still follow along on screen.
  const [handsFreeActive, setHandsFreeActive] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef(null);
  const handsFreeCancelRef = useRef(false);
  const itemsRef = useRef(items);
  const router = useRouter();
  const supabase = createClient();

  // Keep a ref to items so the voice-recognition callback always sees fresh data.
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Existing names/locations — power the "Where"/"What" suggestion dropdowns
  // and the near-duplicate ("did you mean X?") check below.
  const distinctLocations = useMemo(
    () => Array.from(new Set(items.map((i) => i.location))).sort((a, b) => a.localeCompare(b)),
    [items]
  );
  const distinctNames = useMemo(
    () => Array.from(new Set(items.map((i) => i.name))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email);
      await loadItems();
    })();

    const SR = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (SR) setVoiceSupported(true);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) setSpeechSupported(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setItems(data);
    setLoading(false);
  };

  // Generic voice capture for any of the three text fields — search, the
  // add-item "what", and the add-item "where". Builds a fresh recognizer
  // each time (simpler and more reliable than reusing one long-lived
  // instance) and routes the transcript to the right place when it lands.
  const startVoiceFor = (field) => {
    const SR = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    if (field === 'search') setSearchResult(null);
    else setAddError('');

    setListeningField(field);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setListeningField(null);
      if (field === 'search') {
        setQuery(transcript);
        handleSearch(transcript);
      } else if (field === 'name') {
        setNewName(transcript);
      } else if (field === 'location') {
        setNewLocation(transcript);
      }
    };
    recognition.onerror = () => setListeningField(null);
    recognition.onend = () => setListeningField(null);
    try {
      recognition.start();
    } catch {
      setListeningField(null);
    }
  };

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setListeningField(null);
  };

  // Speaks a line out loud and resolves once it's finished (or immediately,
  // if speech synthesis isn't available — the hands-free flow still works,
  // it just relies on the on-screen caption instead).
  const speak = (text) => {
    setVoiceCaption(text);
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    });
  };

  // Listens once and resolves with the transcript (or '' on silence/error/
  // no support). Unlike startVoiceFor, this is promise-based so the
  // hands-free flow below can await each answer in turn.
  //
  // If the very first attempt fails almost instantly (under 700ms — before
  // a person could plausibly have spoken and finished), that's almost
  // always the microphone still spinning up or a permission hiccup, not
  // genuine silence, so it retries once on its own before giving up.
  const listenFor = (label, attempt = 1) => new Promise((resolve) => {
    const SR = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (!SR) {
      resolve('');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    setListeningField(label);

    const startedAt = Date.now();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      if (!value && attempt === 1 && !handsFreeCancelRef.current && Date.now() - startedAt < 700) {
        settled = true;
        resolve(listenFor(label, 2));
        return;
      }
      settled = true;
      setListeningField(null);
      resolve(value);
    };
    recognition.onresult = (event) => finish(event.results[0][0].transcript.trim());
    recognition.onerror = () => finish('');
    recognition.onend = () => finish('');
    try {
      recognition.start();
    } catch {
      finish('');
    }
  });

  const soundsAffirmative = (text) => /\b(yes|yeah|yep|yup|correct|right|sure|overwrite|confirm)\b/i.test(text);

  // Cancels an in-progress hands-free flow: stops any speech/listening and
  // flips the cancel flag the flow checks between steps so it stops early.
  const stopHandsFree = () => {
    handsFreeCancelRef.current = true;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopped */ }
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setHandsFreeActive(false);
    setListeningField(null);
    setVoiceCaption('');
  };

  const soundsLikeDone = (text) => /^\s*(done|no|nope|nothing|that's all|thats all|stop|finish|finished|no more)\b/i.test(text);

  // The fully hands-free "add item" flow. One tap starts it; from then on
  // it keeps looping — ask for an item, ask where it goes, save, ask for
  // the next one — until the person says "done" (or something like it) or
  // taps Stop, so they never have to reach for the screen again mid-flow.
  //
  // The very first listen is started immediately, in the same tick as the
  // tap that triggered this, with the spoken prompt firing alongside it
  // rather than before it — on a phone that's never granted this site mic
  // access, waiting even a second before opening the mic (to let a prompt
  // finish playing first) can make the browser refuse it outright.
  const handsFreeAdd = async () => {
    if (handsFreeActive) return;
    handsFreeCancelRef.current = false;
    setHandsFreeActive(true);
    setShowAdd(true);
    setAddError('');
    setPendingConfirm(null);
    setPendingDuplicate(null);
    setNewName('');
    setNewLocation('');
    setSkipSuggestFor(new Set());

    const cancelled = () => handsFreeCancelRef.current;
    let savedCount = 0;
    let first = true;

    try {
      while (true) {
        let name;
        if (first) {
          setVoiceCaption('What is it?');
          const namePromise = listenFor('name');
          speak('What is it?');
          name = await namePromise;
        } else {
          await speak('Next item — what is it? Or say "done" if that\'s everything.');
          if (cancelled()) return;
          name = await listenFor('name');
        }
        if (cancelled()) return;

        if (!name) {
          await speak(savedCount > 0
            ? `Okay, done — I added ${savedCount} ${savedCount === 1 ? 'item' : 'items'}.`
            : "I didn't catch that. Let's try again whenever you're ready.");
          return;
        }
        if (soundsLikeDone(name)) {
          await speak(savedCount > 0
            ? `Done — I added ${savedCount} ${savedCount === 1 ? 'item' : 'items'}.`
            : 'Okay, nothing added.');
          return;
        }

        first = false;
        setNewName(name);

        // Use itemsRef (not the items/distinctNames closed over when this
        // loop started) so an item saved earlier in the same voice session
        // is already accounted for on the next round.
        const nameMatch = findCloseMatch(name, Array.from(new Set(itemsRef.current.map((i) => i.name))));
        if (nameMatch) {
          await speak(`You already have "${nameMatch}" saved. Did you mean that instead of "${name}"? Say yes or no.`);
          if (cancelled()) return;
          const resp = await listenFor('confirm');
          if (cancelled()) return;
          if (soundsAffirmative(resp)) {
            name = nameMatch;
            setNewName(nameMatch);
          }
        }

        await speak('Where did you put it?');
        if (cancelled()) return;
        let location = await listenFor('location');
        if (cancelled()) return;
        if (!location) {
          await speak("I didn't catch that, so I couldn't save that one. Let's keep going.");
          setNewName('');
          setNewLocation('');
          continue;
        }
        setNewLocation(location);

        const locationMatch = findCloseMatch(location, Array.from(new Set(itemsRef.current.map((i) => i.location))));
        if (locationMatch) {
          await speak(`You already have "${locationMatch}" saved. Did you mean that instead of "${location}"? Say yes or no.`);
          if (cancelled()) return;
          const resp = await listenFor('confirm');
          if (cancelled()) return;
          if (soundsAffirmative(resp)) {
            location = locationMatch;
            setNewLocation(locationMatch);
          }
        }

        const existing = itemsRef.current.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
          if (existing.location.trim().toLowerCase() === location.toLowerCase()) {
            await speak(`"${name}" is already saved in "${existing.location}".`);
          } else {
            await speak(`You already have "${name}" saved in "${existing.location}". Should I overwrite it with "${location}"? Say yes or no.`);
            if (cancelled()) return;
            const resp = await listenFor('confirm');
            if (cancelled()) return;
            if (soundsAffirmative(resp)) {
              const result = await applyEdit(existing.id, location);
              if (result.ok) savedCount++;
              await speak(result.ok ? 'Updated.' : (result.message || 'Something went wrong.'));
            } else {
              await speak("Okay, I won't change it.");
            }
          }
        } else {
          const result = await insertItem(name, location, { closeForm: false });
          if (result.ok) savedCount++;
          await speak(result.ok ? 'Saved.' : (result.message || 'Something went wrong.'));
        }

        if (cancelled()) return;
        setNewName('');
        setNewLocation('');
        // loop back and ask for the next item
      }
    } finally {
      setHandsFreeActive(false);
      setListeningField(null);
      setVoiceCaption('');
      setNewName('');
      setNewLocation('');
      setShowAdd(false);
    }
  };

  const handleSearch = async (searchQ) => {
    const q = (searchQ ?? query).trim();
    if (!q) return;
    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      setSearchResult({
        found: false,
        matches: [],
        message: "You haven't saved any items yet. Add one first.",
      });
      return;
    }

    setIsSearching(true);
    setSearchResult(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          items: currentItems.map((i) => ({
            id: i.id,
            name: i.name,
            location: i.location,
          })),
        }),
      });
      const result = await response.json();
      setSearchResult(result);
    } catch {
      setSearchResult({
        found: false,
        matches: [],
        message: 'Something went wrong. Try again.',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Actually writes the row to Supabase. Called once both fields have
  // cleared the near-duplicate check (or the user confirmed anyway).
  // closeForm is false during the hands-free loop, which stays open across
  // multiple items instead of closing after each one.
  const insertItem = async (name, location, { closeForm = true } = {}) => {
    setAddError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const message = 'Your session has expired — please sign out and sign in again.';
      setAddError(message);
      return { ok: false, message };
    }

    const { data, error } = await supabase
      .from('items')
      .insert({
        user_id: user.id,
        name,
        location,
      })
      .select()
      .single();

    if (error) {
      const message = error.message || 'Could not save that item. Try again.';
      setAddError(message);
      return { ok: false, message };
    }
    if (data) {
      setItems((prev) => [data, ...prev]);
      setPendingConfirm(null);
      setSkipSuggestFor(new Set());
      if (closeForm) {
        setNewName('');
        setNewLocation('');
        setShowAdd(false);
      }
      return { ok: true };
    }
    return { ok: false, message: 'Could not save that item. Try again.' };
  };

  // Runs before every save: checks both fields for a close-but-not-exact
  // match against what's already saved, and asks for confirmation first
  // instead of silently creating a near-duplicate (e.g. "Ofice" vs "Office").
  const addItem = () => {
    const name = newName.trim();
    const location = newLocation.trim();
    if (!name || !location) return;
    setAddError('');

    const nameKey = `name:${name.toLowerCase()}`;
    const locationKey = `location:${location.toLowerCase()}`;

    if (!skipSuggestFor.has(nameKey)) {
      const nameMatch = findCloseMatch(name, distinctNames);
      if (nameMatch) {
        setPendingConfirm({ field: 'name', typed: name, suggestion: nameMatch });
        return;
      }
    }
    if (!skipSuggestFor.has(locationKey)) {
      const locationMatch = findCloseMatch(location, distinctLocations);
      if (locationMatch) {
        setPendingConfirm({ field: 'location', typed: location, suggestion: locationMatch });
        return;
      }
    }

    // Exact-name match against something already saved — offer to update
    // its location instead of silently creating a second entry with the
    // same name (which would make search ambiguous).
    const existing = items.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      if (existing.location.trim().toLowerCase() === location.toLowerCase()) {
        setAddError(`"${name}" is already saved in "${existing.location}".`);
        return;
      }
      setPendingDuplicate({ existingItem: existing, name, location });
      return;
    }

    insertItem(name, location);
  };

  const resolvePendingConfirm = (useSuggestion) => {
    if (!pendingConfirm) return;
    const { field, typed, suggestion } = pendingConfirm;
    if (useSuggestion) {
      if (field === 'name') setNewName(suggestion);
      else setNewLocation(suggestion);
    } else {
      setSkipSuggestFor((prev) => new Set(prev).add(`${field}:${typed.toLowerCase()}`));
    }
    setPendingConfirm(null);
  };

  // Resolves the "you already have this, overwrite it?" prompt. Overwriting
  // updates the existing row's location (same as editing it) rather than
  // inserting a duplicate; canceling just dismisses the prompt so the
  // person can change what they typed.
  const resolveDuplicateConfirm = async (overwrite) => {
    if (!pendingDuplicate) return;
    const { existingItem, location } = pendingDuplicate;
    if (overwrite) {
      await applyEdit(existingItem.id, location);
      setNewName('');
      setNewLocation('');
      setShowAdd(false);
    }
    setPendingDuplicate(null);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditLocation(item.location);
    setEditError('');
    setEditPendingConfirm(null);
  };

  const applyEdit = async (id, location) => {
    setEditError('');
    const { data, error } = await supabase
      .from('items')
      .update({
        location,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      const message = error.message || 'Could not update that. Try again.';
      setEditError(message);
      return { ok: false, message };
    }
    if (data) {
      setItems((prev) => [data, ...prev.filter((i) => i.id !== id)]);
      setEditingId(null);
      setEditLocation('');
      setEditPendingConfirm(null);
      return { ok: true };
    }
    return { ok: false, message: 'Could not update that. Try again.' };
  };

  // Same near-duplicate check as addItem, but for the location-only edit form.
  const saveEdit = (id) => {
    const location = editLocation.trim();
    if (!location) return;
    setEditError('');

    const locationMatch = findCloseMatch(location, distinctLocations);
    if (locationMatch) {
      setEditPendingConfirm({ typed: location, suggestion: locationMatch });
      return;
    }
    applyEdit(id, location);
  };

  const resolveEditConfirm = (id, useSuggestion) => {
    if (!editPendingConfirm) return;
    const { typed, suggestion } = editPendingConfirm;
    setEditPendingConfirm(null);
    applyEdit(id, useSuggestion ? suggestion : typed);
  };

  const deleteItem = async (id) => {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (!error) {
      setItems(items.filter((i) => i.id !== id));
      if (searchResult?.matches?.some((m) => m.id === id)) setSearchResult(null);
    } else {
      setAddError(error.message || 'Could not delete that item. Try again.');
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchResult(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const timeAgo = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  };

  const confirmBoxStyle = {
    background: '#F5EFDC',
    border: '1px solid #D8C88A',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 14,
  };
  const confirmBtnStyle = {
    background: '#1B1D1A',
    color: '#FAF9F3',
    border: 'none',
    borderRadius: 5,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: 500,
  };
  const confirmBtnGhostStyle = {
    background: 'transparent',
    color: '#4A4842',
    border: '1px solid #DDD8CA',
    borderRadius: 5,
    padding: '7px 12px',
    fontSize: 13,
  };
  const errorBoxStyle = {
    fontSize: 13,
    color: '#8B2E1C',
    marginBottom: 14,
    padding: '10px 12px',
    background: '#F5E3DC',
    borderRadius: 6,
  };

  return (
    <div style={{
      minHeight: '100vh',
      padding: '22px 18px 60px',
      maxWidth: 640,
      margin: '0 auto',
    }}>
      {/* Shared suggestion lists for the "What"/"Where" inputs below. */}
      <datalist id="wdipi-name-list">
        {distinctNames.map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="wdipi-location-list">
        {distinctLocations.map((l) => <option key={l} value={l} />)}
      </datalist>

      {/* Header */}
      <header style={{
        marginBottom: 26,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <h1 className="serif" style={{
            fontSize: 44,
            lineHeight: 0.95,
            margin: 0,
            fontStyle: 'italic',
            letterSpacing: '-0.015em',
          }}>
            Where&apos;d I<br />put it
          </h1>
          <p style={{ fontSize: 14, color: '#4A4842', margin: '10px 0 0', lineHeight: 1.4, maxWidth: 340 }}>
            Save what you own and where it is. Then find it later — by typing or by talking.
          </p>
          {userEmail && (
            <p style={{ fontSize: 12, color: '#8C877A', margin: '4px 0 0' }}>
              Signed in as {userEmail}
            </p>
          )}
        </div>
        <button
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          style={{
            background: 'transparent',
            border: '1px solid #DDD8CA',
            borderRadius: 6,
            padding: '8px 10px',
            color: '#4A4842',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </header>

      {/* Search bar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex',
          gap: 6,
          background: '#FAF9F3',
          border: '1px solid #DDD8CA',
          borderRadius: 10,
          padding: '4px 4px 4px 14px',
          alignItems: 'center',
        }}>
          <Search size={16} color="#8C877A" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="What are you looking for?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              fontSize: 16,
              padding: '10px 0',
            }}
          />
          {query && (
            <button
              onClick={clearSearch}
              aria-label="Clear"
              style={{
                background: 'none',
                border: 'none',
                padding: 6,
                color: '#8C877A',
              }}
            >
              <X size={16} />
            </button>
          )}
          {voiceSupported && (
            <button
              onClick={listeningField === 'search' ? stopVoice : () => startVoiceFor('search')}
              className={listeningField === 'search' ? 'listening-pulse' : ''}
              aria-label={listeningField === 'search' ? 'Stop listening' : 'Voice search'}
              style={{
                background: listeningField === 'search' ? '#2B4C7E' : '#1B1D1A',
                color: '#FAF9F3',
                border: 'none',
                borderRadius: 7,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              {listeningField === 'search' ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
        {!voiceSupported && (
          <p style={{ fontSize: 11, color: '#8C877A', margin: '6px 0 0' }}>
            Voice search needs Chrome, Edge, or Safari
          </p>
        )}
        {listeningField === 'search' && (
          <p style={{
            fontSize: 13,
            color: '#2B4C7E',
            fontStyle: 'italic',
            margin: '8px 0 0',
          }}>
            Listening... say what you&apos;re looking for
          </p>
        )}
      </div>

      {/* Search result */}
      {(isSearching || searchResult) && (
        <div style={{
          background: '#FAF9F3',
          border: '1px solid #DDD8CA',
          borderLeft: '3px solid #2B4C7E',
          borderRadius: 4,
          padding: '14px 16px',
          marginBottom: 22,
        }}>
          {isSearching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#8C877A' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14 }}>Looking through your things...</span>
            </div>
          ) : searchResult ? (
            <div>
              <p style={{
                margin: 0,
                fontSize: 14,
                color: '#4A4842',
                marginBottom: searchResult.matches?.length ? 12 : 0,
              }}>
                {searchResult.message}
              </p>
              {searchResult.matches?.map((m, idx) => (
                <div key={idx} style={{
                  marginTop: idx > 0 ? 12 : 0,
                  paddingTop: idx > 0 ? 12 : 0,
                  borderTop: idx > 0 ? '1px dashed #DDD8CA' : 'none',
                }}>
                  <div className="serif" style={{
                    fontSize: 22,
                    fontStyle: 'italic',
                    lineHeight: 1.1,
                  }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 15, marginTop: 6, color: '#3A3833' }}>
                    <span className="highlight">{m.location}</span>
                  </div>
                  {m.confidence === 'low' && (
                    <div style={{
                      fontSize: 11,
                      color: '#8C877A',
                      marginTop: 4,
                      fontStyle: 'italic',
                    }}>
                      loose match — might not be what you meant
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* Divider with count + add — one clear button, no separate "voice mode" */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 10,
        borderBottom: '1px solid #DDD8CA',
      }}>
        <span style={{ fontSize: 12, color: '#8C877A' }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        <button
          onClick={() => {
            const opening = !showAdd;
            setShowAdd(opening);
            setAddError('');
            setPendingConfirm(null);
            setPendingDuplicate(null);
            if (!opening) {
              if (listeningField === 'name' || listeningField === 'location') stopVoice();
              if (handsFreeActive) stopHandsFree();
            }
          }}
          style={{
            background: showAdd ? 'transparent' : '#1B1D1A',
            color: showAdd ? '#4A4842' : '#FAF9F3',
            border: showAdd ? '1px solid #DDD8CA' : 'none',
            borderRadius: 6,
            padding: '9px 16px',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 500,
          }}
        >
          {showAdd ? <><X size={14} /> Close</> : <><Plus size={15} /> Add item</>}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{
          background: '#FAF9F3',
          border: '1px solid #DDD8CA',
          borderRadius: 8,
          padding: 16,
          marginBottom: 22,
        }}>
          {handsFreeActive && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 14,
              padding: '10px 12px',
              background: '#EDEAE0',
              borderRadius: 6,
            }}>
              <p style={{
                margin: 0,
                fontSize: 13,
                color: '#2B4C7E',
                fontStyle: 'italic',
                flex: 1,
              }}>
                {listeningField ? 'Listening...' : voiceCaption}
              </p>
              <button
                onClick={stopHandsFree}
                style={{
                  background: 'transparent',
                  border: '1px solid #DDD8CA',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  color: '#4A4842',
                  flexShrink: 0,
                }}
              >
                Stop
              </button>
            </div>
          )}
          {!handsFreeActive && (
            <p style={{ fontSize: 12, color: '#8C877A', margin: '0 0 12px', lineHeight: 1.4 }}>
              Type both boxes, or tap <Mic size={11} style={{ verticalAlign: -1 }} /> on the first
              one — then just keep talking, one item after another, and say
              &ldquo;done&rdquo; when you&apos;re finished.
            </p>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderBottom: '1px solid #DDD8CA',
            marginBottom: 10,
          }}>
            <input
              type="text"
              list="wdipi-name-list"
              placeholder="What is it?"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                fontSize: 22,
                fontFamily: 'Instrument Serif, serif',
                fontStyle: 'italic',
                padding: '4px 0',
              }}
            />
            {voiceSupported && !handsFreeActive && (
              <button
                onClick={handsFreeAdd}
                aria-label="Add the whole item by voice"
                title="Add the whole item by voice"
                style={{
                  background: '#1B1D1A',
                  color: '#FAF9F3',
                  border: 'none',
                  borderRadius: 6,
                  padding: 7,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Mic size={15} />
              </button>
            )}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 10,
          }}>
            <input
              type="text"
              list="wdipi-location-list"
              placeholder="Where did you put it?"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                background: 'transparent',
                fontSize: 15,
                padding: '6px 0',
              }}
            />
            {voiceSupported && !handsFreeActive && (
              <button
                onClick={listeningField === 'location' ? stopVoice : () => startVoiceFor('location')}
                className={listeningField === 'location' ? 'listening-pulse' : ''}
                aria-label={listeningField === 'location' ? 'Stop listening' : 'Say where you put it'}
                style={{
                  background: listeningField === 'location' ? '#2B4C7E' : 'transparent',
                  color: listeningField === 'location' ? '#FAF9F3' : '#8C877A',
                  border: 'none',
                  borderRadius: 6,
                  padding: 7,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {listeningField === 'location' ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
          </div>

          {!handsFreeActive && (listeningField === 'name' || listeningField === 'location') && (
            <p style={{
              fontSize: 12,
              color: '#2B4C7E',
              fontStyle: 'italic',
              margin: '0 0 14px',
            }}>
              Listening... say {listeningField === 'name' ? 'what it is' : 'where you put it'}
            </p>
          )}

          {addError && <div style={errorBoxStyle}>{addError}</div>}

          {!handsFreeActive && (pendingDuplicate ? (
            <div style={confirmBoxStyle}>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: '#4A4842' }}>
                You already have <strong>&ldquo;{pendingDuplicate.name}&rdquo;</strong> saved in{' '}
                <strong>&ldquo;{pendingDuplicate.existingItem.location}&rdquo;</strong>. Overwrite it with{' '}
                <strong>&ldquo;{pendingDuplicate.location}&rdquo;</strong>?
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={confirmBtnStyle} onClick={() => resolveDuplicateConfirm(true)}>
                  Yes, overwrite
                </button>
                <button style={confirmBtnGhostStyle} onClick={() => resolveDuplicateConfirm(false)}>
                  No, cancel
                </button>
              </div>
            </div>
          ) : pendingConfirm ? (
            <div style={confirmBoxStyle}>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: '#4A4842' }}>
                You already have <strong>&ldquo;{pendingConfirm.suggestion}&rdquo;</strong> saved.
                Did you mean that instead of &ldquo;{pendingConfirm.typed}&rdquo;?
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={confirmBtnStyle} onClick={() => resolvePendingConfirm(true)}>
                  Use &ldquo;{pendingConfirm.suggestion}&rdquo;
                </button>
                <button style={confirmBtnGhostStyle} onClick={() => resolvePendingConfirm(false)}>
                  No, keep &ldquo;{pendingConfirm.typed}&rdquo;
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={addItem}
              disabled={!newName.trim() || !newLocation.trim()}
              style={{
                background: '#1B1D1A',
                color: '#FAF9F3',
                border: 'none',
                borderRadius: 6,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 500,
                opacity: newName.trim() && newLocation.trim() ? 1 : 0.4,
                cursor: newName.trim() && newLocation.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Save it
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8C877A' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8C877A' }}>
          <p className="serif" style={{
            fontSize: 26,
            fontStyle: 'italic',
            margin: 0,
            color: '#4A4842',
          }}>
            Nothing here yet.
          </p>
          <p style={{ marginTop: 8, fontSize: 14, marginBottom: 20 }}>
            Add your first item below to start remembering.
          </p>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                background: '#1B1D1A',
                color: '#FAF9F3',
                border: 'none',
                borderRadius: 6,
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={15} /> Add your first item
            </button>
          )}
        </div>
      ) : (
        <div>
          {items.map((item, idx) => (
            <div key={item.id} style={{
              padding: '16px 0',
              borderBottom: idx < items.length - 1 ? '1px solid #DDD8CA' : 'none',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="serif" style={{
                    fontSize: 24,
                    fontStyle: 'italic',
                    lineHeight: 1.1,
                    wordBreak: 'break-word',
                  }}>
                    {item.name}
                  </div>

                  {editingId === item.id ? (
                    <div style={{ marginTop: 10 }}>
                      <input
                        type="text"
                        list="wdipi-location-list"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                        autoFocus
                        style={{
                          width: '100%',
                          border: '1px solid #2B4C7E',
                          background: '#FAF9F3',
                          fontSize: 15,
                          padding: '8px 10px',
                          borderRadius: 4,
                        }}
                      />

                      {editError && <div style={{ ...errorBoxStyle, marginTop: 8 }}>{editError}</div>}

                      {editPendingConfirm ? (
                        <div style={{ ...confirmBoxStyle, marginTop: 8, marginBottom: 0 }}>
                          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#4A4842' }}>
                            You already have <strong>&ldquo;{editPendingConfirm.suggestion}&rdquo;</strong> saved.
                            Did you mean that instead of &ldquo;{editPendingConfirm.typed}&rdquo;?
                          </p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button style={confirmBtnStyle} onClick={() => resolveEditConfirm(item.id, true)}>
                              Use &ldquo;{editPendingConfirm.suggestion}&rdquo;
                            </button>
                            <button style={confirmBtnGhostStyle} onClick={() => resolveEditConfirm(item.id, false)}>
                              No, keep &ldquo;{editPendingConfirm.typed}&rdquo;
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            onClick={() => saveEdit(item.id)}
                            style={{
                              background: '#2B4C7E',
                              color: '#FAF9F3',
                              border: 'none',
                              borderRadius: 4,
                              padding: '6px 12px',
                              fontSize: 13,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Check size={13} /> Update
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditLocation('');
                              setEditError('');
                              setEditPendingConfirm(null);
                            }}
                            style={{
                              background: 'transparent',
                              color: '#8C877A',
                              border: '1px solid #DDD8CA',
                              borderRadius: 4,
                              padding: '6px 12px',
                              fontSize: 13,
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{
                        fontSize: 15,
                        marginTop: 6,
                        color: '#3A3833',
                        wordBreak: 'break-word',
                      }}>
                        <span className="highlight">{item.location}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#8C877A', marginTop: 6 }}>
                        updated {timeAgo(item.updated_at)}
                      </div>
                    </>
                  )}
                </div>

                {editingId !== item.id && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(item)}
                      title="Update location"
                      aria-label="Update location"
                      style={{
                        background: 'transparent',
                        border: '1px solid #DDD8CA',
                        borderRadius: 4,
                        padding: '7px 10px',
                        color: '#4A4842',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                      }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${item.name}"?`)) deleteItem(item.id);
                      }}
                      title="Delete"
                      aria-label="Delete"
                      style={{
                        background: 'transparent',
                        border: '1px solid #DDD8CA',
                        borderRadius: 4,
                        padding: '7px 10px',
                        color: '#8C877A',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 12,
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
