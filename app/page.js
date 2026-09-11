'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Mic, MicOff, Plus, X, Check, Pencil, Trash2, Loader2, LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';

export default function Home() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLocation, setEditLocation] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const recognitionRef = useRef(null);
  const itemsRef = useRef(items);
  const router = useRouter();
  const supabase = createClient();

  // Keep a ref to items so the voice-recognition callback always sees fresh data.
  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email);
      await loadItems();
    })();

    const SR = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (SR) {
      setVoiceSupported(true);
      const recognition = new SR();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setQuery(transcript);
        setIsListening(false);
        handleSearch(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
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

  const startListening = () => {
    if (!recognitionRef.current) return;
    setSearchResult(null);
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
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

  const addItem = async () => {
    if (!newName.trim() || !newLocation.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('items')
      .insert({
        user_id: user.id,
        name: newName.trim(),
        location: newLocation.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setItems([data, ...items]);
      setNewName('');
      setNewLocation('');
      setShowAdd(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditLocation(item.location);
  };

  const saveEdit = async (id) => {
    if (!editLocation.trim()) return;
    const { data, error } = await supabase
      .from('items')
      .update({
        location: editLocation.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      const others = items.filter((i) => i.id !== id);
      setItems([data, ...others]);
      setEditingId(null);
      setEditLocation('');
    }
  };

  const deleteItem = async (id) => {
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (!error) {
      setItems(items.filter((i) => i.id !== id));
      if (searchResult?.matches?.some((m) => m.id === id)) setSearchResult(null);
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

  return (
    <div style={{
      minHeight: '100vh',
      padding: '22px 18px 60px',
      maxWidth: 640,
      margin: '0 auto',
    }}>
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
          <p style={{ fontSize: 13, color: '#8C877A', margin: '10px 0 0' }}>
            {userEmail || 'Your personal thing-finder'}
          </p>
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
          }}
        >
          <LogOut size={14} />
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
              onClick={isListening ? stopListening : startListening}
              className={isListening ? 'listening-pulse' : ''}
              aria-label={isListening ? 'Stop listening' : 'Voice search'}
              style={{
                background: isListening ? '#2B4C7E' : '#1B1D1A',
                color: '#FAF9F3',
                border: 'none',
                borderRadius: 7,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
        {!voiceSupported && (
          <p style={{ fontSize: 11, color: '#8C877A', margin: '6px 0 0' }}>
            Voice search needs Chrome, Edge, or Safari
          </p>
        )}
        {isListening && (
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

      {/* Divider with count + add */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #DDD8CA',
      }}>
        <span style={{ fontSize: 12, color: '#8C877A' }}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            background: 'none',
            border: 'none',
            color: '#2B4C7E',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 0',
            fontWeight: 500,
          }}
        >
          {showAdd ? <><X size={14} /> Close</> : <><Plus size={14} /> Add item</>}
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
          <input
            type="text"
            placeholder="What is it?"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              fontSize: 22,
              fontFamily: 'Instrument Serif, serif',
              fontStyle: 'italic',
              padding: '4px 0',
              borderBottom: '1px solid #DDD8CA',
              marginBottom: 10,
            }}
          />
          <input
            type="text"
            placeholder="Where did you put it?"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              fontSize: 15,
              padding: '6px 0',
              marginBottom: 14,
            }}
          />
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
          <p style={{ marginTop: 8, fontSize: 14 }}>
            Add your first item to start remembering.
          </p>
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
                          onClick={() => { setEditingId(null); setEditLocation(''); }}
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
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(item)}
                      title="Update location"
                      aria-label="Update location"
                      style={{
                        background: 'transparent',
                        border: '1px solid #DDD8CA',
                        borderRadius: 4,
                        padding: '7px 9px',
                        color: '#4A4842',
                      }}
                    >
                      <Pencil size={13} />
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
                        padding: '7px 9px',
                        color: '#8C877A',
                      }}
                    >
                      <Trash2 size={13} />
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
