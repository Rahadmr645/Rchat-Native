import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type AppColorPalette } from '../theme/colors';

const STORAGE_KEY = 'rchat_theme_preference_v1';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  resolved: 'light' | 'dark';
  colors: AppColorPalette;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(pref: ThemePreference, system: string | null | undefined): 'light' | 'dark' {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPrefState] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        setPrefState(raw);
      }
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPrefState(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const resolved = useMemo(() => resolveTheme(preference, systemScheme), [preference, systemScheme]);
  const colors = useMemo(() => (resolved === 'dark' ? darkColors : lightColors), [resolved]);

  const value = useMemo(
    () => ({ preference, setPreference, resolved, colors }),
    [preference, setPreference, resolved, colors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return ctx;
}
