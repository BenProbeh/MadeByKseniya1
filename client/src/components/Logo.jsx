/**
 * Header logo — the client-supplied starburst sticker artwork (client/logo.jpeg),
 * background-removed (flood-filled to transparent PNG) so it sits directly on the
 * dark nav. A soft violet drop-shadow ties it into the site's neon glow language
 * without altering the artwork itself.
 */
export default function Logo({ className = "h-14 w-auto" }) {
  return (
    <img
      src="/logo.png"
      alt="MadeByKseniya"
      className={`${className} drop-shadow-[0_0_10px_rgba(176,38,255,0.65)]`}
    />
  );
}
