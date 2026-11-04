import { describe, expect, it, vi } from "vitest";
import type { RunnerConfig } from "../lib/shell.ts";
import { updateWebsite } from "./website-update.ts";

const record = {
  id: "rec-course-123",
  fields: {
    title: "Course A",
    term: "Fall",
    "start-date": "2026-09-15",
    "short-description-for-news-or-poster": "Course intro",
    teacher: "Teacher A",
    "form-link": "https://forms.example/course-a",
  },
};

function makeConfig(runApiIntegrator: RunnerConfig["runApiIntegrator"]) {
  return { runApiIntegrator };
}

describe("updateWebsite", () => {
  it("syncs the course and upserts its rendered news with a stable id", async () => {
    const runApiIntegrator = vi.fn(
      async (command: string, args: string[] = []) => {
        void args;
        if (command === "airtable:fetch-record") return record;
        if (command === "supabase:course:sync-airtable") {
          return { action: "created", airtableRecordId: record.id };
        }
        if (command === "supabase:news:upsert") return { id: "news-row" };
        return undefined;
      },
    );
    const config = makeConfig(runApiIntegrator);

    const first = await updateWebsite(record.id, config);
    const second = await updateWebsite(record.id, config);
    const newsCalls = runApiIntegrator.mock.calls.filter(
      ([command]) => command === "supabase:news:upsert",
    );
    const firstArgs = newsCalls[0]?.[1] as string[];
    const secondArgs = newsCalls[1]?.[1] as string[];

    expect(runApiIntegrator).toHaveBeenNthCalledWith(
      1,
      "airtable:fetch-record",
      ["--id", record.id],
    );
    expect(runApiIntegrator).toHaveBeenNthCalledWith(
      2,
      "supabase:course:sync-airtable",
      ["--id", record.id],
    );
    expect(firstArgs).toEqual(secondArgs);
    expect(firstArgs).toContain("Course A");
    expect(firstArgs[firstArgs.indexOf("--content") + 1]).toContain(
      "Course intro",
    );
    expect(firstArgs[firstArgs.indexOf("--content") + 1]).toContain(
      "Teacher A",
    );
    expect(firstArgs).toContain("2026-09-15");
    expect(firstArgs).toContain("https://forms.example/course-a");
    expect(firstArgs[1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first).toEqual({
      recordId: record.id,
      course: { action: "created", airtableRecordId: record.id },
      news: { id: "news-row" },
    });
    expect(second.recordId).toBe(record.id);
  });

  it("rejects an invalid start date before writing website data", async () => {
    const runApiIntegrator = vi.fn(async (command: string) =>
      command === "airtable:fetch-record"
        ? {
            ...record,
            fields: { ...record.fields, "start-date": "2026-02-30" },
          }
        : undefined,
    );

    await expect(
      updateWebsite(record.id, makeConfig(runApiIntegrator)),
    ).rejects.toThrow("has an invalid start-date");
    expect(runApiIntegrator).toHaveBeenCalledTimes(1);
  });
});
