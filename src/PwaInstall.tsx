import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
} from "react";
import { useIsMobile } from "./useIsMobile";
import { registerSW } from "./registerSW";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture the install prompt as early as possible — Chrome fires
// `beforeinstallprompt` once, often before React has mounted.
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

const INSTALLED_DELAY_MS = 3000;

export interface PwaInstallProps {
  /** App name shown in the banner copy. */
  appName: string;
  /** Path to the service worker. Default: "/sw.js". */
  swPath?: string;
  /** Accent color for the install button / icons. Default: "#7c9cff". */
  accentColor?: string;
  /** Override the localStorage dismissal key (useful for multiple PWAs on one origin). */
  storageKey?: string;
  /** Set false to skip registering the service worker (e.g. if you do it elsewhere). */
  registerServiceWorker?: boolean;
}

/**
 * Drop-in mobile install banner for a PWA. Registers the service worker, then
 * — on phones, when not already installed and not previously dismissed —
 * shows a banner. Android/desktop Chrome get a one-tap Install button;
 * iOS Safari gets "Add to Home Screen" instructions.
 */
export function PwaInstall({
  appName,
  swPath = "/sw.js",
  accentColor = "#7c9cff",
  storageKey,
  registerServiceWorker = true,
}: PwaInstallProps) {
  const dismissKey = storageKey ?? `make-pwa:install-dismissed:${appName}`;
  const isMobile = useIsMobile();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (registerServiceWorker) registerSW(swPath);
  }, [registerServiceWorker, swPath]);

  useEffect(() => {
    if (!isMobile) {
      setShowBanner(false);
      return;
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    if (localStorage.getItem(dismissKey)) return;

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    if (ios) {
      setShowBanner(true);
      return;
    }

    if (_deferredPrompt) {
      setDeferredPrompt(_deferredPrompt);
      setShowBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(_deferredPrompt);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isMobile, dismissKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      localStorage.setItem(dismissKey, "1");
      setJustInstalled(true);
      timerRef.current = setTimeout(() => setShowBanner(false), INSTALLED_DELAY_MS);
    }
  }, [deferredPrompt, dismissKey]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(dismissKey, "1");
    setShowBanner(false);
  }, [dismissKey]);

  if (!showBanner) return null;

  const message = justInstalled
    ? `Installed! Find ${appName} on your home screen.`
    : isIOS
      ? 'Tap the share button, then "Add to Home Screen"'
      : `Install ${appName} for the best experience`;

  const showInstallBtn = !justInstalled && !isIOS && !!deferredPrompt;

  return (
    <div style={styles.banner} role="region" aria-label={`Install ${appName}`}>
      <div style={styles.content}>
        <span style={{ ...styles.icon, color: accentColor }} aria-hidden>
          {justInstalled ? <CheckIcon /> : <DownloadIcon />}
        </span>
        <span style={styles.text}>{message}</span>
      </div>
      <div style={styles.actions}>
        {showInstallBtn && (
          <button
            style={{ ...styles.btn, background: accentColor }}
            onClick={handleInstall}
          >
            Install
          </button>
        )}
        {!justInstalled && (
          <button style={styles.close} onClick={handleDismiss} aria-label="Dismiss">
            <XIcon />
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 16px",
    paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
    background: "rgba(124, 156, 255, 0.12)",
    borderBottom: "1px solid rgba(124, 156, 255, 0.28)",
    flexShrink: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  content: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  icon: { display: "flex", flexShrink: 0 },
  text: { fontSize: 14, lineHeight: 1.3, color: "inherit" },
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
  btn: {
    padding: "6px 14px",
    fontSize: 14,
    fontWeight: 500,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: 36,
  },
  close: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    background: "none",
    border: "none",
    color: "inherit",
    opacity: 0.6,
    cursor: "pointer",
    borderRadius: 4,
  },
};

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
