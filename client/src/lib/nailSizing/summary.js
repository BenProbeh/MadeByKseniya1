/** Display helpers for saved measurements (profile, staff customer card). */

export const FINGER_ORDER = ["thumb", "index", "middle", "ring", "pinky"];

export const FINGER_LABELS = Object.freeze({
  thumb: "אגודל",
  index: "אצבע מורה",
  middle: "אמה",
  ring: "קמיצה",
  pinky: "זרת",
});

/** Short labels for tight grids. */
export const FINGER_SHORT = Object.freeze({
  thumb: "אגודל",
  index: "מורה",
  middle: "אמה",
  ring: "קמיצה",
  pinky: "זרת",
});

export const HANDS = Object.freeze([
  { id: "right", labelHe: "יד ימין" },
  { id: "left", labelHe: "יד שמאל" },
]);

/** Flattens the API's { hands: { right: { fingers } } } into ordered rows. */
export function measuredFingers(measurement) {
  const rows = [];
  for (const hand of HANDS) {
    const fingers = measurement?.hands?.[hand.id]?.fingers || [];
    for (const id of FINGER_ORDER) {
      const f = fingers.find((x) => x.fingerId === id);
      if (!f) continue;
      rows.push({
        hand: hand.id,
        fingerId: id,
        labelHe: FINGER_LABELS[id],
        shortHe: FINGER_SHORT[id],
        size: f.size ?? null,
        widthMm: f.widthMm ?? null,
        photoQualityScore: f.photoQualityScore ?? null,
      });
    }
  }
  return rows;
}
