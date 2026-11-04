import { describe, it, expect, vi } from "vitest";

const { createEmail } = await import("./email-create.ts");
import type { RunnerConfig } from "../lib/shell.ts";

function makeConfig(
  record: unknown,
  calls: Array<{ cmd: string; args: string[] }> = [],
): RunnerConfig {
  return {
    runApiIntegrator: vi.fn(async (cmd: string, args: string[] = []) => {
      calls.push({ cmd, args });
      if (cmd === "airtable:fetch-record") return record;
      return undefined;
    }),
    now: () => new Date("2026-09-01T00:00:00Z"),
    checkGwsAuth: vi.fn(async () => ({
      auth_method: "oauth",
      credential_source: "file",
      storage: "encrypted",
    })),
  };
}

const fullRecord = {
  id: "recXYZ",
  fields: {
    title: "Test Course",
    term: "Fall",
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

describe("createEmail", () => {
  it("fetches the course via airtable:fetch-record --id", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    await createEmail("recXYZ", makeConfig(fullRecord, calls));
    expect(calls[0]).toEqual({
      cmd: "airtable:fetch-record",
      args: ["--id", "recXYZ"],
    });
  });

  it("returns EmailDraft with recordId, term, subject, body", async () => {
    const draft = await createEmail("recXYZ", makeConfig(fullRecord));
    expect(draft.recordId).toBe("recXYZ");
    expect(draft.term).toBe("Fall");
    expect(draft.subject).toBe("課程報名：Test Course");
    expect(draft.body).toContain("Test Course");
    expect(draft.body).toContain("Mr. Chan");
    expect(draft.body).toContain("https://forms.example/abc");
  });

  it("prefers short-description when present", async () => {
    const draft = await createEmail("recXYZ", makeConfig(fullRecord));
    expect(draft.body).toContain("Short desc");
    expect(draft.body).not.toContain("Long desc");
  });

  it("falls back to long-description when short is absent", async () => {
    const record = {
      id: "recXYZ",
      fields: {
        ...fullRecord.fields,
        "short-description-for-news-or-poster": undefined,
      },
    };
    const draft = await createEmail("recXYZ", makeConfig(record));
    expect(draft.body).toContain("Long desc");
  });

  it("drops lines whose value is blank", async () => {
    const record = {
      id: "recXYZ",
      fields: {
        title: "Minimal Course",
        term: "Fall",
        "long-description": "Only desc",
      },
    };
    const draft = await createEmail("recXYZ", makeConfig(record));
    expect(draft.body).not.toContain("對象");
    expect(draft.body).not.toContain("日期");
    expect(draft.body).not.toContain("報名連結");
    expect(draft.body).toContain("Only desc");
  });

  it("omits registration link line when form-link is blank", async () => {
    const record = {
      id: "recXYZ",
      fields: { title: "No Form Link", term: "Fall" },
    };
    const draft = await createEmail("recXYZ", makeConfig(record));
    expect(draft.body).not.toContain("報名連結");
  });

  it("throws when airtable:fetch-record returns non-record", async () => {
    await expect(
      createEmail("recXYZ", makeConfig("not a record")),
    ).rejects.toThrow(/did not return a record/);
  });

  it("throws when airtable:fetch-record returns null", async () => {
    await expect(createEmail("recXYZ", makeConfig(null))).rejects.toThrow(
      /did not return a record/,
    );
  });
});
