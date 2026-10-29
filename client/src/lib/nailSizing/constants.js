import { FINGER_LABELS, FINGER_ORDER, HANDS as HAND_LIST } from "./summary.js";

export const HANDS = HAND_LIST.map((hand) => ({
  ...hand,
  fingers: FINGER_ORDER.map((id) => ({ id, labelHe: FINGER_LABELS[id] })),
}));

export const ALL_FINGERS = HANDS.flatMap((hand) =>
  hand.fingers.map((finger) => ({
    key: `${hand.id}-${finger.id}`,
    handId: hand.id,
    handLabelHe: hand.labelHe,
    fingerId: finger.id,
    fingerLabelHe: finger.labelHe,
  }))
);

export const findFinger = (key) => ALL_FINGERS.find((f) => f.key === key) || null;

export const SESSION_STORAGE_KEY = "mbk_nail_sizing_session_v2";
