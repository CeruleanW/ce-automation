import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendEmail } = await import("./email-send.ts");
import type { RunnerConfig } from "../lib/shell.ts";
import { GwsAuthError } from "../lib/gws-auth.ts";

interface Call {
  cmd: string;
  args: string[];
}

function makeConfig(
  record: unknown,
  calls: Call[] = [],
  gwsResult: unknown = {
    data: { id: "msg-123", threadId: "t-1" },
    raw: "",
    exitCode: 0,
  },
  nowIso = "2026-09-01T00:00:00Z",
  checkGwsAuth: RunnerConfig["checkGwsAuth"] = vi.fn(async () => ({
    auth_method: "oauth",
    credential_source: "file",
    storage: "encrypted",
  })),
): RunnerConfig {
  return {
    runApiIntegrator: vi.fn(async (cmd: string, args: string[] = []) => {
      calls.push({ cmd, args });
      if (cmd === "airtable:fetch-record") return record;
      if (cmd === "gws:exec") return gwsResult;
      return undefined;
    }),
    now: () => new Date(nowIso),
    checkGwsAuth,
  };
}

const courseRecord = {
  id: "recXYZ",
  fields: {
    title: "Test Course",
    term: "Fall",
    "start-date": "2026-09-20", // Sunday; deadline = Tue 2026-09-08
    teacher: "Mr. Chan",
    location: "Room 101",
    schedule: "Sundays",
    time: "09:30-10:30",
    "short-description-for-news-or-poster": "Short desc",
    "long-description": "Long desc",
    "target-audience": "All members",
    "form-link": "https://forms.example/abc",
    note: "Bring your Bible",
  },
};

const GWS_SEND = "gws:exec";

describe("sendEmail", () => {
  let savedRecipients: string | undefined;
  beforeEach(() => {
    savedRecipients = process.env["CE_EMAIL_RECIPIENTS"];
    delete process.env["CE_EMAIL_RECIPIENTS"];
  });
  afterEach(() => {
    if (savedRecipients === undefined) {
      delete process.env["CE_EMAIL_RECIPIENTS"];
    } else {
      process.env["CE_EMAIL_RECIPIENTS"] = savedRecipients;
    }
  });

  it("fetches the course via airtable:fetch-record --id", async () => {
    const calls: Call[] = [];
    await sendEmail(
      "recXYZ",
      makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
      { to: "admin@church.example" },
    );
    expect(calls[0]).toEqual({
      cmd: "airtable:fetch-record",
      args: ["--id", "recXYZ"],
    });
  });

  it("throws when airtable:fetch-record returns non-record", async () => {
    await expect(
      sendEmail("recXYZ", makeConfig("not a record"), { to: "a@b.example" }),
    ).rejects.toThrow(/did not return a record/);
  });

  it("throws MissingStartDateError when record has no start-date", async () => {
    const record = {
      id: "recXYZ",
      fields: { ...courseRecord.fields, "start-date": undefined },
    };
    await expect(
      sendEmail("recXYZ", makeConfig(record), { to: "a@b.example" }),
    ).rejects.toThrow(/no start-date/);
  });

  describe("timing rule", () => {
    it("before deadline + no force: returns sent=false with plannedSendAt, no gws call", async () => {
      const calls: Call[] = [];
      const result = await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-01T00:00:00Z"),
        { to: "admin@church.example" },
      );
      expect(result).toEqual({
        recordId: "recXYZ",
        sent: false,
        plannedSendAt: "2026-09-08T00:00:00.000Z",
      });
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(false);
    });

    it("on the deadline: sends", async () => {
      const calls: Call[] = [];
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-08T00:00:00Z"),
        { to: "admin@church.example" },
      )) as { sent: boolean; messageId: string };
      expect(result.sent).toBe(true);
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(true);
    });

    it("after the deadline: sends", async () => {
      const calls: Call[] = [];
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example" },
      )) as { sent: boolean };
      expect(result.sent).toBe(true);
    });

    it("--force sends even before the deadline", async () => {
      const calls: Call[] = [];
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-01T00:00:00Z"),
        { to: "admin@church.example", force: true },
      )) as { sent: boolean };
      expect(result.sent).toBe(true);
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(true);
    });
  });

  describe("recipients", () => {
    it("resolves a single --to address", async () => {
      const calls: Call[] = [];
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example" },
      );
      const send = calls.find((c) => c.cmd === GWS_SEND)!;
      expect(send.args).toContain("--to");
      expect(send.args[send.args.indexOf("--to") + 1]).toBe(
        "admin@church.example",
      );
    });

    it("resolves multiple --to addresses from a comma-separated value", async () => {
      const calls: Call[] = [];
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example, news@church.example , ," },
      );
      const send = calls.find((c) => c.cmd === GWS_SEND)!;
      const tos = send.args
        .map((a, i) => (a === "--to" ? send.args[i + 1] : null))
        .filter((a): a is string => a != null);
      expect(tos).toEqual(["admin@church.example", "news@church.example"]);
    });

    it("falls back to CE_EMAIL_RECIPIENTS when --to is absent", async () => {
      process.env["CE_EMAIL_RECIPIENTS"] =
        "admin@church.example,news@church.example";
      const calls: Call[] = [];
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        {},
      );
      const send = calls.find((c) => c.cmd === GWS_SEND)!;
      expect(send.args).toContain("admin@church.example");
      expect(send.args).toContain("news@church.example");
    });

    it("throws MissingRecipientsError when neither --to nor env is set", async () => {
      await expect(
        sendEmail(
          "recXYZ",
          makeConfig(courseRecord, [], undefined, "2026-09-10T00:00:00Z"),
          {},
        ),
      ).rejects.toThrow(/No email recipients/);
    });

    it("throws MissingRecipientsError before calling gws:exec", async () => {
      const calls: Call[] = [];
      await expect(
        sendEmail(
          "recXYZ",
          makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
          {},
        ),
      ).rejects.toThrow();
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(false);
    });
  });

  describe("send args", () => {
    it("forwards subject + body from the rendered draft", async () => {
      const calls: Call[] = [];
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example" },
      );
      const send = calls.find((c) => c.cmd === GWS_SEND)!;
      expect(send.args).toEqual([
        "gmail",
        "+send",
        "--to",
        "admin@church.example",
        "--subject",
        "課程報名：Test Course",
        "--body",
        expect.stringContaining("Test Course"),
      ]);
    });
  });

  describe("send result", () => {
    it("returns sent=true with sentAt + messageId from result.data.id", async () => {
      const calls: Call[] = [];
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example" },
      )) as { sent: boolean; sentAt: string; messageId: string | null };
      expect(result.sent).toBe(true);
      expect(result.sentAt).toBe("2026-09-10T00:00:00.000Z");
      expect(result.messageId).toBe("msg-123");
    });

    it("returns messageId=null when gws result has no id", async () => {
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(
          courseRecord,
          [],
          { data: {}, exitCode: 0 },
          "2026-09-10T00:00:00Z",
        ),
        { to: "admin@church.example" },
      )) as { messageId: string | null };
      expect(result.messageId).toBe(null);
    });
  });

  describe("dry run", () => {
    it("returns a dry-run payload and does not call gws:exec", async () => {
      const calls: Call[] = [];
      const result = (await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-10T00:00:00Z"),
        { to: "admin@church.example", dryRun: true },
      )) as {
        sent: boolean;
        dryRun: boolean;
        recipients: string[];
        subject: string;
        body: string;
        sendArgs: string[];
      };
      expect(result.sent).toBe(false);
      expect(result.dryRun).toBe(true);
      expect(result.recipients).toEqual(["admin@church.example"]);
      expect(result.subject).toBe("課程報名：Test Course");
      expect(result.body).toContain("Test Course");
      expect(result.sendArgs).toEqual([
        "gmail",
        "+send",
        "--to",
        "admin@church.example",
        "--subject",
        "課程報名：Test Course",
        "--body",
        expect.stringContaining("Test Course"),
      ]);
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(false);
    });

    it("dry run still respects the timing rule (no early-send before deadline)", async () => {
      const calls: Call[] = [];
      const result = await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, calls, undefined, "2026-09-01T00:00:00Z"),
        { to: "admin@church.example", dryRun: true },
      );
      expect(result).toEqual({
        recordId: "recXYZ",
        sent: false,
        plannedSendAt: "2026-09-08T00:00:00.000Z",
      });
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(false);
    });
  });

  describe("gws auth gate", () => {
    it("runs the gate before gws:exec on a real send", async () => {
      const calls: Call[] = [];
      const gate = vi.fn(async () => ({
        auth_method: "oauth",
        credential_source: "file",
        storage: "encrypted",
      }));
      await sendEmail(
        "recXYZ",
        makeConfig(
          courseRecord,
          calls,
          undefined,
          "2026-09-10T00:00:00Z",
          gate,
        ),
        { to: "admin@church.example" },
      );
      expect(gate).toHaveBeenCalledTimes(1);
      const sendIdx = calls.findIndex((c) => c.cmd === GWS_SEND);
      expect(sendIdx).toBeGreaterThan(-1);
    });

    it("does not run the gate on dry-run", async () => {
      const gate = vi.fn(async () => ({
        auth_method: "oauth",
        credential_source: "file",
        storage: "encrypted",
      }));
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, [], undefined, "2026-09-10T00:00:00Z", gate),
        { to: "admin@church.example", dryRun: true },
      );
      expect(gate).not.toHaveBeenCalled();
    });

    it("does not run the gate before the deadline (no send)", async () => {
      const gate = vi.fn(async () => ({
        auth_method: "oauth",
        credential_source: "file",
        storage: "encrypted",
      }));
      await sendEmail(
        "recXYZ",
        makeConfig(courseRecord, [], undefined, "2026-09-01T00:00:00Z", gate),
        { to: "admin@church.example" },
      );
      expect(gate).not.toHaveBeenCalled();
    });

    it("does not run the gate when recipients are missing (throws first)", async () => {
      const gate = vi.fn(async () => ({
        auth_method: "oauth",
        credential_source: "file",
        storage: "encrypted",
      }));
      await expect(
        sendEmail(
          "recXYZ",
          makeConfig(courseRecord, [], undefined, "2026-09-10T00:00:00Z", gate),
          {},
        ),
      ).rejects.toThrow(/No email recipients/);
      expect(gate).not.toHaveBeenCalled();
    });

    it("rethrows GwsAuthError from the gate and skips gws:exec", async () => {
      const calls: Call[] = [];
      const gate = vi.fn(async () => {
        throw new GwsAuthError(
          "gws auth status: auth_method=none storage=none",
        );
      });
      await expect(
        sendEmail(
          "recXYZ",
          makeConfig(
            courseRecord,
            calls,
            undefined,
            "2026-09-10T00:00:00Z",
            gate,
          ),
          { to: "admin@church.example" },
        ),
      ).rejects.toThrow(/gws is not authenticated/);
      expect(calls.some((c) => c.cmd === GWS_SEND)).toBe(false);
    });
  });
});
