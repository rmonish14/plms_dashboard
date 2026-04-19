// ─────────────────────────────────────────────────────────────────────────────
// Central backend URL — all components must import from here.
// Set VITE_API_URL in your Render / Netlify environment variables for production.
// Dev default falls back to localhost:5000.
// ─────────────────────────────────────────────────────────────────────────────
const envUrl = import.meta.env.VITE_API_URL as string | undefined;
export const API_URL: string = envUrl || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
