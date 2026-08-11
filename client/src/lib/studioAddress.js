/** Studio location — used for Waze deep links and post-booking directions. */
export const STUDIO_ADDRESS = {
  street: "העמדות",
  number: "4",
  city: "בת ים",
  floor: "2",
  apartment: "12",
};

export const STUDIO_ADDRESS_LINE_1 = `${STUDIO_ADDRESS.street} ${STUDIO_ADDRESS.number}, ${STUDIO_ADDRESS.city}.`;
export const STUDIO_ADDRESS_LINE_2 = `קומה ${STUDIO_ADDRESS.floor}, דירה ${STUDIO_ADDRESS.apartment}.`;

export const STUDIO_WAZE_URL = `https://waze.com/ul?q=${encodeURIComponent(
  `${STUDIO_ADDRESS.street} ${STUDIO_ADDRESS.number}, ${STUDIO_ADDRESS.city}`
)}&navigate=yes`;
