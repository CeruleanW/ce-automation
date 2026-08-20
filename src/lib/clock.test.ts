import { describe, it, expect } from "vitest";
import { emailSendDeadline, promotionDay } from "./clock.ts";

describe("clock", () => {
  describe("emailSendDeadline", () => {
    it("returns Tuesday on or after courseStart - 14d", () => {
      // Course start 2026-09-20 (Sunday). base = 2026-09-06 (Sunday). next Tuesday = 2026-09-08.
      const start = new Date("2026-09-20T00:00:00Z");
      const deadline = emailSendDeadline(start);
      expect(deadline.getUTCDay()).toBe(2);
      expect(deadline.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    });

    it("rolls forward when base is not Tuesday", () => {
      // Course start 2026-09-16 (Wednesday). base = 2026-09-02 (Wednesday). next Tuesday = 2026-09-08.
      const start = new Date("2026-09-16T00:00:00Z");
      const deadline = emailSendDeadline(start);
      expect(deadline.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    });

    it("returns same date when base is already Tuesday", () => {
      // Course start 2026-09-22 (Tuesday). base = 2026-09-08 (Tuesday). no roll.
      const start = new Date("2026-09-22T00:00:00Z");
      const deadline = emailSendDeadline(start);
      expect(deadline.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    });
  });

  describe("promotionDay", () => {
    it("returns Sunday on or after courseStart - 14d", () => {
      // Course start 2026-09-20 (Sunday). base = 2026-09-06 (Sunday). already Sunday.
      const start = new Date("2026-09-20T00:00:00Z");
      const promo = promotionDay(start);
      expect(promo.getUTCDay()).toBe(0);
      expect(promo.toISOString()).toBe("2026-09-06T00:00:00.000Z");
    });

    it("rolls forward when base is not Sunday", () => {
      // Course start 2026-09-23 (Wednesday). base = 2026-09-09 (Wednesday). next Sunday = 2026-09-13.
      const start = new Date("2026-09-23T00:00:00Z");
      const promo = promotionDay(start);
      expect(promo.toISOString()).toBe("2026-09-13T00:00:00.000Z");
    });
  });
});
