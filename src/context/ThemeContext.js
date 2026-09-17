import React, { createContext, useState, useEffect, useContext, useMemo } from 'react';
import { useColorScheme, Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';

const THEME_STORAGE_KEY = '@app_theme_preference_v1';

export const LIGHT_COLORS = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E2E8F0',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  primary: '#007AFF',
  primaryLight: '#EFF6FF',
  primaryBorder: '#BFDBFE',
  inputBg: '#F8FAFC',
  inputBorder: '#CBD5E1',
  inputText: '#0F172A',
  border: '#E2E8F0',
  divider: '#F1F5F9',
  badgeBg: '#F1F5F9',
  badgeText: '#475569',
  success: '#10B981',
  successLight: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  statusBar: 'dark',
};

export const DARK_COLORS = {
  background: '#0B1120',
  surface: '#1E293B',
  card: '#1E293B',
  cardBorder: '#334155',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  primary: '#38BDF8',
  primaryLight: '#1E293B',
  primaryBorder: '#0284C7',
  inputBg: '#0F172A',
  inputBorder: '#334155',
  inputText: '#F8FAFC',
  border: '#334155',
  divider: '#1E293B',
  badgeBg: '#334155',
  badgeText: '#CBD5E1',
  success: '#34D399',
  successLight: '#064E3B',
  danger: '#F87171',
  dangerLight: '#7F1D1D',
  warning: '#FBBF24',
  warningLight: '#78350F',
  statusBar: 'light',
};

const ThemeContext = createContext({
  themeMode: 'system',
  isDark: false,
  colors: LIGHT_COLORS,
  setThemeMode: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeModeState] = useState('system'); // 'light' | 'dark' | 'system'
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme() || 'light');
  const dynamicColorScheme = useColorScheme();

  // Keep system scheme synced with device/browser appearance changes
  useEffect(() => {
    if (dynamicColorScheme) {
      setSystemScheme(dynamicColorScheme);
    }
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme || 'light');
    });
    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [dynamicColorScheme]);

  // Load saved theme preference on startup
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') {
          setThemeModeState(saved);
        }

        // Also check if logged in user has a cloud preference in profile
        const { data: { user } = {} } = await supabase.auth.getUser();
        if (user) {
          if (user.user_metadata?.theme_preference) {
            const pref = user.user_metadata.theme_preference;
            if (pref === 'light' || pref === 'dark' || pref === 'system') {
              setThemeModeState(pref);
              await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
              return;
            }
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.theme_preference) {
            const pref = profile.theme_preference;
            if (pref === 'light' || pref === 'dark' || pref === 'system') {
              setThemeModeState(pref);
              await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
            }
          }
        }
      } catch (err) {
        console.warn('[ThemeContext] Error loading theme preference:', err);
      }
    };

    loadTheme();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        try {
          const pref = session.user.user_metadata?.theme_preference;
          if (pref === 'light' || pref === 'dark' || pref === 'system') {
            setThemeModeState(pref);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
            return;
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', session.user.id)
            .maybeSingle();
          if (profile?.theme_preference) {
            const pPref = profile.theme_preference;
            if (pPref === 'light' || pPref === 'dark' || pPref === 'system') {
              setThemeModeState(pPref);
              await AsyncStorage.setItem(THEME_STORAGE_KEY, pPref);
            }
          }
        } catch (_) {}
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
    };
  }, []);

  const isDark = useMemo(() => {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return systemScheme === 'dark';
  }, [themeMode, systemScheme]);

  const colors = useMemo(() => {
    return isDark ? DARK_COLORS : LIGHT_COLORS;
  }, [isDark]);

  const setThemeMode = async (mode) => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return;
    setThemeModeState(mode);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);

      // Sync to Supabase auth metadata and profiles table if user logged in
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({
          data: { theme_preference: mode },
        }).catch(() => {});

        await supabase
          .from('profiles')
          .update({
            theme_preference: mode,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
          .catch(() => {});
      }
    } catch (err) {
      console.warn('[ThemeContext] Error saving theme preference:', err);
    }
  };

  const contextValue = useMemo(
    () => ({
      themeMode,
      isDark,
      colors,
      setThemeMode,
    }),
    [themeMode, isDark, colors]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
