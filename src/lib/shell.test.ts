import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock("../config.ts", () => ({
  getIntegratorDir: () => "/fake/integrator",
  isDryRun: () => false,
  getNowOverride: () => undefined,
  now: () => new Date("2026-08-19T00:00:00Z"),
}));

const { runApiIntegrator } = await import("./shell.ts");

interface FakeStream extends EventEmitter {
  setEncoding: (_: string) => void;
}

interface FakeChild extends EventEmitter {
  stdout: FakeStream;
  stderr: FakeStream;
}

interface FakeChildOptions {
  stdout?: string[];
  stderr?: string[];
  exitCode?: number | null;
  error?: Error;
}

function makeFakeChild(opts: FakeChildOptions): FakeChild {
  const stdout = new EventEmitter() as FakeStream;
  const stderr = new EventEmitter() as FakeStream;
  stdout.setEncoding = () => {};
  stderr.setEncoding = () => {};
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
  }) as FakeChild;
  queueMicrotask(() => {
    for (const chunk of opts.stdout ?? []) {
      stdout.emit("data", chunk);
    }
    for (const chunk of opts.stderr ?? []) {
      stderr.emit("data", chunk);
    }
    if (opts.error) {
      child.emit("error", opts.error);
    } else {
      child.emit("exit", opts.exitCode ?? 0);
    }
  });
  return child;
}

beforeEach(() => {
  spawnMock.mockReset();
});

describe("runApiIntegrator", () => {
  it("parses JSON stdout on success", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: ['{"id":"rec123","fields":{}}'], exitCode: 0 }),
    );
    const result = await runApiIntegrator("airtable:fetch-record", [
      "--id",
      "rec123",
    ]);
    expect(result).toEqual({ id: "rec123", fields: {} });
    expect(spawnMock).toHaveBeenCalledWith(
      "pnpm",
      ["cli", "airtable:fetch-record", "--id", "rec123"],
      { cwd: "/fake/integrator", stdio: ["ignore", "pipe", "pipe"] },
    );
  });

  it("parses JSON array stdout", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: ["[1,2,3]"], exitCode: 0 }),
    );
    const result = await runApiIntegrator("airtable:fetch-all");
    expect(result).toEqual([1, 2, 3]);
  });

  it("strips leading non-JSON banners before parsing", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({
        stdout: ['pnpm v10.34.5\nRunning\n{"ok":true}'],
        exitCode: 0,
      }),
    );
    const result = await runApiIntegrator("forms:status");
    expect(result).toEqual({ ok: true });
  });

  it("parses JSON after a debug object printed via console.log", async () => {
    // api-integrator may emit a Composio connection object (single-quoted JS,
    // not valid JSON) before the actual JSON result.
    spawnMock.mockReturnValue(
      makeFakeChild({
        stdout: [
          "{ id: 'ca_abc', status: 'ACTIVE', authConfigId: 'ac_xyz' }\n[\"Course A\",\"Course B\"]",
        ],
        exitCode: 0,
      }),
    );
    const result = await runApiIntegrator("airtable:fetch-all");
    expect(result).toEqual(["Course A", "Course B"]);
  });

  it("strips trailing whitespace after JSON", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: ['{"ok":true}\n\n'], exitCode: 0 }),
    );
    const result = await runApiIntegrator("forms:status");
    expect(result).toEqual({ ok: true });
  });

  it("throws ApiIntegratorError on non-zero exit", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({
        stdout: [],
        stderr: ["command failed\nsecond line"],
        exitCode: 1,
      }),
    );
    await expect(
      runApiIntegrator("registration:publish", ["--id", "rec123"]),
    ).rejects.toMatchObject({
      name: "ApiIntegratorError",
      cmd: "registration:publish",
      exitCode: 1,
      stderr: "command failed\nsecond line",
      stdout: "",
    });
  });

  it("surfaces stdout in ApiIntegratorError when stderr is empty", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({
        stdout: ["esbuild error: version mismatch\n"],
        stderr: [],
        exitCode: 1,
      }),
    );
    try {
      await runApiIntegrator("airtable:fetch-record", ["--id", "rec1"]);
    } catch (e) {
      expect((e as { name: string }).name).toBe("ApiIntegratorError");
      expect((e as { stdout: string }).stdout).toContain("esbuild error");
      expect((e as { message: string }).message).toContain("esbuild error");
    }
  });

  it("throws ApiIntegratorError on spawn error", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ exitCode: null, error: new Error("ENOENT") }),
    );
    await expect(runApiIntegrator("term:ensure")).rejects.toMatchObject({
      name: "ApiIntegratorError",
      cmd: "term:ensure",
      exitCode: 1,
    });
  });

  it("throws ApiIntegratorParseError when stdout has no JSON", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: ["no json here"], exitCode: 0 }),
    );
    await expect(runApiIntegrator("genai:hello")).rejects.toMatchObject({
      name: "ApiIntegratorParseError",
      cmd: "genai:hello",
    });
  });

  it("throws ApiIntegratorParseError when stdout is malformed JSON", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild({ stdout: ["{not valid"], exitCode: 0 }),
    );
    await expect(runApiIntegrator("genai:hello")).rejects.toMatchObject({
      name: "ApiIntegratorParseError",
      cmd: "genai:hello",
    });
  });

  it("uses default integrator dir when env not set (covered by mock)", async () => {
    spawnMock.mockReturnValue(makeFakeChild({ stdout: ["{}"], exitCode: 0 }));
    await runApiIntegrator("term:ensure");
    expect(spawnMock.mock.calls[0]?.[2]?.cwd).toBe("/fake/integrator");
  });
});
