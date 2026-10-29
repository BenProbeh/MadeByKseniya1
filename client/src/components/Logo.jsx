/**
 * The MadeByKseniya sticker logo, generated from the client's artwork (client/logo.jpeg) by
 * client/scripts/build-logo.py: transparent background, crisp edge, violet halftone.
 */
export default function Logo({ className = "h-14 w-auto", alt = "MadeByKseniya" }) {
  return <img src="/logo.png" alt={alt} width={720} height={474} className={`${className} object-contain select-none drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]`} draggable={false} />;
}
