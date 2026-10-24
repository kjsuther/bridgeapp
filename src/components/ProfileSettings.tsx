import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, isAvatarStyle, type AvatarStyle } from '@/lib/avatars';
import { AvatarFigure } from '@/components/AvatarFigure';

interface ProfileSettingsProps {
  onClose: () => void;
}

export function ProfileSettings({ onClose }: ProfileSettingsProps) {
  const { profile, user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>(
    isAvatarStyle(profile?.avatar_style) ? profile.avatar_style : DEFAULT_AVATAR_STYLE,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '');
    setAvatarStyle(isAvatarStyle(profile?.avatar_style) ? profile.avatar_style : DEFAULT_AVATAR_STYLE);
  }, [profile]);

  const handleSave = async () => {
    const nextName = displayName.trim();
    if (!nextName) {
      setError('Please enter a name to show at the table.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await updateProfile(nextName, avatarStyle);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Your profile</p>
            <h2 className="mt-1 text-xl font-bold text-white">How others see you</h2>
            <p className="mt-1 text-sm text-slate-400">{user?.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white" aria-label="Close profile settings">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-slate-300">
          Shown name
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            autoFocus
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-slate-300">Choose an avatar</p>
          <div className="grid grid-cols-4 gap-3">
            {(Object.keys(AVATAR_STYLES) as AvatarStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => setAvatarStyle(style)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${avatarStyle === style ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-950' : 'border-slate-700 bg-slate-950/40 hover:border-slate-500'}`}
                aria-label={`Choose ${AVATAR_STYLES[style].label} avatar`}
                aria-pressed={avatarStyle === style}
              >
                <AvatarFigure style={style} />
                <span className="text-xs text-slate-300">{AVATAR_STYLES[style].label}</span>
                {avatarStyle === style && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50">Cancel</button>
          <button onClick={handleSave} disabled={busy} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">
            {busy ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
