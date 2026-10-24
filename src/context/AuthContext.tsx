import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface Profile {
  id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  avatar_style: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithOtp: (email: string) => Promise<{ error: string | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  updateProfile: (displayName: string, avatarStyle: string, avatarUrl?: string | null) => Promise<{ error: string | null }>;
  uploadAvatar: (file: File) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (!newSession) {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email, avatar_url, avatar_style')
        .eq('id', user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        return;
      }

      if (data) {
        setProfile(data as Profile);
      } else {
        const fallbackName =
          (user.user_metadata?.display_name as string) ||
          user.email?.split('@')[0] ||
          'Player';
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert({ id: user.id, display_name: fallbackName, email: user.email ?? null })
          .select('id, display_name, email, avatar_url, avatar_style')
          .maybeSingle();

        if (!cancelled && newProfile) {
          setProfile(newProfile as Profile);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signInWithOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  };

  const updateProfile = async (displayName: string, avatarStyle: string, avatarUrl?: string | null) => {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        avatar_style: avatarStyle,
        ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      })
      .eq('id', user?.id ?? '')
      .select('id, display_name, email, avatar_url, avatar_style')
      .maybeSingle();

    if (error || !data) {
      return { error: error?.message ?? 'Your profile could not be updated.' };
    }

    setProfile(data as Profile);
    return { error: null };
  };

  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      return { error: 'Please choose a JPG, PNG, WEBP, or GIF image.' };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { error: 'Please choose an image smaller than 2 MB.' };
    }
    if (!user) return { error: 'You must be signed in to upload an avatar.' };

    const objectPath = `${user.id}/avatar`;
    const { error: uploadError } = await supabase.storage
      .from('profile-avatars')
      .upload(objectPath, file, { upsert: true, contentType: file.type, cacheControl: '3600' });

    if (uploadError) {
      return { error: 'Your avatar could not be uploaded.' };
    }

    const result = await updateProfile(profile?.display_name ?? 'Player', profile?.avatar_style ?? 'cobalt', objectPath);
    return result;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signInWithOtp, verifyOtp, updateProfile, uploadAvatar, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
