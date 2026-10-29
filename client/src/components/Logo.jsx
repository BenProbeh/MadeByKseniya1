/**
 * The MadeByKseniya sticker logo, generated from the client's artwork (client/logo.jpeg) by
 * client/scripts/build-logo.py: transparent background, crisp edge, violet halftone.
 */
export default function Logo({ className = "h-14 w-auto", alt = "MadeByKseniya" }) {
  return <img src="/logo.png" alt={alt} width={720} height={474} className={`${className} object-contain select-none`} draggable={false} />;
}
