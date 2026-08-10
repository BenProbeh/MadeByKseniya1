import OpenAI from "openai";
import {
  listServices,
  getAvailability,
  createAppointment,
  findAppointmentsByPhone,
  updateAppointment,
} from "./appointmentsService.js";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("MISSING_API_KEY");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildSystemPrompt() {
  const services = listServices();
  const catalog = services
    .map(
      (s) =>
        `- #${s.id} ${s.name_he} (${s.category}): ${s.description_he} | מחיר: ${s.price_ils}₪ | משך: ${s.duration_min} דק'`
    )
    .join("\n");

  return `את/ה הקונסיירז' הדיגיטלי של סלון הציפורניים "made by kseniya".
דברי עברית בלבד, בטון חם, מקצועי ומזמין. תני המלצות שירות מתאימות לפי מה שהלקוחה מתארת (אירוע, אורח חיים, אורך רצוי, סגנון).
שעות פעילות: ראשון-חמישי 09:00-19:00, שישי 09:00-14:00, שבת סגור.

קטלוג השירותים הנוכחי:
${catalog}

את/ה יכול/ה להשתמש בכלים כדי לבדוק זמינות, לאתר תורים קיימים לפי טלפון, לקבוע תור חדש או להזיז/לבטל תור קיים.
לפני קביעת או הזזת תור, ודאי תמיד שיש לך את פרטי הלקוחה (שם מלא וטלפון) ואת השירות המבוקש.
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
      name: "find_appointments",
      description: "Find existing upcoming appointments for a client by phone number.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
        },
        required: ["phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Create a new appointment. Only call once slot availability has been confirmed and all client details are known.",
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
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Move an existing appointment to a new date/time, or cancel it.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "number" },
          newDate: { type: "string", description: "YYYY-MM-DD" },
          newTime: { type: "string", description: "HH:MM" },
          cancel: { type: "boolean", description: "Set true to cancel instead of reschedule" },
        },
        required: ["appointmentId"],
      },
    },
  },
];

function executeTool(name, args) {
  switch (name) {
    case "check_availability":
      return getAvailability(args.date, args.serviceId);
    case "find_appointments":
      return findAppointmentsByPhone(args.phone);
    case "book_appointment":
      return createAppointment({
        clientName: args.clientName,
        phone: args.phone,
        email: args.email,
        serviceId: args.serviceId,
        date: args.date,
        time: args.time,
        notes: args.notes,
      });
    case "reschedule_appointment":
      return updateAppointment(args.appointmentId, {
        date: args.newDate,
        time: args.newTime,
        status: args.cancel ? "cancelled" : undefined,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function runChat(messages) {
  const client = getClient();
  const conversation = [{ role: "system", content: buildSystemPrompt() }, ...messages];

  for (let round = 0; round < 4; round++) {
    const response = await client.chat.completions.create({
      model: MODEL,
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
        result = executeTool(call.function.name, args);
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
