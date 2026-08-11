// Preview-only fallback data, used when the real backend isn't reachable
// (e.g. a UI-only Vercel deploy with no server/DB attached yet). Mirrors the
// seed catalog in server/src/db.js so the demo looks like the real thing.

export const MOCK_SERVICES = [
  {
    id: 1,
    name_he: "מניקור ג'ל",
    description_he: "ציפוי ג'ל עמיד לציפורניים טבעיות, כולל טיפוח קוטיקולה וגימור מבריק.",
    price_ils: 120,
    duration_min: 60,
    category: "מניקור",
  },
  {
    id: 2,
    name_he: "בניה בתבנית (בניוגל)",
    description_he: "הארכת ציפורניים בתבנית עם ג'ל בניה, אורך וצורה לבחירה.",
    price_ils: 180,
    duration_min: 90,
    category: "בניה",
  },
  {
    id: 3,
    name_he: "בניה בטיפס",
    description_he: "הארכת ציפורניים בטיפס קפסולה עם ציפוי ג'ל, תוצאה טבעית וחזקה.",
    price_ils: 190,
    duration_min: 90,
    category: "בניה",
  },
  {
    id: 4,
    name_he: "מילוי בניה",
    description_he: "מילוי חודשי לציפורניים בנויות, כולל תיקון וחיזוק.",
    price_ils: 150,
    duration_min: 75,
    category: "בניה",
  },
  {
    id: 5,
    name_he: "פדיקור ספא",
    description_he: "טיפול פדיקור מלא עם פילינג, עיסוי ולק ג'ל.",
    price_ils: 160,
    duration_min: 60,
    category: "פדיקור",
  },
  {
    id: 6,
    name_he: "עיצובי אקססוריז וציפורני יוקרה",
    description_he: "עיצוב אמנותי, חרסינה, אבנים ופרטים מיוחדים לפי בקשה.",
    price_ils: 60,
    duration_min: 30,
    category: "עיצוב",
  },
  {
    id: 7,
    name_he: "לק ג'ל בלבד",
    description_he: "החלפת לק ג'ל על ציפורניים טבעיות או בנויות קיימות.",
    price_ils: 90,
    duration_min: 45,
    category: "מניקור",
  },
  {
    id: 8,
    name_he: "הסרת בניה מקצועית",
    description_he: "פירוק והסרה עדינה של בניה קיימת ללא פגיעה בציפורן הטבעית.",
    price_ils: 50,
    duration_min: 30,
    category: "טיפוח",
  },
];

const MOCK_SLOT_TIMES = ["09:30", "10:00", "11:30", "13:00", "14:30", "16:00", "17:30"];

export function mockAvailability(dateStr) {
  return { open: true, slots: MOCK_SLOT_TIMES };
}

let mockNextId = 9001;

export function mockCreateAppointment(payload) {
  return {
    id: mockNextId++,
    status: "confirmed",
    ...payload,
  };
}

export function mockUpdateAppointment(id, payload) {
  return { id, status: "confirmed", ...payload };
}
