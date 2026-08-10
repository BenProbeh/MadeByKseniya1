import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, "..", "salon.db"));

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_he TEXT NOT NULL,
    description_he TEXT NOT NULL,
    price_ils INTEGER NOT NULL,
    duration_min INTEGER NOT NULL,
    category TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    service_id INTEGER NOT NULL REFERENCES services(id),
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const seedCount = db.prepare("SELECT COUNT(*) AS c FROM services").get().c;

if (seedCount === 0) {
  const insert = db.prepare(`
    INSERT INTO services (name_he, description_he, price_ils, duration_min, category)
    VALUES (@name_he, @description_he, @price_ils, @duration_min, @category)
  `);

  const services = [
    {
      name_he: "מניקור ג'ל",
      description_he: "ציפוי ג'ל עמיד לציפורניים טבעיות, כולל טיפוח קוטיקולה וגימור מבריק.",
      price_ils: 120,
      duration_min: 60,
      category: "מניקור",
    },
    {
      name_he: "בניה בתבנית (בניוגל)",
      description_he: "הארכת ציפורניים בתבנית עם ג'ל בניה, אורך וצורה לבחירה.",
      price_ils: 180,
      duration_min: 90,
      category: "בניה",
    },
    {
      name_he: "בניה בטיפס",
      description_he: "הארכת ציפורניים בטיפס קפסולה עם ציפוי ג'ל, תוצאה טבעית וחזקה.",
      price_ils: 190,
      duration_min: 90,
      category: "בניה",
    },
    {
      name_he: "מילוי בניה",
      description_he: "מילוי חודשי לציפורניים בנויות, כולל תיקון וחיזוק.",
      price_ils: 150,
      duration_min: 75,
      category: "בניה",
    },
    {
      name_he: "פדיקור ספא",
      description_he: "טיפול פדיקור מלא עם פילינג, עיסוי ולק ג'ל.",
      price_ils: 160,
      duration_min: 60,
      category: "פדיקור",
    },
    {
      name_he: "עיצובי אקססוריז וציפורני יוקרה",
      description_he: "עיצוב אמנותי, חרסינה, אבנים ופרטים מיוחדים לפי בקשה.",
      price_ils: 60,
      duration_min: 30,
      category: "עיצוב",
    },
    {
      name_he: "לק ג'ל בלבד",
      description_he: "החלפת לק ג'ל על ציפורניים טבעיות או בנויות קיימות.",
      price_ils: 90,
      duration_min: 45,
      category: "מניקור",
    },
    {
      name_he: "הסרת בניה מקצועית",
      description_he: "פירוק והסרה עדינה של בניה קיימת ללא פגיעה בציפורן הטבעית.",
      price_ils: 50,
      duration_min: 30,
      category: "טיפוח",
    },
  ];

  db.exec("BEGIN");
  for (const row of services) insert.run(row);
  db.exec("COMMIT");
}

export default db;
