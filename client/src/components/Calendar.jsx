import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Month grid for picking a later date (lives in a sheet on phones). 44px day targets. */
export default function Calendar({ selectedDate, onSelectDate, isDateDisabled }) {
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(selectedDate || new Date()));
  const today = startOfDay(new Date());

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth));
    const end = endOfWeek(endOfMonth(visibleMonth));
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  const atCurrentMonth = isSameMonth(visibleMonth, today);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setVisibleMonth((m) => subMonths(m, 1))}
          disabled={atCurrentMonth}
          className="icon-btn disabled:opacity-25"
          aria-label="חודש קודם"
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
        <p className="t-headline" aria-live="polite">
          {format(visibleMonth, "MMMM yyyy", { locale: he })}
        </p>
        <button type="button" onClick={() => setVisibleMonth((m) => addMonths(m, 1))} className="icon-btn" aria-label="חודש הבא">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-cap text-white/40 mb-1" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, visibleMonth);
          const disabled = !inMonth || isBefore(day, today) || (isDateDisabled ? isDateDisabled(day) : false);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, today);
          return (
            <button
              type="button"
              key={day.toISOString()}
              disabled={disabled}
              onClick={() => onSelectDate(day)}
              aria-pressed={Boolean(selected)}
              aria-label={format(day, "EEEE, d בMMMM", { locale: he })}
              className={`mx-auto w-11 h-11 rounded-full text-body tnum flex items-center justify-center transition-colors ${
                !inMonth ? "invisible" : ""
              } ${disabled ? "text-white/20" : "text-white/85 active:bg-white/10"} ${
                selected ? "bg-violet-400 font-bold" : isToday ? "ring-1 ring-violet-300/60" : ""
              }`}
              style={selected ? { color: "#fff" } : undefined}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
