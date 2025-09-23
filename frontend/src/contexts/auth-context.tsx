'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/stores/ui-store';

export interface UserProfile {
  id: string;
  username?: string;
  avatar_url?: string;
  full_name?: string;
  bio?: string;
  preferences?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { addNotification } = useUIStore();

  // Fetch user profile
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('Error in fetchProfile:', error);
      return null;
    }
  };

  // Create user profile if it doesn't exist
  const createProfile = async (userId: string, username?: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          username,
          preferences: {},
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('Error in createProfile:', error);
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setSession(session);
          setUser(session.user);

          // Fetch or create profile in background (don't block loading)
          (async () => {
            try {
              let profile = await fetchProfile(session.user.id);
              if (!profile) {
                profile = await createProfile(session.user.id);
              }
              setProfile(profile);
            } catch (e) {
              console.error('Error loading profile:', e);
            }
          })();
        } else {
          // Ensure state is cleared when no session
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);

      // Handle server-created sessions (OAuth callback) promptly
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
          // Load profile in background
          (async () => {
            try {
              let profile = await fetchProfile(session.user.id);
              if (!profile) {
                profile = await createProfile(session.user.id);
              }
              setProfile(profile);
            } catch (e) {
              console.error('Error loading profile:', e);
            }
          })();
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      setSession(session ?? null);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Fetch or create profile on sign in (non-blocking)
        (async () => {
          try {
            let profile = await fetchProfile(session.user.id);
            if (!profile) {
              profile = await createProfile(session.user.id);
            }
            setProfile(profile);
          } catch (e) {
            console.error('Error loading profile:', e);
          }
        })();
      } else {
        setProfile(null);
      }

      // Ensure loading state is cleared after any auth change
      setLoading(false);

      if (event === 'SIGNED_OUT') {
        router.push('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      addNotification({
        title: 'Welcome back!',
        description: 'Successfully signed in',
        type: 'success',
      });

      router.push('/dashboard');
    } catch (error: any) {
      addNotification({
        title: 'Sign in failed',
        description: error.message || 'Please check your credentials and try again',
        type: 'error',
      });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, username?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
          },
        },
      });

      if (error) throw error;

      if (data.user && !data.session) {
        addNotification({
          title: 'Check your email',
          description: 'We sent you a confirmation link to complete sign up',
          type: 'info',
        });
      } else if (data.session) {
        // Auto-confirmed, create profile
        if (data.user) {
          await createProfile(data.user.id, username);
        }

        addNotification({
          title: 'Account created!',
          description: 'Welcome to Onsembl.ai',
          type: 'success',
        });

        router.push('/dashboard');
      }
    } catch (error: any) {
      addNotification({
        title: 'Sign up failed',
        description: error.message || 'Please try again with a different email',
        type: 'error',
      });
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    try {
      const next = (() => {
        if (typeof window === 'undefined') return '/dashboard';
        const params = new URLSearchParams(window.location.search);
        const preferred = params.get('next') || window.location.pathname;
        if (!preferred || preferred === '/' || preferred.startsWith('/auth/')) {
          return '/dashboard';
        }
        return preferred;
      })();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) throw error;

      addNotification({
        title: 'Redirecting...',
        description: 'Authenticating with Google',
        type: 'info',
      });
    } catch (error: any) {
      addNotification({
        title: 'Authentication failed',
        description: error.message || 'Failed to authenticate with Google',
        type: 'error',
      });
      throw error;
    }
  };

  const signInWithGithub = async () => {
    try {
      const next = (() => {
        if (typeof window === 'undefined') return '/dashboard';
        const params = new URLSearchParams(window.location.search);
        const preferred = params.get('next') || window.location.pathname;
        if (!preferred || preferred === '/' || preferred.startsWith('/auth/')) {
          return '/dashboard';
        }
        return preferred;
      })();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) throw error;

      addNotification({
        title: 'Redirecting...',
        description: 'Authenticating with GitHub',
        type: 'info',
      });
    } catch (error: any) {
      addNotification({
        title: 'Authentication failed',
        description: error.message || 'Failed to authenticate with GitHub',
        type: 'error',
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      addNotification({
        title: 'Signed out',
        description: 'You have been signed out successfully',
        type: 'success',
      });

      router.push('/');
    } catch (error: any) {
      addNotification({
        title: 'Sign out failed',
        description: error.message || 'Failed to sign out',
        type: 'error',
      });
      throw error;
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user || !profile) {
      throw new Error('No authenticated user');
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      setProfile(data as UserProfile);

      addNotification({
        title: 'Profile updated',
        description: 'Your profile has been updated successfully',
        type: 'success',
      });
    } catch (error: any) {
      addNotification({
        title: 'Update failed',
        description: error.message || 'Failed to update profile',
        type: 'error',
      });
      throw error;
    }
  };

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;

      if (data.session) {
        setSession(data.session);
        setUser(data.session.user);
      }
    } catch (error: any) {
      console.error('Failed to refresh session:', error);
      throw error;
    }
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithGithub,
    signOut,
    updateProfile,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
