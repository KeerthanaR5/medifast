import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'mf_location_state_v1';

const defaultState = {
  lat: '',
  lon: '',
  accuracy: null,
  source: null, // 'gps' | 'manual'
};

const LocationContext = createContext({
  ...defaultState,
  geoSupported: false,
  setLocation: () => {},
  getHighAccuracy: async () => {},
  fetchAreaSuggestions: async () => [],
  selectArea: () => {},
});

export function LocationProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
    } catch {
      return defaultState;
    }
  });

  const geoSupported = typeof window !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const setLocation = useCallback((next) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const getHighAccuracy = useCallback(async (opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }) => {
    if (!geoSupported) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          const upd = {
            lat: Number(latitude.toFixed(6)),
            lon: Number(longitude.toFixed(6)),
            accuracy: typeof accuracy === 'number' ? accuracy : null,
            source: 'gps',
          };
          setState((prev) => ({ ...prev, ...upd }));
          resolve(upd);
        },
        (err) => {
          console.error('[MediFast GPS] Location request failed:', {
            code: err.code,
            message: err.message
          });
          resolve(null);
        },
        opts
      );
    });
  }, [geoSupported]);

  const fetchAreaSuggestions = useCallback(async (q) => {
    if (!q || q.trim().length < 3) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q.trim() + ', Bengaluru, Karnataka')}&countrycodes=in&limit=5`;
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await resp.json();
      const items = Array.isArray(data)
        ? data.slice(0, 5).map((d) => ({ label: d.display_name, lat: Number(d.lat), lon: Number(d.lon) }))
        : [];
      return items;
    } catch {
      return [];
    }
  }, []);

  const selectArea = useCallback((sugg) => {
    setState((prev) => ({
      ...prev,
      lat: Number(sugg.lat.toFixed(6)),
      lon: Number(sugg.lon.toFixed(6)),
      accuracy: null,
      source: 'manual',
    }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      geoSupported,
      setLocation,
      getHighAccuracy,
      fetchAreaSuggestions,
      selectArea,
    }),
    [state, geoSupported, setLocation, getHighAccuracy, fetchAreaSuggestions, selectArea]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext() {
  return useContext(LocationContext);
}
