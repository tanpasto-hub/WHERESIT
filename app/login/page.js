'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (data.user && !data.session) {
        setMessage('Check your email for a confirmation link, then come back and sign in.');
      } else {
        router.push('/');
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push('/');
        router.refresh();
      }
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '24px 20px',
      maxWidth: 420,
      margin: '0 auto',
    }}>
      <h1 className="serif" style={{
        fontSize: 44,
        lineHeight: 0.95,
        margin: 0,
        fontStyle: 'italic',
        letterSpacing: '-0.015em',
      }}>
        Where&apos;d I<br />put it
      </h1>
      <p style={{ fontSize: 13, color: '#8C877A', margin: '10px 0 30px' }}>
        Your personal thing-finder
      </p>

      <form onSubmit={handleSubmit} style={{
        background: '#FAF9F3',
        border: '1px solid #DDD8CA',
        borderRadius: 10,
        padding: 20,
      }}>
        <label style={{ display: 'block', fontSize: 13, color: '#8C877A', marginBottom: 4 }}>
          Email
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: '100%',
            border: '1px solid #DDD8CA',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 15,
            marginBottom: 14,
            background: '#F1EFE7',
          }}
        />

        <label style={{ display: 'block', fontSize: 13, color: '#8C877A', marginBottom: 4 }}>
          Password
        </label>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: '100%',
            border: '1px solid #DDD8CA',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 15,
            marginBottom: 18,
            background: '#F1EFE7',
          }}
        />

        {error && (
          <div style={{
            fontSize: 13,
            color: '#8B2E1C',
            marginBottom: 14,
            padding: '10px 12px',
            background: '#F5E3DC',
            borderRadius: 6,
          }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{
            fontSize: 13,
            color: '#2E4A3A',
            marginBottom: 14,
            padding: '10px 12px',
            background: '#E4EDDD',
            borderRadius: 6,
          }}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            background: '#1B1D1A',
            color: '#FAF9F3',
            border: 'none',
            borderRadius: 6,
            padding: '12px 16px',
            fontSize: 15,
            fontWeight: 500,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Just a moment...' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError('');
          setMessage('');
        }}
        style={{
          background: 'none',
          border: 'none',
          color: '#2B4C7E',
          fontSize: 14,
          marginTop: 16,
          padding: 8,
        }}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
