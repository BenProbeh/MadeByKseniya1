/**
 * End-to-end: real browser (phone-sized Chrome), real UI, isolated API.
 * Run: npm run test:e2e   (from client/)
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiContext, gone, phone, see, startStack, stopStack } from "./stack.mjs";
import { PASSWORD, createAccount, daysAhead, latestCode, login, makeOwner, uniqueEmail, uploadSyntheticHandPhoto } from "./helpers.mjs";

before(startStack, { timeout: 180_000 });
after(stopStack);

// The database allows exactly one owner, so every test shares the same one.
let ownerAccount = null;
async function ownerSession(api) {
  if (!ownerAccount) {
    const email = uniqueEmail("owner");
    const user = await createAccount(api, { firstName: "קסניה", email });
    await makeOwner(user.id);
    ownerAccount = { email, id: user.id };
  } else {
    await login(api, ownerAccount.email);
  }
  return ownerAccount;
}

const shutterReady = (page) =>
  page.waitForFunction(() => {
    const b = document.querySelector('button[aria-label="צילום"]');
    return Boolean(b && !b.disabled);
  });

describe("customer", () => {
  it("register → verify → measure → save → book → pending → profile", { timeout: 120_000 }, async () => {
    const { page, context } = await phone();
    const email = uniqueEmail("mia");

    await page.goto("/register");
    await page.getByLabel("שם פרטי").fill("מיה");
    await page.getByLabel("שם משפחה").fill("בדיקה");
    await page.getByLabel("אימייל").fill(email);
    await page.getByLabel("סיסמה", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "יצירת חשבון" }).click();
    await see(page.getByRole("heading", { name: "אימות האימייל" }));
    await page.getByLabel("קוד אימות").fill(await latestCode(email));

    // Home knows the next step.
    await see(page.getByRole("heading", { name: "מה עושות היום?" }));
    await see(page.getByRole("heading", { name: "נתחיל מהמידות שלך" }));

    // Measure one finger against the 10 ₪ coin.
    await page.getByRole("link", { name: "למדידה" }).click();
    await see(page.getByText("מטבע של 10 ₪"));
    await page.getByRole("button", { name: "בואי נתחיל" }).click();
    await page.getByRole("button", { name: "ניקוי" }).click();
    await page.getByRole("button", { name: "אגודל יד ימין" }).click();
    await page.getByRole("button", { name: "למדידת אצבע אחת" }).click();
    await see(page.getByRole("dialog", { name: /מדידת אגודל/ }));
    await uploadSyntheticHandPhoto(page);
    await see(page.getByText("סמני את המטבע"));
    await page.getByRole("button", { name: "הבא" }).click();
    const result = await see(page.getByText(/מ״מ · מידה \d/));
    const mm = Number((await result.textContent()).match(/[\d.]+/)[0]);
    assert.ok(mm > 12 && mm < 14, `width ${mm} mm should be near the true 12.8 mm`);
    await page.getByRole("button", { name: "שמירה וסיום" }).click();
    await see(page.getByRole("heading", { name: "המידות שלך" }));
    await page.getByRole("button", { name: "שמירת המידות" }).click();
    await see(page.getByRole("heading", { name: "המידות נשמרו" }));

    // Book.
    await page.getByRole("link", { name: "קביעת תור" }).click();
    await page.getByRole("radio", { name: /מניקור ג'ל/ }).click();
    await page.getByRole("option").nth(3).click();
    await page.getByRole("button", { name: /— פנוי$/ }).first().click();
    await page.getByRole("button", { name: "שליחת בקשה לתור" }).click();
    await see(page.getByRole("heading", { name: /קיבלתי את הפרטים שלך/ }));

    // Pending in the appointments tab; sizes in the profile.
    await page.getByRole("link", { name: "לתורים שלי" }).click();
    await see(page.getByText("ממתין לאישור"));
    await page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "פרופיל" }).click();
    await see(page.getByRole("heading", { name: "המידות שלי" }));
    await see(page.getByText("אגודל"));
    await context.close();
  });

  it("login screen: show password, remember-me on by default, clear error", async () => {
    const { page, context } = await phone();
    await page.goto("/login");
    const password = page.getByLabel("סיסמה", { exact: true });
    await password.fill("wrong-pass-1");
    assert.equal(await password.getAttribute("type"), "password");
    await page.getByRole("button", { name: "הצגת הסיסמה" }).click();
    assert.equal(await password.getAttribute("type"), "text");
    assert.equal(await page.getByRole("checkbox", { name: "להישאר מחוברת" }).isChecked(), true);
    await page.getByLabel("אימייל").fill("nobody@example.com");
    await page.getByRole("button", { name: "התחברות" }).click();
    const alert = await see(page.getByRole("alert"));
    assert.match(await alert.textContent(), /האימייל או הסיסמה אינם נכונים/);
    await context.close();
  });
});

describe("owner", () => {
  it("dashboard → customers → customer card → approve → customer confirms", { timeout: 120_000 }, async () => {
    const customerEmail = uniqueEmail("noa");
    const customerApi = await apiContext();
    await createAccount(customerApi, { firstName: "נועה", email: customerEmail });
    const booked = await customerApi.post("/api/appointments", {
      data: { clientName: "נועה בדיקה", serviceId: 1, date: daysAhead(4), time: "12:00", requestKey: `e2e-${Date.now()}` },
    });
    assert.equal(booked.status(), 201);

    const { page, context } = await phone();
    await ownerSession(page.request);

    await page.goto("/admin");
    await see(page.getByRole("heading", { name: /שלום, קסניה/ }));
    await see(page.getByRole("heading", { name: "בקשות שמחכות לך" }));
    const staffNav = page.getByRole("navigation", { name: "ניווט ניהול" });

    await staffNav.getByRole("link", { name: "לקוחות" }).click();
    await page.getByLabel("חיפוש לפי שם, אימייל או טלפון").fill("נועה");
    await page.getByRole("link", { name: /נועה בדיקה/ }).first().click();
    await see(page.getByRole("heading", { name: "נועה בדיקה" }));
    await see(page.getByRole("link", { name: /מייל עם נועה/ }));

    await staffNav.getByRole("link", { name: /תורים/ }).click();
    const card = page.getByRole("listitem").filter({ hasText: "נועה בדיקה" });
    await card.getByRole("button", { name: "אישור התור" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "כן, לאשר" }).click();
    await see(page.getByText(/התור אושר/));
    await context.close();

    // The customer sees it on Home and confirms.
    const customer = await phone();
    await login(customer.page.request, customerEmail);
    await customer.page.goto("/");
    await see(customer.page.getByRole("heading", { name: "התור שלך אושר" }));
    await customer.page.getByRole("button", { name: "אישור ההזמנה" }).click();
    await see(customer.page.getByRole("heading", { name: "נתראה בקרוב" }));
    await customer.context.close();
  });
});

describe("security", () => {
  it("customers can't use staff APIs; managers can't do owner-only actions; data stays personal", async () => {
    const ownerApi = await apiContext();
    const managerApi = await apiContext();
    const customerApi = await apiContext();
    const owner = await ownerSession(ownerApi);
    const manager = await createAccount(managerApi, { firstName: "מנהלת", email: uniqueEmail("mgr") });
    const customer = await createAccount(customerApi, { firstName: "לקוחה", email: uniqueEmail("cus") });

    assert.equal((await customerApi.get("/api/admin/customers")).status(), 403);
    assert.equal((await customerApi.get("/api/admin/appointments")).status(), 403);
    assert.equal((await customerApi.patch(`/api/owner/users/${customer.id}/role`, { data: { role: "admin" } })).status(), 403);

    assert.equal((await ownerApi.patch(`/api/owner/users/${manager.id}/role`, { data: { role: "admin" } })).status(), 200);
    assert.equal((await managerApi.get("/api/admin/customers")).status(), 200);
    assert.equal((await managerApi.patch(`/api/owner/users/${customer.id}/role`, { data: { role: "admin" } })).status(), 403);
    assert.notEqual((await managerApi.delete(`/api/admin/customers/${owner.id}`)).status(), 200);
    assert.equal((await managerApi.get("/api/owner/mail/status")).status(), 403);

    await customerApi.post("/api/measurements/profile", {
      data: { measurements: { "right-thumb": { handId: "right", fingerId: "thumb", widthMm: 15, size: 0, status: "confirmed" } } },
    });
    assert.equal((await (await managerApi.get("/api/profile/measurements")).json()).measurement, null);
    const anon = await apiContext();
    assert.equal((await anon.get("/api/measurements/profile")).status(), 401);
  });

  it("a customer can't open the staff area in the UI", async () => {
    const { page, context } = await phone();
    await createAccount(page.request, { firstName: "שירה", email: uniqueEmail("ui") });
    await page.goto("/admin/customers");
    await see(page.getByRole("heading", { name: "מה עושות היום?" }));
    assert.equal(await page.getByRole("navigation", { name: "ניווט ניהול" }).count(), 0);
    await context.close();
  });
});

// A deterministic camera: a canvas stream that stays live until the app stops it (Chrome's built-in fake device
// is unreliable on some machines). Every stream handed to the app is recorded so the test can prove its release.
const syntheticCamera = () => {
  window.__mbkStreams = [];
  navigator.mediaDevices.getUserMedia = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const draw = () => {
      ctx.fillStyle = `hsl(${(frame += 3) % 360} 30% 40%)`;
      ctx.fillRect(0, 0, 1280, 720);
    };
    draw();
    const timer = setInterval(draw, 50);
    const stream = canvas.captureStream(20);
    stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(timer));
    window.__mbkStreams.push(stream);
    return stream;
  };
};
const liveTracks = (page) =>
  page.evaluate(() => window.__mbkStreams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);

describe("camera", () => {
  it("opens in the capture step, released on leave, fresh on return, retake resets", { timeout: 90_000 }, async () => {
    const { page, context } = await phone({ permissions: ["camera"], initScript: syntheticCamera });
    await createAccount(page.request, { firstName: "דנה", email: uniqueEmail("cam") });
    await page.goto("/nail-sizing");
    await page.getByRole("button", { name: "בואי נתחיל" }).click();
    await page.getByRole("button", { name: /למדידת/ }).click();

    const shutter = page.getByRole("button", { name: "צילום", exact: true });
    await shutterReady(page);
    assert.equal(await liveTracks(page), 1);

    await shutter.click();
    await see(page.getByText("סמני את המטבע"));
    await page.getByRole("button", { name: "צילום מחדש" }).click();
    await shutterReady(page);
    await gone(page.getByText("סמני את המטבע"));

    await page.getByRole("button", { name: "יציאה מהמדידה" }).click();
    await see(page.getByRole("heading", { name: "אילו אצבעות נמדוד?" }));
    assert.equal(await liveTracks(page), 0, "no camera left running after leaving");

    await page.getByRole("button", { name: /למדידת/ }).click();
    await shutterReady(page);
    assert.equal(await liveTracks(page), 1, "a fresh stream on return");

    await page.getByRole("button", { name: "יציאה מהמדידה" }).click();
    await page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "בית" }).click();
    await see(page.getByRole("heading", { name: "מה עושות היום?" }));
    assert.equal(await liveTracks(page), 0);
    await context.close();
  });

  it("camera denied: clear recovery with a gallery fallback", async () => {
    const { page, context } = await phone({
      initScript: () => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
      },
    });
    await createAccount(page.request, { firstName: "רוני", email: uniqueEmail("deny") });
    await page.goto("/nail-sizing");
    await page.getByRole("button", { name: "בואי נתחיל" }).click();
    await page.getByRole("button", { name: /למדידת/ }).click();
    await page.getByRole("button", { name: "פתיחת המצלמה" }).click();
    await see(page.getByText("המצלמה חסומה"));
    await see(page.getByRole("button", { name: "מהגלריה" }));
    await see(page.getByRole("button", { name: "לנסות שוב" }));
    await context.close();
  });
});
