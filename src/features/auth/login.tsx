'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, ShieldCheck, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Brand, Field, Submit } from '@/components/ui';
import { testIds, type UserDto } from '@/contracts';
import { api, json } from '../shared/api';
const personas = [
  { name: 'Maria Lopez', detail: 'Nurse · valid license', email: 'maria.lopez@example.com' },
  { name: 'James Cook', detail: 'Nurse · expired license', email: 'james.cook@example.com' },
  { name: 'Sunrise Health', detail: 'Staffing agency', email: 'admin@sunrisehealth.example' },
  { name: 'Metro Care', detail: 'Staffing agency', email: 'admin@metrocare.example' },
  { name: 'Alex Kim', detail: 'Administrator', email: 'alex.kim@example.com' },
];
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const client = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: UserDto }>('/api/auth/login', {
        method: 'POST',
        body: json({ email, password }),
      });
      client.setQueryData(['session'], { user: result.user });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div className="story-content">
          <span className="eyebrow">
            <span className="live-dot" /> A BETTER WAY TO STAFF CARE
          </span>
          <h1>
            Great care.
            <br />
            The right people.
            <br />
            <em>Connected.</em>
          </h1>
          <p>
            The shared workspace that brings nurses and care teams together. Less coordination. More
            care.
          </p>
          <div className="story-card">
            <div className="story-card-top">
              <span className="mini-icon">
                <ShieldCheck size={24} />
              </span>
              <span className="badge approved">
                <Check size={12} /> Ready for care
              </span>
            </div>
            <h3>Every shift makes a difference.</h3>
            <p>Find your next opportunity, keep credentials current, and make every hour count.</p>
            <div className="avatar-stack">
              <span>ML</span>
              <span>JC</span>
              <span>AK</span>
              <small>One connected care team</small>
            </div>
          </div>
        </div>
        <div className="story-footer">
          Purpose-built for people who care.
          <Sparkles size={18} />
        </div>
      </section>
      <main className="login-form-area">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <span className="eyebrow muted">YOUR WORKSPACE, CONNECTED</span>
          <h2>Welcome to ShiftPatch</h2>
          <p className="subtitle">Sign in to keep care moving.</p>
          <form onSubmit={submit} className="form-stack">
            <Field label="Email address">
              <input
                autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                data-testid={testIds.loginEmail}
              />
            </Field>
            <Field label="Password">
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                data-testid={testIds.loginPassword}
              />
            </Field>
            {error && (
              <div className="inline-error" role="alert" data-testid={testIds.notification}>
                {error}
              </div>
            )}
            <Submit busy={busy} testId={testIds.loginSubmit}>
              Sign in <ArrowRight size={18} />
            </Submit>
          </form>
          <div className="demo-accounts">
            <div className="divider-label">EXPLORE THE DEMO</div>
            <p>Choose a workspace to fill in the demo credentials.</p>
            <div className="persona-grid">
              {personas.map((persona) => (
                <button
                  type="button"
                  className={`persona ${email === persona.email ? 'selected' : ''}`}
                  key={persona.email}
                  onClick={() => {
                    setEmail(persona.email);
                    setPassword('Trial2026!');
                    setError('');
                  }}
                >
                  <strong>{persona.name}</strong>
                  <small>{persona.detail}</small>
                </button>
              ))}
            </div>
          </div>
          <p className="secure-note">
            <ShieldCheck size={15} /> Demo workspace · Synthetic data only
          </p>
        </div>
      </main>
    </div>
  );
}
