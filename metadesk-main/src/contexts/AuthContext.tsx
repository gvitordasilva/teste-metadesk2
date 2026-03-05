import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'atendente';

export interface AttendantProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  working_hours: { start: string; end: string };
  status: 'online' | 'offline' | 'busy' | 'break';
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  tenantId: string | null;
  profile: AttendantProfile | null;
  loading: boolean;
  showStatusPrompt: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<AttendantProfile>) => Promise<{ error: Error | null }>;
  updateStatus: (status: AttendantProfile['status']) => Promise<void>;
  dismissStatusPrompt: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AttendantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusPrompt, setShowStatusPrompt] = useState(false);

  // Fetch user role from database
  const fetchUserRole = async (userId: string): Promise<{ role: AppRole | null; tenantId: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        return { role: null, tenantId: null };
      }

      return { role: (data?.role as AppRole) || null, tenantId: data?.tenant_id || null };
    } catch (error) {
      console.error('Error fetching user role:', error);
      return { role: null, tenantId: null };
    }
  };

  // Fetch attendant profile
  const fetchProfile = async (userId: string): Promise<AttendantProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('attendant_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as unknown as AttendantProfile || null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    let initialLoadDone = false;

    const loadUserData = async (userId: string) => {
      try {
        const [userRoleData, userProfile] = await Promise.all([
          fetchUserRole(userId),
          fetchProfile(userId)
        ]);
        setRole(userRoleData.role);
        setTenantId(userRoleData.tenantId);
        setProfile(userProfile);
        
        // Show status prompt only for attendants who are offline
        if (userRoleData.role === 'atendente' && userProfile && userProfile.status === 'offline') {
          setShowStatusPrompt(true);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        // Still set loading to false even on error
      } finally {
        setLoading(false);
      }
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          // Only load data if initial load hasn't happened yet, or on sign-in/token-refresh
          if (!initialLoadDone || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            initialLoadDone = true;
            // Defer to avoid blocking
            setTimeout(() => {
              loadUserData(currentSession.user.id);
            }, 0);
          }
        } else {
        setRole(null);
        setTenantId(null);
        setProfile(null);
        setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        setSession(existingSession);
        setUser(existingSession.user);
        
        if (!initialLoadDone) {
          initialLoadDone = true;
          loadUserData(existingSession.user.id);
        }
      } else {
        setLoading(false);
      }
    }).catch((error) => {
      console.error('Error getting session:', error);
      setLoading(false);
    });

    // Safety timeout - never stay loading forever
    const safetyTimeout = setTimeout(() => {
      setLoading((current) => {
        if (current) {
          console.warn('Auth loading safety timeout triggered');
          return false;
        }
        return current;
      });
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    // Set status to offline before signing out
    if (user) {
      await supabase
        .from('attendant_profiles')
        .update({ status: 'offline' })
        .eq('user_id', user.id);
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setTenantId(null);
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<AttendantProfile>) => {
    if (!user) {
      return { error: new Error('Usuário não autenticado') };
    }

    try {
      const { error } = await supabase
        .from('attendant_profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) {
        return { error };
      }

      // Refresh profile
      const updatedProfile = await fetchProfile(user.id);
      setProfile(updatedProfile);

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const updateStatus = async (status: AttendantProfile['status']) => {
    if (!user) return;

    try {
      if (profile) {
        // Profile exists, just update
        await supabase
          .from('attendant_profiles')
          .update({ status })
          .eq('user_id', user.id);

        setProfile(prev => prev ? { ...prev, status } : null);
      } else {
        // No profile yet — create one (upsert)
        const { data, error } = await supabase
          .from('attendant_profiles')
          .upsert({
            user_id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário',
            status,
          }, { onConflict: 'user_id' })
          .select()
          .single();

        if (!error && data) {
          setProfile(data as unknown as AttendantProfile);
        } else {
          console.error('Error creating attendant profile:', error);
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const dismissStatusPrompt = () => setShowStatusPrompt(false);

  const value = {
    user,
    session,
    role,
    tenantId,
    profile,
    loading,
    showStatusPrompt,
    signIn,
    signOut,
    updateProfile,
    updateStatus,
    dismissStatusPrompt,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
