export const HANDS = [
  {
    id: "right",
    labelHe: "יד ימין",
    fingers: [
      { id: "thumb", labelHe: "אגודל" },
      { id: "index", labelHe: "אצבע" },
      { id: "middle", labelHe: "אמה" },
      { id: "ring", labelHe: "קמיצה" },
      { id: "pinky", labelHe: "זרת" },
    ],
  },
  {
    id: "left",
    labelHe: "יד שמאל",
    fingers: [
      { id: "thumb", labelHe: "אגודל" },
      { id: "index", labelHe: "אצבע" },
      { id: "middle", labelHe: "אמה" },
      { id: "ring", labelHe: "קמיצה" },
      { id: "pinky", labelHe: "זרת" },
    ],
  },
];

export const ALL_FINGERS = HANDS.flatMap((hand) =>
  hand.fingers.map((finger) => ({
    key: `${hand.id}-${finger.id}`,
    handId: hand.id,
    handLabelHe: hand.labelHe,
    fingerId: finger.id,
    fingerLabelHe: finger.labelHe,
  }))
);

export const WIZARD_STEPS = [
  { id: "prep", labelHe: "הכנה" },
  { id: "coin", labelHe: "בחירת מטבע" },
  { id: "camera", labelHe: "בדיקת מצלמה" },
  { id: "guide", labelHe: "הדרכה" },
  { id: "fingers", labelHe: "בחירת אצבעות" },
  { id: "measure", labelHe: "מדידה" },
  { id: "summary", labelHe: "סיום" },
];

export const SESSION_STORAGE_KEY = "mbk_nail_sizing_session_v1";
export const PROFILE_STORAGE_KEY = "mbk_nail_sizing_profiles_v1";
export const GUIDE_SEEN_KEY = "mbk_nail_sizing_guide_seen";
