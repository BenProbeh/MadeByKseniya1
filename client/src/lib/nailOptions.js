export const BASE_PRICE_ILS = 120;

export const SHAPES = [
  { id: "almond", label: "שקד", priceModifier: 0 },
  { id: "square", label: "מרובע", priceModifier: 0 },
  { id: "round", label: "עגול", priceModifier: 0 },
  { id: "coffin", label: "בלרינה", priceModifier: 10 },
  { id: "stiletto", label: "סטילטו", priceModifier: 15 },
];

export const FINISHES = [
  { id: "glossy", label: "מבריק", priceModifier: 0 },
  { id: "matte", label: "מט", priceModifier: 0 },
  { id: "chrome", label: "כרום", priceModifier: 20 },
  { id: "glitter", label: "גליטר", priceModifier: 15 },
];

export const LENGTHS = [
  { id: "short", label: "קצר", priceModifier: 0 },
  { id: "medium", label: "בינוני", priceModifier: 10 },
  { id: "long", label: "ארוך", priceModifier: 25 },
];

// `image` points at a real photo in client/public/shades/ (see client/public/shades/README.md).
// When the file isn't there yet, the UI falls back to a drawn preview automatically.
export const COLOURS = [
  { id: "powder-pink", label: "ורוד פודרה", tag: "גימור משי", hex: "#e8b4c8", priceModifier: 0, image: "/shades/powder-pink.jpg" },
  { id: "wine-red", label: "יין אדום", tag: "ברק עמוק", hex: "#7a1f2b", priceModifier: 0, image: "/shades/wine-red.jpg" },
  { id: "milky-ivory", label: "שנהב חלבי", tag: "מראה נקי", hex: "#f2e8dc", priceModifier: 0, image: "/shades/milky-ivory.jpg" },
  { id: "creamy-latte", label: "לאטה קרמי", tag: "קלאסיקה חמה", hex: "#c9a37c", priceModifier: 0, image: "/shades/creamy-latte.jpg" },
  { id: "mirror-chrome", label: "כרום מראה", tag: "אפקט מתכתי", hex: "#c7cdd1", priceModifier: 5, image: "/shades/mirror-chrome.jpg" },
  { id: "piano-black", label: "שחור פסנתר", tag: "דרמה מוחלטת", hex: "#14120f", priceModifier: 0, image: "/shades/piano-black.jpg" },
];

export function findById(list, id) {
  return list.find((item) => item.id === id) ?? list[0];
}

export function computePrice({ shapeId, finishId, lengthId, colourId }) {
  const shape = findById(SHAPES, shapeId);
  const finish = findById(FINISHES, finishId);
  const length = findById(LENGTHS, lengthId);
  const colour = findById(COLOURS, colourId);

  return (
    BASE_PRICE_ILS +
    shape.priceModifier +
    finish.priceModifier +
    length.priceModifier +
    colour.priceModifier
  );
}

export function buildSetSummary({ shapeId, finishId, lengthId, colourId }) {
  const shape = findById(SHAPES, shapeId);
  const finish = findById(FINISHES, finishId);
  const length = findById(LENGTHS, lengthId);
  const colour = findById(COLOURS, colourId);
  const price = computePrice({ shapeId, finishId, lengthId, colourId });

  return `סט מעוצב: ${shape.label} · ${colour.label} · גימור ${finish.label} · אורך ${length.label} (${price}₪)`;
}
