import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { checkGwsAuth, readGwsAuthStatus, hasGwsClient, GwsAuthError } =
  await import("./gws-auth.ts");

interface FakeStream extends EventEmitter {
  setEncoding: (_: string) => void;
}

interface FakeChild extends EventEmitter {
  stdout: FakeStream;
}

function makeFakeChild(stdout: string, error?: Error): FakeChild {
  const stream = new EventEmitter() as FakeStream;
  stream.setEncoding = () => {};
  const child = Object.assign(new EventEmitter(), {
    stdout: stream,
  }) as FakeChild;
  queueMicrotask(() => {
    stream.emit("data", stdout);
    if (error) {
      child.emit("error", error);
    } else {
      child.emit("exit", 0);
    }
  });
  return child;
}

beforeEach(() => {
  spawnMock.mockReset();
});

describe("readGwsAuthStatus", () => {
  it("resolves with parsed AuthStatus JSON", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(
        JSON.stringify({
          auth_method: "none",
          storage: "none",
          client_config_exists: false,
        }),
      ),
    );
    const status = await readGwsAuthStatus();
    expect(status.auth_method).toBe("none");
    expect(status.storage).toBe("none");
  });

  it("rejects with GwsAuthError when gws binary is missing (spawn error)", async () => {
    spawnMock.mockReturnValue(makeFakeChild("", new Error("spawn gws ENOENT")));
    const p = readGwsAuthStatus();
    await expect(p).rejects.toThrow(GwsAuthError);
    await expect(p).rejects.toThrow(/gws binary not found/);
  });

  it("rejects with GwsAuthError on unparseable output", async () => {
    spawnMock.mockReturnValue(makeFakeChild("not json"));
    await expect(readGwsAuthStatus()).rejects.toThrow(/unparseable output/);
  });

  it("spawns gws auth status with stdio pipes", async () => {
    spawnMock.mockReturnValue(makeFakeChild("{}"));
    await readGwsAuthStatus();
    expect(spawnMock).toHaveBeenCalledWith("gws", ["auth", "status"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  });
});

describe("checkGwsAuth", () => {
  it("resolves with status when auth_method=oauth and storage!=none", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(
        JSON.stringify({
          auth_method: "oauth",
          storage: "encrypted",
          credential_source: "file",
        }),
      ),
    );
    const status = await checkGwsAuth();
    expect(status.auth_method).toBe("oauth");
    expect(status.credential_source).toBe("file");
  });

  it("resolves with status when auth_method=oauth2 (real gws 0.22.x value)", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(
        JSON.stringify({
          auth_method: "oauth2",
          storage: "encrypted",
          credential_source: "client_secret.json",
        }),
      ),
    );
    const status = await checkGwsAuth();
    expect(status.auth_method).toBe("oauth2");
  });

  it("rejects with GwsAuthError when auth_method=none", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(JSON.stringify({ auth_method: "none", storage: "none" })),
    );
    const p = checkGwsAuth();
    await expect(p).rejects.toThrow(GwsAuthError);
    await expect(p).rejects.toThrow(/gws is not authenticated/);
  });

  it("rejects when storage=none even if auth_method looks set", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(JSON.stringify({ auth_method: "oauth", storage: "none" })),
    );
    await expect(checkGwsAuth()).rejects.toThrow(/gws is not authenticated/);
  });

  it("rejects when auth_method is missing", async () => {
    spawnMock.mockReturnValue(
      makeFakeChild(JSON.stringify({ storage: "encrypted" })),
    );
    await expect(checkGwsAuth()).rejects.toThrow(/gws is not authenticated/);
  });
});

describe("hasGwsClient", () => {
  it("returns true when client_config_exists is true", () => {
    expect(
      hasGwsClient({ auth_method: "none", client_config_exists: true }),
    ).toBe(true);
  });

  it("returns false when client_config_exists is false and no env vars", () => {
    delete process.env["GOOGLE_WORKSPACE_CLI_CLIENT_ID"];
    delete process.env["GOOGLE_WORKSPACE_CLI_CLIENT_SECRET"];
    expect(
      hasGwsClient({ auth_method: "none", client_config_exists: false }),
    ).toBe(false);
  });

  it("returns true when env vars are set even if file is absent", () => {
    process.env["GOOGLE_WORKSPACE_CLI_CLIENT_ID"] = "test-id";
    process.env["GOOGLE_WORKSPACE_CLI_CLIENT_SECRET"] = "test-secret";
    expect(
      hasGwsClient({ auth_method: "none", client_config_exists: false }),
    ).toBe(true);
    delete process.env["GOOGLE_WORKSPACE_CLI_CLIENT_ID"];
    delete process.env["GOOGLE_WORKSPACE_CLI_CLIENT_SECRET"];
  });
});
