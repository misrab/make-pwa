/**
 * Register the PWA service worker. Safe to call on every load (no-op when
 * already registered or unsupported). Required for the app to be installable.
 */
export function registerSW(path = "/sw.js"): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(path).catch(() => {});
}
