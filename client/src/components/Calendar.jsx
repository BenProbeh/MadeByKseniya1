import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { he } from "date-fns/locale";

const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

export default function Calendar({ selectedDate, onSelectDate, isDateDisabled }) {
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(selectedDate || new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth));
    const end = endOfWeek(endOfMonth(visibleMonth));
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const today = startOfDay(new Date());

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
          className="w-11 h-11 shrink-0 rounded-full border border-white/10 hover:border-violet-400/50 flex items-center justify-center text-white/70"
          aria-label="חודש קודם"
        >
          ›
        </button>
        <p className="font-bold text-lg">{format(visibleMonth, "MMMM yyyy", { locale: he })}</p>
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => addMonths(m, 1))}
          className="w-11 h-11 shrink-0 rounded-full border border-white/10 hover:border-violet-400/50 flex items-center justify-center text-white/70"
          aria-label="חודש הבא"
        >
          ‹
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-white/40 mb-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, visibleMonth);
          const isPast = isBefore(day, today);
          const disabled = isPast || (isDateDisabled ? isDateDisabled(day) : false);
          const isSelected = selectedDate && isSameDay(day, selectedDate);

          return (
            <button
              type="button"
              key={day.toISOString()}
              disabled={disabled}
              onClick={() => onSelectDate(day)}
              className={`aspect-square rounded-lg text-sm flex items-center justify-center transition-all duration-150
                ${!inMonth ? "text-white/20" : "text-white/80"}
                ${disabled ? "opacity-30 cursor-not-allowed" : "hover:bg-violet-400/10 hover:text-violet-300 cursor-pointer"}
                ${isSelected ? "bg-violet-gradient text-oled-950 font-bold shadow-glow" : ""}
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
