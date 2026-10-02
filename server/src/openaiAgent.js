import OpenAI from "openai";
import {
  listServices,
  getAvailability,
  createAppointmentRequest,
  listAppointmentsForUser,
} from "./appointmentsService.js";
import { config } from "./config.js";

function getClient() {
  if (!config.openaiApiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return new OpenAI({ apiKey: config.openaiApiKey });
}

async function buildSystemPrompt() {
  const services = await listServices();
  const catalog = services
    .map(
      (s) =>
        `- #${s.id} ${s.name_he} (${s.category}): ${s.description_he} | מחיר: ${s.price_ils}₪ | משך: ${s.duration_min} דק'`
    )
    .join("\n");

  return `את/ה הקונסיירז' הדיגיטלי של סלון הציפורניים "made by kseniya".
דברי עברית בלבד, בטון חם, מקצועי ומזמין, בגוף ראשון יחיד ("אני", "אשמח") ולא בגוף ראשון רבים ("אנחנו", "נשמח"). תני המלצות שירות מתאימות לפי מה שהלקוחה מתארת (אירוע, אורח חיים, אורך רצוי, סגנון).
שעות פעילות: ראשון-שבת 09:00-20:00.

קטלוג השירותים הנוכחי:
${catalog}

את/ה יכול/ה להשתמש בכלים כדי לבדוק זמינות, להציג ללקוחה את הבקשות והתורים שלה, ולשלוח בקשה לתור חדש.
כל תור נשלח כבקשה שממתינה לאישור שלי. אחרי שליחה אמרי שהבקשה התקבלה ושאעבור עליה ואשתדל לאשר — לעולם אל תגידי שהתור נקבע או אושר.
שינוי מועד או ביטול של תור קיים נעשים רק דרכי ישירות; אל תבטיחי לבצע אותם בצ'אט.
לפני שליחת בקשה, ודאי תמיד שיש לך את פרטי הלקוחה (שם מלא וטלפון) ואת השירות המבוקש.
אם משהו לא ברור, שאלי שאלת המשך קצרה במקום לנחש.`;
}

const tools = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Return open time slots for a given date and service.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          serviceId: { type: "number", description: "The service id from the catalog" },
        },
        required: ["date", "serviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "my_appointments",
      description: "List the signed-in customer's own booking requests and appointments with their status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Send a booking request (it waits for the studio's approval). Only call once slot availability has been confirmed and all client details are known.",
      parameters: {
        type: "object",
        properties: {
          clientName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          serviceId: { type: "number" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
          notes: { type: "string" },
        },
        required: ["clientName", "phone", "serviceId", "date", "time"],
      },
    },
  },
];

async function executeTool(name, args, { userId }) {
  switch (name) {
    case "check_availability":
      return getAvailability(args.date, args.serviceId);
    case "my_appointments":
      if (!userId) return { error: "LOGIN_REQUIRED" };
      return listAppointmentsForUser(userId, { limit: 10 });
    case "book_appointment": {
      if (!userId) return { error: "LOGIN_REQUIRED" };
      const { appointment } = await createAppointmentRequest(
        {
          clientName: args.clientName,
          phone: args.phone,
          email: args.email,
          serviceId: args.serviceId,
          date: args.date,
          time: args.time,
          notes: args.notes,
        },
        { userId }
      );
      return appointment;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runChat(messages, { userId = null } = {}) {
  const client = getClient();
  const conversation = [{ role: "system", content: await buildSystemPrompt() }, ...messages];

  for (let round = 0; round < 4; round++) {
    const response = await client.chat.completions.create({
      model: config.openaiModel,
      messages: conversation,
      tools,
    });

    const choice = response.choices[0].message;
    conversation.push(choice);

    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      return choice.content;
    }

    for (const call of choice.tool_calls) {
      let result;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        result = await executeTool(call.function.name, args, { userId });
      } catch (err) {
        result = { error: err.message };
      }
      conversation.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return "מצטערת, נתקלתי בקושי לענות כרגע. אפשר לנסות שוב או ליצור קשר טלפוני עם הסלון?";
}
