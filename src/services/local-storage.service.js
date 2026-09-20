const KEY = 'calpulli:v1:preferences';
export function getPreferences() { try { return { theme: 'light', ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { theme: 'light' }; } }
export function savePreferences(update) { const next = { ...getPreferences(), ...update }; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* no persistencia */ } return next; }
