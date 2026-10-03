import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { ADMIN_EMAIL, isAuthorizedAdmin } from '@/lib/adminAccess';

const AuthContext = createContext();

// Production-safe origin for auth redirects – avoids localhost:3000 leaking into
// OAuth/magic-link callbacks. Falls back to window.location.origin for local dev.
const SITE_ORIGIN =
  import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') || window.location.origin;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  /**
   * Server-side database verification of admin privileges
   * Checks the trusted `admin_users` table in Supabase.
   */
  const checkDatabaseAdminRole = useCallback(async (userId, userEmail) => {
    if (!userId) return false;
    
    // First, verify against database record in public.admin_users
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('role')
          .eq('id', userId)
          .maybeSingle();

        if (!error && data && (data.role === 'admin' || data.role === 'superadmin')) {
          return true;
        }
      } catch (err) {
        // Log safely without leaking database details
        console.warn('Admin role verification check completed with status:', err?.status || 'unverified');
      }
    }

    // Strict fallback: user email must strictly match official admin email
    if (userEmail && isAuthorizedAdmin(userEmail)) {
      return true;
    }

    return false;
  }, []);

  /**
   * Initializes authentication state from Supabase, falling back to Base44 if unconfigured
   */
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      setIsLoadingAuth(true);

      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session: currentSession }, error } = await supabase.auth.getSession();
          if (error) throw error;

          if (isMounted) {
            setSession(currentSession);
            if (currentSession?.user) {
              const u = currentSession.user;
              setUser(u);
              setIsAuthenticated(true);
              const isAdm = await checkDatabaseAdminRole(u.id, u.email);
              setIsAdmin(isAdm);
            } else {
              setUser(null);
              setIsAuthenticated(false);
              setIsAdmin(false);
            }
          }
        } catch (err) {
          console.warn('Session initialization warning:', err?.message || 'Guest browsing');
        } finally {
          if (isMounted) {
            setIsLoadingAuth(false);
            setAuthChecked(true);
          }
        }

        // Listen for live Supabase auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          if (!isMounted) return;
          setSession(newSession);
          if (newSession?.user) {
            const u = newSession.user;
            setUser(u);
            setIsAuthenticated(true);
            const isAdm = await checkDatabaseAdminRole(u.id, u.email);
            setIsAdmin(isAdm);

            // Handle redirect if returning from OAuth
            try {
              const pendingReturn = sessionStorage.getItem('sn_oauth_return_to');
              if (pendingReturn) {
                sessionStorage.removeItem('sn_oauth_return_to');
                if (isAdm) {
                  window.location.href = '/secure/nexuspanel-trust';
                } else {
                  window.location.href = pendingReturn;
                }
              }
            } catch {}
          } else {
            setUser(null);
            setIsAuthenticated(false);
            setIsAdmin(false);
          }
          setIsLoadingAuth(false);
          setAuthChecked(true);
        });

        return () => {
          subscription?.unsubscribe();
        };
      } else {
        // Fallback for environments where Supabase credentials are not yet configured
        try {
          if (appParams.token) {
            const currentUser = await base44.auth.me();
            if (isMounted) {
              setUser(currentUser);
              setIsAuthenticated(true);
              setIsAdmin(currentUser?.role === 'admin' || isAuthorizedAdmin(currentUser?.email));
            }
          }
        } catch (b44Err) {
          console.warn('Base44 auth fallback guest mode:', b44Err?.message);
        } finally {
          if (isMounted) {
            setIsLoadingAuth(false);
            setAuthChecked(true);
          }
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [checkDatabaseAdminRole]);

  /**
   * Log in using email and password via Supabase Auth
   */
  const login = async (email, password, options = {}) => {
    setAuthError(null);
    if (isSupabaseConfigured && supabase) {
      const signInPayload = {
        email: email.trim().toLowerCase(),
        password,
      };
      if (options?.captchaToken) {
        signInPayload.options = {
          captchaToken: options.captchaToken,
        };
      }
      const { data, error } = await supabase.auth.signInWithPassword(signInPayload);
      if (error) throw error;
      const isAdm = await checkDatabaseAdminRole(data.user?.id, data.user?.email);
      setIsAdmin(isAdm);
      return { ...data, isAdmin: isAdm };
    } else {
      const result = await base44.auth.loginViaEmailPassword(email.trim(), password);
      return result;
    }
  };


  /**
   * Register a new user via Supabase Auth
   */
  const register = async (email, password, metadata = {}, options = {}) => {
    setAuthError(null);
    if (isSupabaseConfigured && supabase) {
      const signUpOptions = {
        data: metadata,
      };
      if (options?.captchaToken) {
        signUpOptions.captchaToken = options.captchaToken;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: signUpOptions,
      });
      if (error) throw error;
      return data;
    } else {
      const result = await base44.auth.register({ email: email.trim(), password });
      return result;
    }
  };

  /**
   * Log out current user
   */
  const logout = async (shouldRedirect = false) => {
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      } else {
        base44.auth.logout();
      }
    } catch (err) {
      console.warn('Sign out warning:', err?.message);
    } finally {
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setIsAdmin(false);

      try {
        localStorage.removeItem('sn_cart_v1');
        localStorage.removeItem('sn_wishlist_v1');
      } catch (err) {
        console.warn('Could not clear local cart/wishlist:', err);
      }

      if (shouldRedirect) {
        window.location.href = '/';
      }
    }
  };

  /**
   * Send password reset email
   */
  const resetPassword = async (email, options = {}) => {
    if (isSupabaseConfigured && supabase) {
      const resetOptions = {
        redirectTo: `${SITE_ORIGIN}/reset-password`,
      };
      if (options?.captchaToken) {
        resetOptions.captchaToken = options.captchaToken;
      }
      const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), resetOptions);
      if (error) throw error;
      return data;
    } else {
      return base44.auth.requestPasswordReset({ email });
    }
  };

  /**
  /**
   * Sign in with Google via Supabase OAuth
   */
  const loginWithGoogle = async (returnTo = '/') => {
    setAuthError(null);
    if (isSupabaseConfigured && supabase) {
      try {
        sessionStorage.setItem('sn_oauth_return_to', returnTo || '/');
      } catch {}

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: SITE_ORIGIN,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
      return data;
    } else {
      throw new Error('Supabase anon key is missing. Please add VITE_SUPABASE_ANON_KEY to your .env file to enable Google authentication.');
    }
  };

  /**
   * Update user password
   */
  const updatePassword = async (newPassword) => {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return data;
    }
  };

  const navigateToLogin = (returnTo = window.location.pathname) => {
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAdmin,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false, // Never block public visitor browsing
      authError,
      authChecked,
      appPublicSettings,
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      updatePassword,
      navigateToLogin,
      checkDatabaseAdminRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
