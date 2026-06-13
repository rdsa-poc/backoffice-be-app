import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
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
  healthResponse: {
    body: Record<string, unknown>;
    statusCode: number;
  };
  output: string;
};

const repoRootDirectory = fileURLToPath(new URL("../../", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const runnableShellProbeImport = fileURLToPath(
  new URL("./helpers/runnable-shell-probe.mjs", import.meta.url),
);

const shellDefinition: ShellDefinition = {
  environment: {
    BOF_BE_STREAM_REPOSITORY: "memory",
    RADIOSA_ENVIRONMENT: "local",
    RT_FN_BASE_URL: "http://127.0.0.1:5001",
  },
  expectedResponse: {
    environmentName: "local",
    service: "bof-be",
    status: "ok",
  },
  logFragment: "bof-be shell listening on http://127.0.0.1:",
  name: "bof-be",
  repoDirectory: fileURLToPath(new URL("../", import.meta.url)),
};

// Test: starts the bof-be runnable shell through its checked-in entrypoint and validates /health without binding sockets.
// Validates: RDS-AC-002 (RDS-REQ-014 - Provide a runnable application skeleton for bof-be)
test(
  "verification boots the bof-be runnable shell and validates its health surface in constrained environments",
  { timeout: 20_000 },
  async () => {
    assert.ok(repoRootDirectory.length > 0);

    const shellRun = await runShell(shellDefinition);
    assert.match(shellRun.output, new RegExp(`${escapeRegExp(shellDefinition.logFragment)}\\d+`));
    assert.equal(shellRun.healthResponse.statusCode, 200, `${shellDefinition.name} health should return HTTP 200`);

    for (const [key, expectedValue] of Object.entries(shellDefinition.expectedResponse)) {
      assert.equal(
        shellRun.healthResponse.body[key],
        expectedValue,
        `${shellDefinition.name} ${key} should match the health contract`,
      );
    }
  },
);

async function runShell(shellDefinition: ShellDefinition): Promise<ShellRun> {
  const temporaryDirectory = await mkdtemp(`${os.tmpdir()}/radiosa-runnable-shell-`);
  const healthOutputPath = `${temporaryDirectory}/${shellDefinition.name}-health.json`;
  const output: string[] = [];
  const childProcess = spawn(npmCommand, ["run", "start"], {
    cwd: shellDefinition.repoDirectory,
    env: {
      ...process.env,
      ...shellDefinition.environment,
      NODE_OPTIONS: buildNodeOptions(),
      RADIOSA_HEALTH_OUTPUT_FILE: healthOutputPath,
      RADIOSA_PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  childProcess.stdout.setEncoding("utf8");
  childProcess.stderr.setEncoding("utf8");
  childProcess.stdout.on("data", (chunk: string) => output.push(chunk));
  childProcess.stderr.on("data", (chunk: string) => output.push(chunk));

  try {
    const healthResponse = await waitForHealthyShell(
      childProcess,
      healthOutputPath,
      shellDefinition.name,
      output,
    );
    return {
      healthResponse,
      output: output.join(""),
    };
  } finally {
    await stopProcess(childProcess);
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function waitForHealthyShell(
  childProcess: ChildProcessWithoutNullStreams,
  healthOutputPath: string,
  shellName: string,
  output: string[],
): Promise<{
  body: Record<string, unknown>;
  statusCode: number;
}> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const rawOutput = await readFile(healthOutputPath, "utf8");
      const parsedOutput = JSON.parse(rawOutput) as {
        body?: Record<string, unknown>;
        error?: string;
        statusCode?: number;
      };

      if (parsedOutput.error !== undefined) {
        throw new Error(
          `${shellName} failed during the sandbox-friendly health probe.\n${parsedOutput.error}\n${output.join("")}`.trim(),
        );
      }

      if (parsedOutput.body !== undefined && parsedOutput.statusCode !== undefined) {
        return {
          body: parsedOutput.body,
          statusCode: parsedOutput.statusCode,
        };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (childProcess.exitCode !== null) {
      throw new Error(`${shellName} exited before its health contract was captured.\n${output.join("")}`.trim());
    }

    await delay(100);
  }

  throw new Error(`${shellName} did not expose its health contract within 10 seconds.\n${output.join("")}`.trim());
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

function buildNodeOptions(): string {
  const importFlag = `--import=${runnableShellProbeImport}`;
  return process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ${importFlag}` : importFlag;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
