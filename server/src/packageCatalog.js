/**
 * Server-side source of truth for package bookings: stable keys, service kind and price (ILS).
 * Mirrors client/src/lib/packageData.js (a client test asserts both stay in sync).
 *
 * Kinds: "build" = full nail build, "fill" = refill of an existing build/gel, "design" = design-only extras.
 * Key format: "<package>:<option>" or "<package>:<option>:<size>".
 */
export const PACKAGE_CATALOG = Object.freeze({
  "basic-bitch": {
    title: "Basic Bitch",
    options: {
      fill: { name: "מילוי Basic Bitch", kind: "fill", sizes: { S: 150, M: 170, L: 190 } },
      plus: { name: "Basic Plus+", kind: "fill", sizes: { S: 160, M: 180, L: 200 } },
      extras: { name: "פרסונים", kind: "design", price: 111 },
    },
  },
  "bad-bitch": {
    title: "Bad Bitch",
    options: {
      fill: { name: "מילוי Bad Bitch", kind: "fill", sizes: { S: 220, M: 240, L: 260 } },
      build: { name: "בניות", kind: "build", sizes: { S: 250, M: 300, L: 340 } },
      extras: { name: "פרסונים", kind: "design", price: 222 },
    },
  },
  "stay-high": {
    title: "Stay High",
    options: {
      design: { name: "Stay High", kind: "design", price: 282 },
    },
  },
});

/** Resolve a package key to { key, label, kind, priceIls } or null when unknown. */
export function resolvePackageKey(raw) {
  const key = String(raw || "").trim();
  if (!/^[a-z-]{1,40}:[a-z]{1,20}(?::[SML])?$/.test(key)) return null;
  const [slug, optionId, size] = key.split(":");
  const pkg = PACKAGE_CATALOG[slug];
  const option = pkg?.options[optionId];
  if (!option) return null;
  if (option.sizes) {
    if (!size || option.sizes[size] == null) return null;
    return { key, label: `${option.name} · ${size}`, kind: option.kind, priceIls: option.sizes[size] };
  }
  if (size) return null;
  return { key, label: option.name, kind: option.kind, priceIls: option.price };
}

/** Highest catalog price, used to normalise the "high-value package" part of the customer score. */
export function catalogPriceRange() {
  const prices = [];
  for (const pkg of Object.values(PACKAGE_CATALOG)) {
    for (const option of Object.values(pkg.options)) {
      if (option.sizes) prices.push(...Object.values(option.sizes));
      else prices.push(option.price);
    }
  }
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
