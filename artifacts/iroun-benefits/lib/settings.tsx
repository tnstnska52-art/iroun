import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'iroun.largeText.v1';
type Ctx = { largeText: boolean; scale: number; setLargeText: (v: boolean) => void };
const SettingsContext = createContext<Ctx>({ largeText: false, scale: 1, setLargeText: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [largeText, setLarge] = useState<boolean>(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setLarge(v === '1')).catch(() => {});
  }, []);
  const setLargeText = useCallback((v: boolean) => {
    setLarge(v);
    AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
  }, []);
  const value = useMemo(() => ({ largeText, scale: largeText ? 1.25 : 1, setLargeText }), [largeText, setLargeText]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
export const useSettings = () => useContext(SettingsContext);
