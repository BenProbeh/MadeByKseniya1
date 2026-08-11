import Ils from "./Ils.jsx";

export default function OptionPicker({ label, options, value, onChange }) {
  return (
    <div>
      <p className="text-xs tracking-[0.2em] uppercase text-white/40 font-semibold mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={isActive}
              className={`pill-option ${isActive ? "pill-option-active" : ""}`}
            >
              {option.label}
              {option.priceModifier > 0 && (
                <span className={isActive ? "opacity-70" : "text-white/40"}>
                  {" "}
                  · +{option.priceModifier}
                  <Ils />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
