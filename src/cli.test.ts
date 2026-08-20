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
});
