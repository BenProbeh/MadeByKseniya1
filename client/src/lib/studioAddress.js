/** Studio location — used for Waze deep links and post-booking directions. */
export const STUDIO_ADDRESS = {
  street: "העמדות",
  number: "4",
  city: "בת ים",
  floor: "2",
  apartment: "12",
  // Approximate map pin for העמדות 4, בת ים (for Waze navigate deep-link)
  lat: 32.0349013,
  lng: 34.7446275,
};

export const STUDIO_ADDRESS_LINE_1 = `${STUDIO_ADDRESS.street} ${STUDIO_ADDRESS.number}, ${STUDIO_ADDRESS.city}.`;
export const STUDIO_ADDRESS_LINE_2 = `קומה ${STUDIO_ADDRESS.floor}, דירה ${STUDIO_ADDRESS.apartment}.`;

const WAZE_QUERY = `${STUDIO_ADDRESS.street} ${STUDIO_ADDRESS.number}, ${STUDIO_ADDRESS.city}`;

/** Native app scheme — starts turn-by-turn navigation immediately when Waze is installed. */
export const STUDIO_WAZE_APP_URL = `waze://?ll=${STUDIO_ADDRESS.lat},${STUDIO_ADDRESS.lng}&navigate=yes&q=${encodeURIComponent(WAZE_QUERY)}`;

/** Universal / web link — opens Waze (app or web) with navigation to the studio. */
export const STUDIO_WAZE_URL = `https://www.waze.com/ul?ll=${STUDIO_ADDRESS.lat},${STUDIO_ADDRESS.lng}&navigate=yes&q=${encodeURIComponent(WAZE_QUERY)}`;

/** Prefer the native deep link on phones; fall back to the universal link. */
export function openStudioInWaze() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  if (!isMobile) {
    window.open(STUDIO_WAZE_URL, "_blank", "noopener,noreferrer");
    return;
  }

  const started = Date.now();
  window.location.href = STUDIO_WAZE_APP_URL;

  // If the app didn't take over, fall back to the https universal link.
  window.setTimeout(() => {
    if (Date.now() - started < 1600 && !document.hidden) {
      window.location.href = STUDIO_WAZE_URL;
    }
  }, 900);
}
