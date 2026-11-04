import { describe, it, expect, vi, beforeEach } from "vitest";

const runApiIntegratorMock = vi.fn();
vi.mock("./lib/shell.ts", () => ({
  runApiIntegrator: (...args: unknown[]) =>
    runApiIntegratorMock(...(args as [string, ...string[]])),
}));

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

const { main } = await import("./cli.ts");

beforeEach(() => {
  runApiIntegratorMock.mockReset();
  logSpy.mockClear();
  errSpy.mockClear();
});

describe("cli main", () => {
  it("returns 0 and prints help when no args", async () => {
    const code = await main([]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalled();
    expect(runApiIntegratorMock).not.toHaveBeenCalled();
  });

  it("returns 0 and prints help for --help", async () => {
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Usage: pnpm ce"),
    );
  });

  it("returns 0 and prints help for -h", async () => {
    const code = await main(["-h"]);
    expect(code).toBe(0);
  });

  it("returns 1 and prints error for unknown command", async () => {
    const code = await main(["nonexistent:cmd"]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("Unknown command: nonexistent:cmd\n");
  });

  it("dispatches no-arg passthrough to runApiIntegrator and prints JSON on success", async () => {
    runApiIntegratorMock.mockResolvedValue({ ok: true });
    const code = await main(["term:ensure"]);
    expect(code).toBe(0);
    expect(runApiIntegratorMock).toHaveBeenCalledWith(
      "supabase:ensure-current-term",
    );
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ ok: true }, null, 2));
  });

  it("prints Source header before JSON when command has source field", async () => {
    runApiIntegratorMock.mockResolvedValue({ ok: true });
    await main(["term:ensure"]);
    expect(logSpy).toHaveBeenNthCalledWith(1, "Source: Supabase term table");
    expect(logSpy).toHaveBeenNthCalledWith(
      2,
      JSON.stringify({ ok: true }, null, 2),
    );
  });

  it("forwards args for courses:fetch --id", async () => {
    runApiIntegratorMock.mockResolvedValue({ id: "rec123" });
    await main(["courses:fetch", "--id", "rec123"]);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("airtable:fetch-record", [
      "--id",
      "rec123",
    ]);
  });

  it("forwards --titles flag for courses:list", async () => {
    runApiIntegratorMock.mockResolvedValue([]);
    await main(["courses:list", "--titles"]);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("airtable:fetch-all", [
      "--titles",
    ]);
  });

  it("forwards no args for courses:list without flags", async () => {
    runApiIntegratorMock.mockResolvedValue([]);
    await main(["courses:list"]);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("airtable:fetch-all");
  });

  it("forwards variadic args for gws:exec", async () => {
    runApiIntegratorMock.mockResolvedValue({});
    await main(["gws:exec", "gmail", "users", "getProfile"]);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("gws:exec", [
      "gmail",
      "users",
      "getProfile",
    ]);
  });

  it("returns 1 and prints error when runApiIntegrator rejects", async () => {
    runApiIntegratorMock.mockRejectedValue(new Error("boom"));
    const code = await main(["term:ensure"]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("boom");
  });

  it("returns 1 when required --id is missing for courses:fetch", async () => {
    const code = await main(["courses:fetch"]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("Missing required --id <recordId>");
    expect(runApiIntegratorMock).not.toHaveBeenCalled();
  });

  it("forwards the record ID for registration:publish and prints the result", async () => {
    const result = {
      formId: "form123",
      formLink: "https://forms.google.com/form123",
    };
    runApiIntegratorMock.mockResolvedValue(result);

    const code = await main(["registration:publish", "--id", "rec123"]);

    expect(code).toBe(0);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("registration:publish", [
      "--id",
      "rec123",
    ]);
    expect(logSpy).toHaveBeenNthCalledWith(
      1,
      "Source: Airtable + Google Drive + Google Forms (registration publish, single)",
    );
    expect(logSpy).toHaveBeenNthCalledWith(2, JSON.stringify(result, null, 2));
  });

  it("returns 1 when required --id is missing for registration:publish", async () => {
    const code = await main(["registration:publish"]);

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("Missing required --id <recordId>");
    expect(runApiIntegratorMock).not.toHaveBeenCalled();
  });

  it("requires approval before publishing a feedback form", async () => {
    const code = await main(["feedback:publish", "--id", "rec123"]);

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      "Creating a Google Form makes external changes; rerun with --yes after reviewing the course.",
    );
    expect(runApiIntegratorMock).not.toHaveBeenCalled();
  });

  it("forwards approved feedback-form publishing to api-integrator", async () => {
    runApiIntegratorMock.mockResolvedValue({ feedbackFormId: "form123" });

    const code = await main(["feedback:publish", "--id", "rec123", "--yes"]);

    expect(code).toBe(0);
    expect(runApiIntegratorMock).toHaveBeenCalledWith("feedback:publish", [
      "--id",
      "rec123",
      "--yes",
    ]);
  });

  it("syncs the requested course to the website", async () => {
    const course = { action: "created", airtableRecordId: "rec123" };
    const news = { id: "news-123" };
    runApiIntegratorMock.mockImplementation(async (command: string) => {
      if (command === "airtable:fetch-record") {
        return {
          id: "rec123",
          fields: {
            title: "Course A",
            term: "Fall",
            "start-date": "2026-09-15",
            "short-description-for-news-or-poster": "Course intro",
            "form-link": "https://forms.example/course-a",
          },
        };
      }
      if (command === "supabase:course:sync-airtable") return course;
      if (command === "supabase:news:upsert") return news;
      return undefined;
    });

    const code = await main(["website:update", "--id", "rec123"]);

    expect(code).toBe(0);
    expect(runApiIntegratorMock).toHaveBeenNthCalledWith(
      1,
      "airtable:fetch-record",
      ["--id", "rec123"],
    );
    expect(runApiIntegratorMock).toHaveBeenNthCalledWith(
      2,
      "supabase:course:sync-airtable",
      ["--id", "rec123"],
    );
    const newsArgs = runApiIntegratorMock.mock.calls[2]?.[1] as string[];
    expect(runApiIntegratorMock).toHaveBeenNthCalledWith(
      3,
      "supabase:news:upsert",
      expect.arrayContaining([
        "--title",
        "Course A",
        "--content",
        expect.stringContaining("Course intro"),
        "--date",
        "2026-09-15",
        "--form-link",
        "https://forms.example/course-a",
      ]),
    );
    expect(newsArgs[1]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(logSpy).toHaveBeenCalledWith(
      "Source: Airtable → website Supabase course and news sync",
    );
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ recordId: "rec123", course, news }, null, 2),
    );
  });

  it("requires --id for website:update", async () => {
    const code = await main(["website:update"]);

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("Missing required --id <recordId>");
    expect(runApiIntegratorMock).not.toHaveBeenCalled();
  });

  it("returns 1 when gws:exec has no args", async () => {
    const code = await main(["gws:exec"]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith("Provide the gws command as arguments");
  });

  it("returns undefined result prints nothing for registration:publish-all", async () => {
    runApiIntegratorMock.mockResolvedValue(undefined);
    const code = await main(["registration:publish-all"]);
    expect(code).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("finds the current-term folder using the calculated folder name", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 15));
    runApiIntegratorMock.mockResolvedValue({ id: "folder123" });

    try {
      const code = await main(["drive:current-term-folder"]);

      expect(code).toBe(0);
      expect(runApiIntegratorMock).toHaveBeenCalledWith("drive:find-folder", [
        "--name",
        "2026 04-06 (Spring)",
      ]);
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(
          { name: "2026 04-06 (Spring)", result: { id: "folder123" } },
          null,
          2,
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds the next-term folder using the calculated folder name", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    runApiIntegratorMock.mockResolvedValue({ id: "folder456" });

    try {
      const code = await main(["drive:next-term-folder"]);

      expect(code).toBe(0);
      expect(runApiIntegratorMock).toHaveBeenCalledWith("drive:find-folder", [
        "--name",
        "2027 01-03 (Winter)",
      ]);
      expect(logSpy).toHaveBeenCalledWith(
        JSON.stringify(
          { name: "2027 01-03 (Winter)", result: { id: "folder456" } },
          null,
          2,
        ),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
