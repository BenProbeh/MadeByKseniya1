/** Official Waze app icon for the post-booking directions CTA. */
export default function WazeIcon({ className = "w-14 h-14" }) {
  return (
    <img
      src="/waze.jpg"
      alt="Waze"
      className={`rounded-2xl object-contain ${className}`.trim()}
      draggable="false"
    />
  );
}
