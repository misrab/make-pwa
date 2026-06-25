import { useEffect, useState } from "react";

// Phone-sized AND a touch (coarse) pointer — so a narrow desktop window with a
// mouse is never mistaken for mobile.
const MOBILE_QUERY = "(max-width: 768px) and (pointer: coarse)";

/** True when the device is an actual phone. Reactive to resize/rotation. */
export function useIsMobile(query: string = MOBILE_QUERY): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return isMobile;
}
