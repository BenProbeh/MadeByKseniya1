import { PACKAGE_DETAILS } from "./packageData.js";

const ORDER = [
  { slug: "basic-bitch", tagline: "מתוקתק ומהיר" },
  { slug: "bad-bitch", tagline: "הכי פופולרי", featured: true },
  { slug: "stay-high", tagline: "עיצובים מיוחדים" },
];

function lowestPrice(pkg) {
  // Treatments with sizes are the main offer; add-ons (press-ons) only count when nothing else is listed.
  const options = pkg?.options || [];
  const sized = options.filter((o) => o.sizes);
  const prices = (sized.length ? sized : options).flatMap((o) => (o.sizes ? o.sizes.map((s) => s.price) : [o.price]));
  const valid = prices.filter((p) => Number.isFinite(p) && p > 0);
  return valid.length ? Math.min(...valid) : null;
}

/** The three packages with a short tagline and their starting price, from the same data as the detail pages. */
export const PACKAGES = ORDER.filter((p) => PACKAGE_DETAILS[p.slug]).map((p) => ({
  ...p,
  title: PACKAGE_DETAILS[p.slug].title,
  fromPrice: lowestPrice(PACKAGE_DETAILS[p.slug]),
}));
