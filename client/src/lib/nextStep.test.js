import { describe, expect, it } from "vitest";
import { israelToday, nextStep } from "./nextStep.js";

const appt = (id, date, time, status, extra = {}) => ({ id, date, time, status, ...extra });
const today = "2026-11-01";

describe("home next step", () => {
  it("asks to measure first when nothing is booked and no sizes are saved", () => {
    expect(nextStep({ appointments: [], hasMeasurements: false, today }).kind).toBe("measure");
  });

  it("offers booking once sizes are saved", () => {
    expect(nextStep({ appointments: [], hasMeasurements: true, today }).kind).toBe("book");
  });

  it("an approved booking waiting for her confirmation comes first", () => {
    const step = nextStep({
      appointments: [appt(1, "2026-11-02", "10:00", "pending"), appt(2, "2026-11-05", "12:00", "manager_approved", { canConfirm: true })],
      hasMeasurements: false,
      today,
    });
    expect(step.kind).toBe("confirm");
    expect(step.appointment.id).toBe(2);
  });

  it("shows the earliest of a confirmed visit or a pending request", () => {
    const visitFirst = nextStep({
      appointments: [appt(1, "2026-11-03", "10:00", "confirmed"), appt(2, "2026-11-09", "10:00", "pending")],
      hasMeasurements: true,
      today,
    });
    expect(visitFirst.kind).toBe("visit");
    const pendingFirst = nextStep({
      appointments: [appt(1, "2026-11-09", "10:00", "confirmed"), appt(2, "2026-11-03", "10:00", "pending")],
      hasMeasurements: true,
      today,
    });
    expect(pendingFirst.kind).toBe("pending");
  });

  it("ignores past, rejected and cancelled appointments", () => {
    const step = nextStep({
      appointments: [appt(1, "2026-10-01", "10:00", "confirmed"), appt(2, "2026-11-04", "10:00", "rejected"), appt(3, "2026-11-04", "11:00", "cancelled")],
      hasMeasurements: true,
      today,
    });
    expect(step.kind).toBe("book");
  });

  it("uses Israel's date, not the device's", () => {
    expect(israelToday(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11-01");
  });
});
