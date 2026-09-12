'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Mic, MicOff, Plus, X, Check, Pencil, Trash2, Loader2, LogOut,
  List, LayoutGrid, Palette, HelpCircle, DoorOpen, Brain, Lightbulb,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';

// Vibrant background/color themes the person can pick from. Each token is
// referenced throughout the page as a CSS custom property (--wdipi-*) set
// on the document root, rather than hardcoded, so switching themes doesn't
// require touching every style object.
const THEMES = {
  cream: {
    label: 'Cream',
    bg: '#F1EFE7',
    ink: '#1B1D1A',
    surface: '#FAF9F3',
    border: '#DDD8CA',
    muted: '#8C877A',
    body: '#4A4842',
    text2: '#3A3833',
    accent: '#2B4C7E',
    accentRgb: '43,76,126',
    warnBg: '#F5EFDC',
    warnBorder: '#D8C88A',
    errorBg: '#F5E3DC',
    errorText: '#8B2E1C',
    captionBg: '#EDEAE0',
    highlight: '#F5E0A8',
  },
  ocean: {
    label: 'Ocean',
    bg: '#E3F2F5',
    ink: '#0B2E3D',
    surface: '#FFFFFF',
    border: '#BFE1E8',
    muted: '#5B8A94',
    body: '#1F3A44',
    text2: '#2D5F6B',
    accent: '#0E7C86',
    accentRgb: '14,124,134',
    warnBg: '#FFF4D6',
    warnBorder: '#F0C866',
    errorBg: '#FDE4E1',
    errorText: '#B23A2A',
    captionBg: '#D9F0F2',
    highlight: '#FFE29A',
  },
  sunset: {
    label: 'Sunset',
    bg: '#FFF0E8',
    ink: '#4A1F1A',
    surface: '#FFFDFB',
    border: '#F5D0BE',
    muted: '#B57A64',
    body: '#5C3A2E',
    text2: '#7A4331',
    accent: '#E8552F',
    accentRgb: '232,85,47',
    warnBg: '#FFF3D6',
    warnBorder: '#F0C25A',
    errorBg: '#FBDCD6',
    errorText: '#A32E1B',
    captionBg: '#FCE3D2',
    highlight: '#FFD6A8',
  },
  forest: {
    label: 'Forest',
    bg: '#EAF3E6',
    ink: '#14291B',
    surface: '#FBFDF8',
    border: '#C9DFC1',
    muted: '#6F9169',
    body: '#26402A',
    text2: '#33502E',
    accent: '#2F8F4E',
    accentRgb: '47,143,78',
    warnBg: '#FBF3D2',
    warnBorder: '#E3C25A',
    errorBg: '#FADDD5',
    errorText: '#A33420',
    captionBg: '#DCEBD4',
    highlight: '#F0E29A',
  },
};

// A small, thoughtful set of original lines about remembering, tidying, and
// peace of mind — themed for an app about keeping track of your things.
// One is picked per person per day (see quoteOfDay below) rather than
// fetched from an external service, so this never depends on a third-party
// API being up.
const QUOTES = [
  'A place for everything brings a little more peace to every day.',
  'Small order today means less searching tomorrow.',
  'The things we put away carefully tend to stay close to us.',
  'Clarity begins with knowing where things are.',
  'A tidy corner is a calm corner.',
  "What you remember to put away, you'll remember to find.",
  'Little habits build a home that works for you.',
  'Every item has a home; every home deserves a little order.',
  'The best time to remember where you put it is right when you put it there.',
  'A calm space makes room for a calm mind.',
  'Progress is a drawer that closes easily.',
  'Today, put one more thing exactly where it belongs.',
  "Order isn't perfection — it's just knowing where to look.",
  'The things that matter deserve a place that matters.',
  'A little care now saves a lot of searching later.',
  'Home is easier to love when you can find what you need in it.',
  'Slow down long enough to remember where you set it down.',
  'One small habit, repeated daily, becomes a tidy life.',
  "You're not disorganized — you just haven't found your system yet.",
  'The best organizing system is the one you actually use.',
  'Peace of mind starts with knowing where your keys are.',
  'Every found item is a small victory — celebrate it.',
  'Simplify what you own, and you simplify your mind.',
  'A well-placed thing is a gift to your future self.',
  'Today is a good day to put something back where it belongs.',
  'Remembering starts with noticing.',
  'Your home should work for you, not the other way around.',
  'Small steps toward order add up to a life with less stress.',
  "The things you love deserve a place you'll remember.",
  'A clear space clears the mind.',
  "You don't have to be perfect — just a little more mindful.",
  'Every day is a chance to build a habit that serves you.',
  'What gets a home, gets found.',
  'Take a breath, put it down gently, and remember where.',
  'Small order in small things brings a surprising amount of calm.',
  "Nothing is really lost — it's just waiting for you to remember.",
];

// Deterministic string hash (djb2-ish) so the same person sees the same
// quote all day, and a different one tomorrow, without storing anything.
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

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

// Curated starter suggestions so a brand-new person (with no saved items
// yet) still sees sensible options in the "What"/"Where" dropdowns, rather
// than an empty list. Combined at render time with whatever rooms/items the
// person has actually saved (see allRoomOptions/allItemOptions below) and,
// for rooms, with any the person adds ahead of time via the room manager.
const DEFAULT_ROOMS = [
  'Living Room', 'Bedroom', 'Kitchen', 'Bathroom', 'Garage', 'Home Office',
  'Dining Room', 'Hallway', 'Entryway', 'Closet', 'Basement', 'Attic',
  'Laundry Room', "Kids' Room", 'Guest Room', 'Storage Room', 'Car',
];
const DEFAULT_ITEMS = [
  'Keys', 'Wallet', 'Phone Charger', 'Remote Control', 'Glasses', 'Sunglasses',
  'Passport', 'Umbrella', 'Headphones', 'Medication', 'Scissors', 'Tape Measure',
  'Flashlight', 'Batteries', 'Stapler', 'USB Drive', 'Watch', 'Jewelry', 'Toolbox',
  'First Aid Kit', 'Car Keys', 'Spare Keys', 'Mail', 'Checkbook', 'Backpack',
  'Gym Bag', 'Charger Cable', 'Laptop', 'Tablet', 'Camera', 'Extra Cash', 'Tape',
  'Hat', 'Gloves', 'Scarf', 'Water Bottle', 'Vitamins', 'Sewing Kit', 'Extension Cord',
];

// Simple Fisher-Yates shuffle — used to pick random quiz questions and to
// scramble each question's multiple-choice answers.
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  // Default to the vibrant-but-calm Ocean theme rather than the plainer
  // Cream one (Sunset was tried first but users found the coral/orange too
  // much) — people can still switch to any of the four from the palette
  // button.
  const [themeName, setThemeName] = useState('ocean');
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [showHelp, setShowHelp] = useState(false);
  // Rooms the person has proactively added (via the room manager panel)
  // ahead of actually saving an item there — merged with DEFAULT_ROOMS and
  // whatever rooms already show up in their saved items to build the full
  // suggestion list. Persisted so the list survives reloads.
  const [customRooms, setCustomRooms] = useState([]);
  const [showRoomManager, setShowRoomManager] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState('');
  // "Quiz yourself" — a light memory game once there are enough items saved
  // to make it meaningful. quizQuestions is null until a round is started.
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizSelected, setQuizSelected] = useState(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  // A random saved item surfaced once per visit/login as a gentle memory
  // nudge — see the sessionStorage-gated logic in the mount effect below.
  const [reminderItem, setReminderItem] = useState(null);
  const recognitionRef = useRef(null);
  const handsFreeCancelRef = useRef(false);
  const itemsRef = useRef(items);
  const usVoiceRef = useRef(undefined); // undefined = not looked up yet, null = none found
  // Whether this browser has ever successfully started microphone capture
  // before (i.e. the permission prompt, if any, has already been answered).
  // Once true, we no longer need to race the mic start against the user's
  // tap — we can speak the full prompt first and *then* listen, giving a
  // real pause to answer instead of listening while the prompt is still
  // talking. Persisted so it survives reloads, not just this session.
  const micUnlockedRef = useRef(
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('wdipi_mic_unlocked') === '1'
      : false
  );
  // Diagnostic only: the raw reason the most recent listenFor() attempt
  // came back empty (a SpeechRecognition error code like 'not-allowed' or
  // 'no-speech', or 'unsupported'/'ended-without-speech'). Surfaced on
  // screen when hands-free add fails to catch anything, so we can actually
  // see why instead of guessing blind.
  const lastListenErrorRef = useRef(null);
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

  // Full suggestion lists for the "What"/"Where" dropdowns: curated
  // defaults, plus anything the person has actually saved, plus (for
  // rooms only) anything they've proactively added via the room manager.
  // Deduped case-insensitively so "kitchen" typed once doesn't produce two
  // near-identical entries.
  const allRoomOptions = useMemo(() => {
    const seen = new Map();
    for (const r of [...DEFAULT_ROOMS, ...customRooms, ...distinctLocations]) {
      const key = r.toLowerCase();
      if (!seen.has(key)) seen.set(key, r);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [customRooms, distinctLocations]);
  const allItemOptions = useMemo(() => {
    const seen = new Map();
    for (const n of [...DEFAULT_ITEMS, ...distinctNames]) {
      const key = n.toLowerCase();
      if (!seen.has(key)) seen.set(key, n);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [distinctNames]);

  // Live date/time for the "Today" panel — updated on a light interval
  // rather than every second, since a wall clock doesn't need to be
  // second-accurate here. Starts null (rather than `new Date()`) so the
  // server-rendered markup and the first client render match exactly —
  // the actual time is filled in a moment later, client-side only, in the
  // effect below, avoiding a hydration mismatch on the clock text.
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // One quote per person per (local) day — stable all day, different
  // tomorrow, and different between people, without needing to store
  // anything or call an external service.
  const quoteOfDay = useMemo(() => {
    if (!now) return QUOTES[0];
    const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const seed = `${dateKey}|${userEmail || 'guest'}`;
    return QUOTES[hashString(seed) % QUOTES.length];
  }, [now, userEmail]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email);
      const loaded = await loadItems();

      // Once per visit/login, gently remind the person where one random
      // saved item is. sessionStorage (not localStorage) so it comes back
      // each new visit rather than only the very first time ever, but
      // doesn't nag again on every re-render within the same visit.
      try {
        const alreadyShown = typeof window !== 'undefined' && window.sessionStorage
          ? window.sessionStorage.getItem('wdipi_reminder_shown') === '1'
          : true;
        if (!alreadyShown && loaded.length > 0) {
          setReminderItem(loaded[Math.floor(Math.random() * loaded.length)]);
          if (window.sessionStorage) window.sessionStorage.setItem('wdipi_reminder_shown', '1');
        }
      } catch {
        // sessionStorage can throw in private browsing — just skip the reminder.
      }
    })();

    const SR = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (SR) setVoiceSupported(true);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSpeechSupported(true);
      // Voice lists load asynchronously on some browsers/OSes (the first
      // getVoices() call can come back empty until 'voiceschanged' fires),
      // so look up a US English voice once up front and cache it in a ref.
      // Doing this ahead of time — rather than inside speak() — keeps
      // speak() itself synchronous, which matters on strict mobile browsers
      // that only allow audio to start when it's tied directly to the user
      // gesture that triggered it.
      pickUSVoice();
    }

    // Pick up any saved theme/layout choice from a previous visit.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedTheme = window.localStorage.getItem('wdipi_theme');
        if (savedTheme && THEMES[savedTheme]) setThemeName(savedTheme);
        const savedView = window.localStorage.getItem('wdipi_view');
        if (savedView === 'grid' || savedView === 'list') setViewMode(savedView);
        const savedRooms = window.localStorage.getItem('wdipi_custom_rooms');
        if (savedRooms) {
          const parsed = JSON.parse(savedRooms);
          if (Array.isArray(parsed)) setCustomRooms(parsed);
        }
      }
    } catch {
      // localStorage can throw in private-browsing modes — safe to ignore, just use defaults.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply the selected theme as CSS custom properties on the document root
  // (rather than only in component state) so globals.css and every inline
  // style referencing var(--wdipi-*) picks it up immediately, and persist
  // the choice for next time.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const t = THEMES[themeName] || THEMES.cream;
    const root = document.documentElement.style;
    root.setProperty('--wdipi-bg', t.bg);
    root.setProperty('--wdipi-ink', t.ink);
    root.setProperty('--wdipi-surface', t.surface);
    root.setProperty('--wdipi-border', t.border);
    root.setProperty('--wdipi-muted', t.muted);
    root.setProperty('--wdipi-body', t.body);
    root.setProperty('--wdipi-text2', t.text2);
    root.setProperty('--wdipi-accent', t.accent);
    root.setProperty('--wdipi-accent-rgb', t.accentRgb);
    root.setProperty('--wdipi-warn-bg', t.warnBg);
    root.setProperty('--wdipi-warn-border', t.warnBorder);
    root.setProperty('--wdipi-error-bg', t.errorBg);
    root.setProperty('--wdipi-error-text', t.errorText);
    root.setProperty('--wdipi-caption-bg', t.captionBg);
    root.setProperty('--wdipi-highlight', t.highlight);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t.bg);
    try {
      if (window.localStorage) window.localStorage.setItem('wdipi_theme', themeName);
    } catch {
      // ignore — private browsing etc.
    }
  }, [themeName]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('wdipi_view', viewMode);
      }
    } catch {
      // ignore — private browsing etc.
    }
  }, [viewMode]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('wdipi_custom_rooms', JSON.stringify(customRooms));
      }
    } catch {
      // ignore — private browsing etc.
    }
  }, [customRooms]);

  // Reset the quiz whenever its panel is closed (by toggling it off, or by
  // opening a different panel), so reopening it always starts fresh rather
  // than resuming a half-finished or already-scored round.
  useEffect(() => {
    if (!showQuiz) {
      setQuizQuestions(null);
      setQuizIndex(0);
      setQuizScore(0);
      setQuizSelected(null);
      setQuizAnswered(false);
    }
  }, [showQuiz]);

  const loadItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setItems(data);
    setLoading(false);
    return !error && data ? data : [];
  };

  // Adds a room to the person's own list ahead of saving any item there
  // (e.g. "Sunroom" before anything is actually stored in it). Rooms that
  // already show up via a default or a saved item are simply ignored.
  const addCustomRoom = () => {
    const name = newRoomInput.trim();
    if (!name) return;
    const exists = allRoomOptions.some((r) => r.toLowerCase() === name.toLowerCase());
    if (!exists) setCustomRooms((prev) => [...prev, name]);
    setNewRoomInput('');
  };
  const removeCustomRoom = (name) => {
    setCustomRooms((prev) => prev.filter((r) => r.toLowerCase() !== name.toLowerCase()));
  };

  // Builds a short multiple-choice round from the person's own saved items:
  // "Where did you put your X?" with the real location plus a few
  // plausible-but-wrong rooms as distractors.
  const startQuiz = () => {
    const pool = shuffleArray(items).slice(0, Math.min(8, items.length));
    const questions = pool.map((item) => {
      const otherLocations = distinctLocations.filter(
        (l) => l.toLowerCase() !== item.location.toLowerCase()
      );
      const distractorPool = otherLocations.length >= 3
        ? otherLocations
        : Array.from(new Set([
            ...otherLocations,
            ...DEFAULT_ROOMS.filter((r) => r.toLowerCase() !== item.location.toLowerCase()),
          ]));
      const distractors = shuffleArray(distractorPool).slice(0, 3);
      const choices = shuffleArray([item.location, ...distractors]);
      return { itemName: item.name, correctAnswer: item.location, choices };
    });
    setQuizQuestions(questions);
    setQuizIndex(0);
    setQuizScore(0);
    setQuizSelected(null);
    setQuizAnswered(false);
  };

  const answerQuiz = (choice) => {
    if (quizAnswered) return;
    setQuizSelected(choice);
    setQuizAnswered(true);
    if (choice === quizQuestions[quizIndex].correctAnswer) {
      setQuizScore((s) => s + 1);
    }
  };
  const nextQuizQuestion = () => {
    setQuizIndex((i) => i + 1);
    setQuizSelected(null);
    setQuizAnswered(false);
  };

  // Opens exactly one of the header panels at a time — clicking the button
  // for whichever one is already open closes it instead.
  const togglePanel = (name) => {
    setShowHelp((prev) => (name === 'help' ? !prev : false));
    setShowThemePicker((prev) => (name === 'theme' ? !prev : false));
    setShowRoomManager((prev) => (name === 'rooms' ? !prev : false));
    setShowQuiz((prev) => (name === 'quiz' ? !prev : false));
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
  // Looks through the browser's installed speech-synthesis voices for a US
  // English one and caches it in usVoiceRef, so spoken prompts default to a
  // US accent instead of whatever locale voice happens to be first in the
  // list on the person's device. Safe to call more than once — it only does
  // the actual lookup the first time.
  const pickUSVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (usVoiceRef.current !== undefined) return;

    const choose = (voices) => {
      const usVoices = voices.filter((v) => v.lang === 'en-US' || v.lang === 'en_US');
      if (usVoices.length === 0) return null;
      // Prefer a natural-sounding, well-known US voice when the platform
      // offers one; otherwise just take the first US English voice listed.
      const preferred = usVoices.find((v) =>
        /Samantha|Google US English|Microsoft Aria|Microsoft Guy|Ava|Zira/i.test(v.name)
      );
      return preferred || usVoices[0];
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      usVoiceRef.current = choose(voices) || null;
      return;
    }

    // Voice list isn't loaded yet on this browser — wait for it once.
    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      usVoiceRef.current = choose(window.speechSynthesis.getVoices()) || null;
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
  };

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
        // Force a US English voice so prompts don't come out in whatever
        // locale accent the device defaults to.
        utter.lang = 'en-US';
        pickUSVoice();
        if (usVoiceRef.current) utter.voice = usVoiceRef.current;
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
      lastListenErrorRef.current = 'unsupported';
      resolve('');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;
    setListeningField(label);
    lastListenErrorRef.current = null;

    const startedAt = Date.now();
    let settled = false;
    const finish = (value, errorCode) => {
      if (settled) return;
      if (errorCode !== undefined) {
        lastListenErrorRef.current = errorCode;
      } else if (!value && !lastListenErrorRef.current) {
        // Recognition ended with nothing to show and no explicit error —
        // most likely it just didn't hear speech in time.
        lastListenErrorRef.current = 'ended-without-speech';
      }
      if (!value && attempt === 1 && !handsFreeCancelRef.current && Date.now() - startedAt < 700) {
        settled = true;
        resolve(listenFor(label, 2));
        return;
      }
      settled = true;
      setListeningField(null);
      resolve(value);
    };
    recognition.onstart = () => {
      // Audio capture actually began, so the mic permission prompt (if any)
      // has been answered — remember that so future prompts can speak in
      // full before listening instead of racing the user's tap.
      micUnlockedRef.current = true;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('wdipi_mic_unlocked', '1');
        }
      } catch {
        // localStorage can throw in private-browsing modes — not worth failing over.
      }
    };
    recognition.onresult = (event) => finish(event.results[0][0].transcript.trim(), null);
    // Web Speech API's error codes include: 'not-allowed' (mic permission
    // blocked), 'no-speech' (nothing heard before the browser's own
    // timeout), 'audio-capture' (no working microphone found), 'aborted',
    // 'network', 'service-not-allowed'. Captured here so a failure can
    // actually be diagnosed instead of just looking like silence.
    recognition.onerror = (event) => finish('', (event && event.error) || 'unknown-error');
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
        let heard;
        if (first) {
          if (micUnlockedRef.current) {
            // The mic has already been used successfully on this device
            // before, so there's no permission prompt to race against —
            // speak the full prompt first, THEN start listening, so the
            // person gets the whole pause to answer instead of the mic
            // racing (and often losing) against the prompt still talking.
            await speak('What is it, and where did you put it? For example: chair, office room.');
            if (cancelled()) return;
            heard = await listenFor('name');
          } else {
            // First-ever mic use on this device/browser: some mobile
            // browsers only allow the mic permission prompt to appear when
            // it's triggered synchronously by the tap itself, so start
            // listening immediately (before speaking) this one time.
            setVoiceCaption('What is it, and where did you put it?');
            const heardPromise = listenFor('name');
            speak('What is it, and where did you put it? For example: chair, office room.');
            heard = await heardPromise;
          }
        } else {
          await speak('Next item — what is it and where did you put it? Or say "done" if that\'s everything.');
          if (cancelled()) return;
          heard = await listenFor('name');
        }
        if (cancelled()) return;

        if (!heard) {
          // Surface exactly why the mic came back empty — both on screen
          // and out loud — so a real failure (permission blocked, no mic
          // found, etc.) is visible instead of looking identical to plain
          // silence.
          const diag = lastListenErrorRef.current;
          if (savedCount === 0 && diag) setAddError(`Mic stopped: ${diag}`);
          await speak(savedCount > 0
            ? `Okay, done — I added ${savedCount} ${savedCount === 1 ? 'item' : 'items'}.`
            : `I didn't catch that${diag ? `. Microphone said: ${diag}` : ''}. Let's try again whenever you're ready.`);
          return;
        }
        if (soundsLikeDone(heard)) {
          await speak(savedCount > 0
            ? `Done — I added ${savedCount} ${savedCount === 1 ? 'item' : 'items'}.`
            : 'Okay, nothing added.');
          return;
        }

        first = false;

        // People naturally say the whole thing in one breath ("chair, it's
        // in the office room") rather than waiting for two separate
        // questions, so let AI split what was heard into name + location
        // instead of dumping the entire sentence into the name field.
        let name = heard;
        let location = null;
        try {
          const parseRes = await fetch('/api/parse-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: heard }),
          });
          const parsed = await parseRes.json();
          if (parsed?.name) name = parsed.name;
          if (parsed?.location) location = parsed.location;
        } catch {
          // fall back to treating the whole utterance as just the name
        }
        if (cancelled()) return;
        setNewName(name);
        if (location) setNewLocation(location);

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

        // Only ask separately if they didn't already say where it was.
        if (!location) {
          await speak('And where did you put it?');
          if (cancelled()) return;
          location = await listenFor('location');
          if (cancelled()) return;
          if (!location) {
            await speak("I didn't catch that, so I couldn't save that one. Let's keep going.");
            setNewName('');
            setNewLocation('');
            continue;
          }
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
    background: 'var(--wdipi-warn-bg)',
    border: '1px solid var(--wdipi-warn-border)',
    borderRadius: 6,
    padding: '12px 14px',
    marginBottom: 14,
  };
  const confirmBtnStyle = {
    background: 'var(--wdipi-accent)',
    color: 'var(--wdipi-surface)',
    border: 'none',
    borderRadius: 999,
    padding: '7px 14px',
    fontSize: 13,
    fontWeight: 500,
  };
  const confirmBtnGhostStyle = {
    background: 'transparent',
    color: 'var(--wdipi-body)',
    border: '1px solid var(--wdipi-border)',
    borderRadius: 5,
    padding: '7px 12px',
    fontSize: 13,
  };
  const errorBoxStyle = {
    fontSize: 13,
    color: 'var(--wdipi-error-text)',
    marginBottom: 14,
    padding: '10px 12px',
    background: 'var(--wdipi-error-bg)',
    borderRadius: 6,
  };
  // Shared "vibrant" building blocks: a colorful pill button with a
  // theme-tinted glow (instead of a flat solid color), and a small rounded
  // chip for location text (instead of a plain underline highlight).
  const pillButtonStyle = {
    background: 'var(--wdipi-accent)',
    color: 'var(--wdipi-surface)',
    border: 'none',
    borderRadius: 999,
    fontWeight: 600,
    boxShadow: '0 4px 14px rgba(var(--wdipi-accent-rgb), 0.32)',
  };
  const locationChipStyle = {
    display: 'inline-block',
    background: 'rgba(var(--wdipi-accent-rgb), 0.12)',
    color: 'var(--wdipi-accent)',
    padding: '3px 11px',
    borderRadius: 999,
    fontWeight: 500,
  };
  const cardShadow = '0 2px 10px rgba(var(--wdipi-accent-rgb), 0.08), 0 1px 3px rgba(0,0,0,0.04)';

  return (
    <div style={{
      minHeight: '100vh',
      padding: '22px 18px 60px',
      maxWidth: 640,
      margin: '0 auto',
    }}>
      {/* Shared suggestion lists for the "What"/"Where" inputs below. */}
      <datalist id="wdipi-name-list">
        {allItemOptions.map((n) => <option key={n} value={n} />)}
      </datalist>
      <datalist id="wdipi-location-list">
        {allRoomOptions.map((l) => <option key={l} value={l} />)}
      </datalist>

      {/* Header */}
      <header style={{
        marginBottom: 26,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 14,
        background: 'linear-gradient(135deg, var(--wdipi-accent), rgba(var(--wdipi-accent-rgb), 0.78))',
        borderRadius: 20,
        padding: '28px 24px',
        boxShadow: '0 10px 28px rgba(var(--wdipi-accent-rgb), 0.3)',
      }}>
        <div>
          <h1 className="serif" style={{
            fontSize: 44,
            lineHeight: 0.95,
            margin: 0,
            fontStyle: 'italic',
            letterSpacing: '-0.015em',
            color: 'var(--wdipi-surface)',
          }}>
            Where&apos;d I<br />put it
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.88)', margin: '10px 0 0', lineHeight: 1.4, maxWidth: 340 }}>
            Save what you own and where it is. Then find it later — by typing or by talking.
          </p>
          {userEmail && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '4px 0 0' }}>
              Signed in as {userEmail}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => togglePanel('help')}
            title="How to use this app"
            aria-label="How to use this app"
            style={{
              background: showHelp ? 'var(--wdipi-surface)' : 'rgba(255,255,255,0.16)',
              color: showHelp ? 'var(--wdipi-accent)' : 'var(--wdipi-surface)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <HelpCircle size={16} />
          </button>
          <button
            onClick={() => togglePanel('theme')}
            title="Change background theme"
            aria-label="Change background theme"
            style={{
              background: showThemePicker ? 'var(--wdipi-surface)' : 'rgba(255,255,255,0.16)',
              color: showThemePicker ? 'var(--wdipi-accent)' : 'var(--wdipi-surface)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Palette size={16} />
          </button>
          <button
            onClick={() => togglePanel('rooms')}
            title="Manage your rooms"
            aria-label="Manage your rooms"
            style={{
              background: showRoomManager ? 'var(--wdipi-surface)' : 'rgba(255,255,255,0.16)',
              color: showRoomManager ? 'var(--wdipi-accent)' : 'var(--wdipi-surface)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <DoorOpen size={16} />
          </button>
          <button
            onClick={() => togglePanel('quiz')}
            title="Quiz yourself"
            aria-label="Quiz yourself"
            style={{
              background: showQuiz ? 'var(--wdipi-surface)' : 'rgba(255,255,255,0.16)',
              color: showQuiz ? 'var(--wdipi-accent)' : 'var(--wdipi-surface)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: '8px 9px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Brain size={16} />
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.35)',
              borderRadius: 999,
              padding: '8px 10px',
              color: 'var(--wdipi-surface)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      {/* A once-per-visit nudge about where one random saved item is —
          see the sessionStorage-gated logic that sets reminderItem. */}
      {reminderItem && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          padding: '12px 16px',
          background: 'var(--wdipi-caption-bg)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 12,
        }}>
          <Lightbulb size={18} color="var(--wdipi-accent)" style={{ flexShrink: 0 }} aria-hidden="true" />
          <p style={{ margin: 0, flex: 1, fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.4 }}>
            Quick reminder — your <strong>{reminderItem.name}</strong> is in{' '}
            <span style={locationChipStyle}>{reminderItem.location}</span>.
          </p>
          <button
            onClick={() => setReminderItem(null)}
            aria-label="Dismiss reminder"
            style={{ background: 'none', border: 'none', padding: 4, color: 'var(--wdipi-muted)', display: 'flex', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Today panel: date/time + a quote of the day, personal to this
          person (see quoteOfDay above) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 22,
        padding: '16px 20px',
        background: 'var(--wdipi-surface)',
        border: '1px solid var(--wdipi-border)',
        borderRadius: 16,
        boxShadow: cardShadow,
        flexWrap: 'wrap',
      }}>
        <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" style={{ flexShrink: 0 }}>
          <defs>
            <linearGradient id="wdipi-today-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--wdipi-accent)" />
              <stop offset="100%" stopColor="var(--wdipi-highlight)" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="32" fill="url(#wdipi-today-grad)" opacity="0.18" />
          <circle cx="32" cy="32" r="21" fill="url(#wdipi-today-grad)" opacity="0.35" />
          <path
            d="M32 15 L35.5 27.5 L48 31 L35.5 34.5 L32 47 L28.5 34.5 L16 31 L28.5 27.5 Z"
            fill="var(--wdipi-accent)"
          />
        </svg>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: 'var(--wdipi-muted)',
          }}>
            {now
              ? `${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
              : ' '}
          </p>
          <p className="serif" style={{
            margin: '6px 0 0',
            fontSize: 18,
            fontStyle: 'italic',
            color: 'var(--wdipi-ink)',
            lineHeight: 1.35,
          }}>
            &ldquo;{quoteOfDay}&rdquo;
          </p>
        </div>
      </div>

      {showThemePicker && (
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 20,
          padding: '12px 14px',
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--wdipi-muted)' }}>Theme:</span>
          {Object.entries(THEMES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => setThemeName(key)}
              title={t.label}
              aria-label={`${t.label} theme`}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: themeName === key ? '2px solid var(--wdipi-ink)' : '1px solid var(--wdipi-border)',
                background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                padding: 0,
                flexShrink: 0,
              }}
            />
          ))}
          <span style={{ fontSize: 12, color: 'var(--wdipi-muted)', marginLeft: 4 }}>
            {THEMES[themeName]?.label}
          </span>
        </div>
      )}

      {showRoomManager && (
        <div style={{
          marginBottom: 20,
          padding: '16px 18px',
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 8,
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: 'var(--wdipi-ink)' }}>
            Your rooms
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={newRoomInput}
              onChange={(e) => setNewRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomRoom()}
              placeholder="Add a room, e.g. Sunroom"
              style={{
                flex: 1,
                minWidth: 0,
                border: '1px solid var(--wdipi-border)',
                borderRadius: 999,
                padding: '8px 14px',
                fontSize: 13,
                background: 'var(--wdipi-bg)',
              }}
            />
            <button
              onClick={addCustomRoom}
              disabled={!newRoomInput.trim()}
              style={{
                ...pillButtonStyle,
                padding: '8px 16px',
                fontSize: 13,
                opacity: newRoomInput.trim() ? 1 : 0.4,
                cursor: newRoomInput.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allRoomOptions.map((r) => (
              <span key={r} style={{ ...locationChipStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {r}
                {customRooms.some((c) => c.toLowerCase() === r.toLowerCase()) && (
                  <button
                    onClick={() => removeCustomRoom(r)}
                    aria-label={`Remove ${r}`}
                    style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'inherit', cursor: 'pointer' }}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--wdipi-muted)', lineHeight: 1.4 }}>
            These show up as suggestions when you add an item — you can always type a room
            that&apos;s not listed here too, and it&apos;ll show up next time.
          </p>
        </div>
      )}

      {showQuiz && (
        <div style={{
          marginBottom: 20,
          padding: '16px 18px',
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 8,
        }}>
          {items.length < 10 ? (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--wdipi-ink)' }}>
                Quiz yourself
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
                Add a few more items to unlock this — you have {items.length} of the 10 needed
                to start a quiz.
              </p>
            </>
          ) : !quizQuestions ? (
            <>
              <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--wdipi-ink)' }}>
                Quiz yourself
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
                See how well you remember where everything is.
              </p>
              <button style={{ ...pillButtonStyle, padding: '9px 16px', fontSize: 13 }} onClick={startQuiz}>
                Start quiz
              </button>
            </>
          ) : quizIndex < quizQuestions.length ? (
            <>
              <p style={{
                margin: '0 0 4px',
                fontSize: 11,
                color: 'var(--wdipi-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}>
                Question {quizIndex + 1} of {quizQuestions.length}
              </p>
              <p className="serif" style={{ margin: '0 0 14px', fontSize: 20, fontStyle: 'italic', color: 'var(--wdipi-ink)' }}>
                Where did you put your {quizQuestions[quizIndex].itemName}?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {quizQuestions[quizIndex].choices.map((choice) => {
                  const isCorrect = choice === quizQuestions[quizIndex].correctAnswer;
                  const isSelected = choice === quizSelected;
                  let bg = 'var(--wdipi-bg)';
                  let border = '1px solid var(--wdipi-border)';
                  if (quizAnswered && isCorrect) { bg = 'var(--wdipi-caption-bg)'; border = '1px solid var(--wdipi-accent)'; }
                  if (quizAnswered && isSelected && !isCorrect) { bg = 'var(--wdipi-error-bg)'; border = '1px solid var(--wdipi-error-text)'; }
                  return (
                    <button
                      key={choice}
                      onClick={() => answerQuiz(choice)}
                      disabled={quizAnswered}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: bg,
                        border,
                        fontSize: 14,
                        color: 'var(--wdipi-body)',
                        cursor: quizAnswered ? 'default' : 'pointer',
                      }}
                    >
                      {choice}
                      {quizAnswered && isCorrect && <Check size={15} color="var(--wdipi-accent)" />}
                      {quizAnswered && isSelected && !isCorrect && <X size={15} color="var(--wdipi-error-text)" />}
                    </button>
                  );
                })}
              </div>
              {quizAnswered && (
                <button
                  style={{ ...pillButtonStyle, padding: '9px 16px', fontSize: 13, marginTop: 14 }}
                  onClick={nextQuizQuestion}
                >
                  {quizIndex + 1 < quizQuestions.length ? 'Next question' : 'See my score'}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="serif" style={{ margin: '0 0 8px', fontSize: 24, fontStyle: 'italic', color: 'var(--wdipi-ink)' }}>
                {quizScore} of {quizQuestions.length} right
              </p>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--wdipi-body)' }}>
                {quizScore === quizQuestions.length
                  ? 'Perfect memory — nicely done.'
                  : 'Not bad — a quick look at your list will fix the rest.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...pillButtonStyle, padding: '9px 16px', fontSize: 13 }} onClick={startQuiz}>
                  Try again
                </button>
                <button style={confirmBtnGhostStyle} onClick={() => setShowQuiz(false)}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showHelp && (
        <div style={{
          marginBottom: 20,
          padding: '16px 18px',
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 8,
        }}>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: 'var(--wdipi-ink)' }}>
            How to use this app
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
            <strong>Adding things:</strong> tap &ldquo;+ Add item&rdquo;, then either type both
            boxes, or tap the mic on &ldquo;What is it?&rdquo; and just say it all at once —
            &ldquo;chair, office room&rdquo;. It&apos;ll keep asking for the next item automatically;
            say &ldquo;done&rdquo; whenever you&apos;re finished.
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
            <strong>Finding things:</strong> type what you&apos;re looking for in the search box at
            the top, or tap its mic and ask out loud — it understands typos, plurals, and
            nicknames (like &ldquo;specs&rdquo; for glasses).
          </p>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
            <strong>Fixing things:</strong> tap Edit on any item to update where it is, or Delete
            to remove it.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
            <strong>Making it yours:</strong> tap <Palette size={12} style={{ verticalAlign: -1 }} />{' '}
            above to change the color theme, or the{' '}
            <List size={12} style={{ verticalAlign: -1 }} />/<LayoutGrid size={12} style={{ verticalAlign: -1 }} />{' '}
            icons above your list to switch between a list and a grid of cards.
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--wdipi-body)', lineHeight: 1.5 }}>
            <strong>Rooms &amp; quiz:</strong> tap <DoorOpen size={12} style={{ verticalAlign: -1 }} />{' '}
            to add rooms ahead of time so they show up as suggestions — you can still type any
            room that&apos;s not listed. Once you&apos;ve saved 10 items, tap{' '}
            <Brain size={12} style={{ verticalAlign: -1 }} /> to quiz yourself on what&apos;s
            where.
          </p>
        </div>
      )}

      {/* Search bar */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex',
          gap: 6,
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderRadius: 999,
          padding: '4px 4px 4px 18px',
          alignItems: 'center',
          boxShadow: '0 2px 10px rgba(var(--wdipi-accent-rgb), 0.08)',
        }}>
          <Search size={16} color="var(--wdipi-accent)" style={{ flexShrink: 0 }} />
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
                color: 'var(--wdipi-muted)',
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
                background: 'var(--wdipi-accent)',
                color: 'var(--wdipi-surface)',
                border: 'none',
                borderRadius: 999,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                boxShadow: '0 3px 10px rgba(var(--wdipi-accent-rgb), 0.3)',
              }}
            >
              {listeningField === 'search' ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
        {!voiceSupported && (
          <p style={{ fontSize: 11, color: 'var(--wdipi-muted)', margin: '6px 0 0' }}>
            Voice search needs Chrome, Edge, or Safari
          </p>
        )}
        {listeningField === 'search' && (
          <p style={{
            fontSize: 13,
            color: 'var(--wdipi-accent)',
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
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
          borderLeft: '3px solid var(--wdipi-accent)',
          borderRadius: 4,
          padding: '14px 16px',
          marginBottom: 22,
        }}>
          {isSearching ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--wdipi-muted)' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 14 }}>Looking through your things...</span>
            </div>
          ) : searchResult ? (
            <div>
              <p style={{
                margin: 0,
                fontSize: 14,
                color: 'var(--wdipi-body)',
                marginBottom: searchResult.matches?.length ? 12 : 0,
              }}>
                {searchResult.message}
              </p>
              {searchResult.matches?.map((m, idx) => (
                <div key={idx} style={{
                  marginTop: idx > 0 ? 12 : 0,
                  paddingTop: idx > 0 ? 12 : 0,
                  borderTop: idx > 0 ? '1px dashed var(--wdipi-border)' : 'none',
                }}>
                  <div className="serif" style={{
                    fontSize: 22,
                    fontStyle: 'italic',
                    lineHeight: 1.1,
                  }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 8 }}>
                    <span style={locationChipStyle}>{m.location}</span>
                  </div>
                  {m.confidence === 'low' && (
                    <div style={{
                      fontSize: 11,
                      color: 'var(--wdipi-muted)',
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
        borderBottom: '1px solid var(--wdipi-border)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--wdipi-muted)' }}>
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
          style={showAdd ? {
            background: 'transparent',
            color: 'var(--wdipi-body)',
            border: '1px solid var(--wdipi-border)',
            borderRadius: 999,
            padding: '9px 16px',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 500,
          } : {
            ...pillButtonStyle,
            padding: '10px 18px',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {showAdd ? <><X size={14} /> Close</> : <><Plus size={15} /> Add item</>}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{
          background: 'var(--wdipi-surface)',
          border: '1px solid var(--wdipi-border)',
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
              background: 'var(--wdipi-caption-bg)',
              borderRadius: 6,
            }}>
              <p style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--wdipi-accent)',
                fontStyle: 'italic',
                flex: 1,
              }}>
                {listeningField ? 'Listening...' : voiceCaption}
              </p>
              <button
                onClick={stopHandsFree}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--wdipi-border)',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  color: 'var(--wdipi-body)',
                  flexShrink: 0,
                }}
              >
                Stop
              </button>
            </div>
          )}
          {!handsFreeActive && (
            <p style={{ fontSize: 12, color: 'var(--wdipi-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Type both boxes, or tap <Mic size={11} style={{ verticalAlign: -1 }} /> on the first
              one and just say it all at once — &ldquo;chair, office room&rdquo; — then keep
              going, one item after another, and say &ldquo;done&rdquo; when you&apos;re finished.
            </p>
          )}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            borderBottom: '1px solid var(--wdipi-border)',
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
                  background: 'var(--wdipi-accent)',
                  color: 'var(--wdipi-surface)',
                  border: 'none',
                  borderRadius: 999,
                  padding: 8,
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  boxShadow: '0 3px 10px rgba(var(--wdipi-accent-rgb), 0.3)',
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
                  background: listeningField === 'location' ? 'var(--wdipi-accent)' : 'transparent',
                  color: listeningField === 'location' ? 'var(--wdipi-surface)' : 'var(--wdipi-muted)',
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
              color: 'var(--wdipi-accent)',
              fontStyle: 'italic',
              margin: '0 0 14px',
            }}>
              Listening... say {listeningField === 'name' ? 'what it is' : 'where you put it'}
            </p>
          )}

          {addError && <div style={errorBoxStyle}>{addError}</div>}

          {!handsFreeActive && (pendingDuplicate ? (
            <div style={confirmBoxStyle}>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--wdipi-body)' }}>
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
              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--wdipi-body)' }}>
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
                ...pillButtonStyle,
                padding: '10px 18px',
                fontSize: 14,
                opacity: newName.trim() && newLocation.trim() ? 1 : 0.4,
                cursor: newName.trim() && newLocation.trim() ? 'pointer' : 'not-allowed',
                boxShadow: newName.trim() && newLocation.trim() ? pillButtonStyle.boxShadow : 'none',
              }}
            >
              Save it
            </button>
          ))}
        </div>
      )}

      {/* Items list */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 10 }}>
          <button
            onClick={() => setViewMode('list')}
            aria-label="List view"
            title="List view"
            style={{
              background: viewMode === 'list' ? 'var(--wdipi-ink)' : 'transparent',
              color: viewMode === 'list' ? 'var(--wdipi-surface)' : 'var(--wdipi-muted)',
              border: '1px solid var(--wdipi-border)',
              borderRadius: 4,
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <List size={14} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
            title="Grid view"
            style={{
              background: viewMode === 'grid' ? 'var(--wdipi-ink)' : 'transparent',
              color: viewMode === 'grid' ? 'var(--wdipi-surface)' : 'var(--wdipi-muted)',
              border: '1px solid var(--wdipi-border)',
              borderRadius: 4,
              padding: '5px 8px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--wdipi-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--wdipi-muted)' }}>
          <p className="serif" style={{
            fontSize: 26,
            fontStyle: 'italic',
            margin: 0,
            color: 'var(--wdipi-body)',
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
                ...pillButtonStyle,
                padding: '10px 20px',
                fontSize: 14,
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
        <div style={viewMode === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 12,
        } : {
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {items.map((item) => (
            <div key={item.id} style={{
              padding: viewMode === 'grid' ? 14 : '16px 18px',
              border: '1px solid var(--wdipi-border)',
              borderRadius: 12,
              background: 'var(--wdipi-surface)',
              boxShadow: cardShadow,
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
                          border: '1px solid var(--wdipi-accent)',
                          background: 'var(--wdipi-surface)',
                          fontSize: 15,
                          padding: '8px 10px',
                          borderRadius: 4,
                        }}
                      />

                      {editError && <div style={{ ...errorBoxStyle, marginTop: 8 }}>{editError}</div>}

                      {editPendingConfirm ? (
                        <div style={{ ...confirmBoxStyle, marginTop: 8, marginBottom: 0 }}>
                          <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--wdipi-body)' }}>
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
                              background: 'var(--wdipi-accent)',
                              color: 'var(--wdipi-surface)',
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
                              color: 'var(--wdipi-muted)',
                              border: '1px solid var(--wdipi-border)',
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
                        fontSize: 14,
                        marginTop: 8,
                        wordBreak: 'break-word',
                      }}>
                        <span style={locationChipStyle}>{item.location}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--wdipi-muted)', marginTop: 6 }}>
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
                        border: '1px solid var(--wdipi-border)',
                        borderRadius: 4,
                        padding: '7px 10px',
                        color: 'var(--wdipi-body)',
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
                        border: '1px solid var(--wdipi-border)',
                        borderRadius: 4,
                        padding: '7px 10px',
                        color: 'var(--wdipi-muted)',
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
