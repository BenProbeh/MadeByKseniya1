/**
 * Israeli New Sheqel series coin diameters.
 * Source: Bank of Israel — Agora and New Sheqel Series
 * https://boi.org.il/en/economic-roles/coins/
 */
export const CALIBRATION_COINS = [
  {
    id: "ils-10-agorot",
    labelHe: "10 אגורות",
    labelEn: "10 agorot",
    diameterMm: 22,
    source: "Bank of Israel",
  },
  {
    id: "ils-half-shekel",
    labelHe: "½ שקל",
    labelEn: "½ New Sheqel",
    diameterMm: 26,
    source: "Bank of Israel",
  },
  {
    id: "ils-1-shekel",
    labelHe: "1 שקל",
    labelEn: "1 New Sheqel",
    diameterMm: 18,
    source: "Bank of Israel",
  },
  {
    id: "ils-2-shekel",
    labelHe: "2 שקל",
    labelEn: "2 New Sheqel",
    diameterMm: 21.6,
    source: "Bank of Israel",
  },
  {
    id: "ils-5-shekel",
    labelHe: "5 שקל",
    labelEn: "5 New Sheqel",
    diameterMm: 24,
    source: "Bank of Israel",
  },
  {
    id: "ils-10-shekel",
    labelHe: "10 שקל",
    labelEn: "10 New Sheqel",
    diameterMm: 23,
    noteHe: "מטבע דו־מתכתי — משתמשים בקוטר החיצוני (הטבעת)",
    source: "Bank of Israel",
  },
];

export function findCoinById(id) {
  return CALIBRATION_COINS.find((c) => c.id === id) ?? null;
}
