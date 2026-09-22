import { useState } from "react";

/** Coin artwork with graceful text fallback if the asset fails to load. */
export default function CoinImage({ coin, className = "h-16 w-16 md:h-20 md:w-20 object-contain shrink-0" }) {
  const [failed, setFailed] = useState(false);

  if (!coin?.imageSrc || failed) {
    return (
      <span
        className={`${className} flex items-center justify-center rounded-full border border-white/20 bg-white/5 text-[11px] text-white/70 text-center leading-tight px-1`}
        aria-hidden="true"
      >
        {coin?.labelHe || "מטבע"}
      </span>
    );
  }

  return (
    <img
      src={coin.imageSrc}
      alt={coin.imageAlt || coin.labelHe || "מטבע"}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
