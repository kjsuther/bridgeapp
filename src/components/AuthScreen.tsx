import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Spade as CardIcon, Mail, KeyRound } from 'lucide-react';

export function AuthScreen() {
  const { signInWithOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error } = await signInWithOtp(email.trim());
    if (error) {
      setError(error);
      setBusy(false);
    } else {
      setStep('code');
      setBusy(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const { error } = await verifyOtp(email.trim(), code.trim());
    if (error) {
      setError(error);
      setBusy(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 mb-4">
            <CardIcon className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bridge Club</h1>
          <p className="text-slate-400 mt-2">Private bridge for your friend group</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl p-8">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    placeholder="you@example.com"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  We'll send a 6-digit code to your email. New emails are automatically signed up.
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
              >
                {busy ? 'Sending code...' : 'Send Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Enter the code sent to {email}</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    maxLength={8}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/70 border border-slate-700 rounded-lg text-white text-center text-2xl tracking-[0.5em] placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    placeholder="00000000"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/20"
              >
                {busy ? 'Verifying...' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={handleBackToEmail}
                className="w-full text-sm text-slate-400 hover:text-white transition-colors"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
