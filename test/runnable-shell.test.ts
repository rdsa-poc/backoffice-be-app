import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

type ShellDefinition = {
  environment: Record<string, string>;
  expectedResponse: Record<string, string>;
  logFragment: string;
  name: string;
  repoDirectory: string;
};

type ShellRun = {
  output: string;
  responseBody: Record<string, unknown>;
};

const repoRootDirectory = fileURLToPath(new URL("../../", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const shellDefinitions: ShellDefinition[] = [
  {
    environment: {
      RADIOSA_API_BASE_URL: "http://127.0.0.1:8080",
      RADIOSA_APP_ID: "bof-web",
      RADIOSA_ENVIRONMENT: "local",
    },
    expectedResponse: {
      environmentName: "local",
      service: "bof-web",
      status: "ok",
    },
    logFragment: "bof-web shell listening on http://localhost:",
    name: "bof-web",
    repoDirectory: fileURLToPath(new URL("../../backoffice-web-app/", import.meta.url)),
  },
  {
    environment: {
      RADIOSA_APP_ID: "bof-be",
      RADIOSA_ENVIRONMENT: "local",
      RADIOSA_REALTIME_BASE_URL: "http://127.0.0.1:5001",
    },
    expectedResponse: {
      environmentName: "local",
      service: "bof-be",
      status: "ok",
    },
    logFragment: "bof-be shell listening on http://localhost:",
    name: "bof-be",
    repoDirectory: fileURLToPath(new URL("../", import.meta.url)),
  },
  {
    environment: {
      RADIOSA_APP_ID: "rt-fn",
      RADIOSA_BACKOFFICE_BASE_URL: "http://127.0.0.1:8080",
      RADIOSA_ENVIRONMENT: "local",
    },
    expectedResponse: {
      environmentName: "local",
      service: "rt-fn",
      status: "ok",
      upstream: "http://127.0.0.1:8080",
    },
    logFragment: "rt-fn firebase-aligned shell listening on http://localhost:",
    name: "rt-fn",
    repoDirectory: fileURLToPath(new URL("../../realtime-processing-functions/", import.meta.url)),
  },
];

// Test: starts each runnable shell through its checked-in entrypoint and probes health.
// Validates: RDS-AC-001, RDS-AC-002, RDS-AC-003 (RDS-REQ-013 - Provide a runnable application skeleton for bof-web, RDS-REQ-014 - Provide a runnable application skeleton for bof-be, RDS-REQ-015 - Provide a runnable application skeleton for rt-fn)
test(
  "verification boots each runnable shell and probes its health surface",
  { timeout: 20_000 },
  async () => {
    assert.ok(repoRootDirectory.length > 0);

    for (const shellDefinition of shellDefinitions) {
      const shellRun = await runShell(shellDefinition);
      assert.match(shellRun.output, new RegExp(`${escapeRegExp(shellDefinition.logFragment)}\\d+`));

      for (const [key, expectedValue] of Object.entries(shellDefinition.expectedResponse)) {
        assert.equal(
          shellRun.responseBody[key],
          expectedValue,
          `${shellDefinition.name} ${key} should match the health contract`,
        );
      }
    }
  },
);

async function runShell(shellDefinition: ShellDefinition): Promise<ShellRun> {
  const port = await reservePort();
  const output: string[] = [];
  const childProcess = spawn(npmCommand, ["run", "start"], {
    cwd: shellDefinition.repoDirectory,
    env: {
      ...process.env,
      ...shellDefinition.environment,
      RADIOSA_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  childProcess.stdout.setEncoding("utf8");
  childProcess.stderr.setEncoding("utf8");
  childProcess.stdout.on("data", (chunk: string) => output.push(chunk));
  childProcess.stderr.on("data", (chunk: string) => output.push(chunk));

  try {
    const responseBody = await waitForHealthyShell(childProcess, port, shellDefinition.name, output);
    return {
      output: output.join(""),
      responseBody,
    };
  } finally {
    await stopProcess(childProcess);
  }
}

async function waitForHealthyShell(
  childProcess: ChildProcessWithoutNullStreams,
  port: number,
  shellName: string,
  output: string[],
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 10_000;
  const healthUrl = `http://127.0.0.1:${port}/health`;

  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new Error(
        `${shellName} exited before becoming healthy.\n${output.join("")}`.trim(),
      );
    }

    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        const body = (await response.json()) as Record<string, unknown>;
        return body;
      }
    } catch {
      // The shell may still be starting; keep polling until the deadline.
    }

    await delay(100);
  }

  throw new Error(`${shellName} did not become healthy within 10 seconds.\n${output.join("")}`.trim());
}

async function stopProcess(childProcess: ChildProcessWithoutNullStreams): Promise<void> {
  if (childProcess.exitCode !== null) {
    return;
  }

  childProcess.kill("SIGTERM");
  const forcedShutdown = setTimeout(() => {
    if (childProcess.exitCode === null) {
      childProcess.kill("SIGKILL");
    }
  }, 1_000);

  try {
    await once(childProcess, "exit");
  } finally {
    clearTimeout(forcedShutdown);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not determine a free TCP port."));
        server.close();
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
