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

let _deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

const INSTALLED_DELAY_MS = 3000;

export interface PwaInstallProps {
  appName: string;
  swPath?: string;
  accentColor?: string;
  storageKey?: string;
  registerServiceWorker?: boolean;
}

export function PwaInstall({
  appName,
  swPath = "/sw.js",
  accentColor = "#7c9cff",
  storageKey,
  registerServiceWorker = true,
}: PwaInstallProps) {
  const dismissKey = storageKey ?? `make-pwa:install-dismissed:${appName}`;
  const isMobile = useIsMobile();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => _deferredPrompt,
  );
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (registerServiceWorker) registerSW(swPath);
  }, [registerServiceWorker, swPath]);

  useEffect(() => {
    if (!isMobile) { setShow(false); return; }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(dismissKey)) return;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);
    // On iOS we always show (no prompt event, share sheet is the only path).
    // On Android we only show once Chrome has fired beforeinstallprompt —
    // i.e. the SW is controlling and the app is installable. Until then,
    // showing confusing manual instructions is worse than showing nothing.
    if (ios || _deferredPrompt) setShow(true);
  }, [isMobile, dismissKey]);

  // Pick up the prompt if Chrome fires it after mount, and show the banner.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      setDeferredPrompt(_deferredPrompt);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    _deferredPrompt = null;
    if (outcome === "accepted") {
      localStorage.setItem(dismissKey, "1");
      setJustInstalled(true);
      timerRef.current = setTimeout(() => setShow(false), INSTALLED_DELAY_MS);
    }
  }, [deferredPrompt, dismissKey]);

  if (!show) return null;

  // Installed confirmation
  if (justInstalled) {
    return (
      <div style={styles.banner}>
        <div style={styles.content}>
          <span style={{ ...styles.icon, color: accentColor }}><CheckIcon /></span>
          <span style={styles.text}>Installed! Find {appName} on your home screen.</span>
        </div>
      </div>
    );
  }

  // iOS: can only use share sheet
  if (isIOS) {
    return (
      <div style={styles.banner}>
        <div style={styles.content}>
          <span style={{ ...styles.icon, color: accentColor }}><ShareIcon /></span>
          <div>
            <div style={styles.title}>Install {appName}</div>
            <div style={styles.hint}>Tap the share icon below, then "Add to Home Screen"</div>
          </div>
        </div>
      </div>
    );
  }

  // Android + prompt ready: one-tap install
  if (deferredPrompt) {
    return (
      <button style={{ ...styles.banner, ...styles.bannerBtn }} onClick={handleInstall}>
        <div style={styles.content}>
          <span style={{ ...styles.icon, color: accentColor }}><DownloadIcon /></span>
          <div>
            <div style={styles.title}>Install {appName}</div>
            <div style={styles.hint}>Tap to add to your home screen</div>
          </div>
        </div>
        <span style={{ ...styles.installBtn, background: accentColor }}>Install</span>
      </button>
    );
  }

  // Android but no prompt yet — show nothing. Chrome will fire
  // beforeinstallprompt on the next load once the SW is controlling.
  return null;
}

const styles: Record<string, CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 16px",
    paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
    background: "rgba(124, 156, 255, 0.12)",
    borderBottom: "1px solid rgba(124, 156, 255, 0.25)",
    flexShrink: 0,
    fontFamily: "system-ui, -apple-system, sans-serif",
    width: "100%",
    boxSizing: "border-box",
  },
  bannerBtn: {
    cursor: "pointer",
    border: "none",
    textAlign: "left",
    color: "inherit",
  },
  content: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  icon: { display: "flex", flexShrink: 0 },
  title: {
    fontSize: 14,
    fontWeight: 600,
    lineHeight: 1.3,
  },
  hint: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 1.4,
    marginTop: 2,
  },
  text: { fontSize: 14, lineHeight: 1.3 },
  installBtn: {
    flexShrink: 0,
    padding: "7px 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    whiteSpace: "nowrap",
  },
};

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
