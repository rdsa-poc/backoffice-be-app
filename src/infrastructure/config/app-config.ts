import { existsSync, readFileSync } from "node:fs";

import { MissingConfigurationError } from "../../shared/errors/missing-configuration-error.ts";

const ENVIRONMENT_FILE_URL = new URL("../../../../.env", import.meta.url);
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_APP_ID = "bof-be";
const REQUIRED_KEYS = [
  "RADIOSA_ENVIRONMENT",
  "RT_FN_BASE_URL",
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];
type EnvironmentSource = Record<string, string | undefined>;

export type AppConfig = {
  appId: string;
  environmentName: string;
  host: string;
  port: number;
  realtimeBaseUrl: string;
};

export function parseEnvironmentFile(text: string): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const line of text.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    environment[key] = normalizeEnvironmentValue(rawValue);
  }

  return environment;
}

export function loadLocalEnvironment(environment: EnvironmentSource = process.env): void {
  if (!existsSync(ENVIRONMENT_FILE_URL)) {
    return;
  }

  const fileContents = readFileSync(ENVIRONMENT_FILE_URL, "utf8");
  const parsedEnvironment = parseEnvironmentFile(fileContents);

  for (const [key, value] of Object.entries(parsedEnvironment)) {
    if (environment[key] === undefined) {
      environment[key] = value;
    }
  }
}

export function resolveAppConfig(environment: EnvironmentSource = process.env): AppConfig {
  const missingKeys = REQUIRED_KEYS.filter((key) => {
    if (key === "RT_FN_BASE_URL") {
      return readDiscoveryValue(environment, key, "RADIOSA_REALTIME_BASE_URL") === undefined;
    }

    return readRequiredValue(environment, key) === undefined;
  });
  if (missingKeys.length > 0) {
    throw new MissingConfigurationError("bof-be", missingKeys);
  }

  const configuredPort = Number(environment.RADIOSA_PORT ?? environment.PORT ?? DEFAULT_PORT);

  return {
    appId: readOptionalValue(environment, "RADIOSA_APP_ID") ?? DEFAULT_APP_ID,
    environmentName: readRequiredValue(environment, "RADIOSA_ENVIRONMENT")!,
    host: readOptionalValue(environment, "RADIOSA_BIND_HOST") ?? DEFAULT_HOST,
    port: Number.isFinite(configuredPort) ? configuredPort : DEFAULT_PORT,
    realtimeBaseUrl: readDiscoveryValue(
      environment,
      "RT_FN_BASE_URL",
      "RADIOSA_REALTIME_BASE_URL",
    )!,
  };
}

export function loadAppConfig(environment: EnvironmentSource = process.env): AppConfig {
  loadLocalEnvironment(environment);
  return resolveAppConfig(environment);
}

function normalizeEnvironmentValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readRequiredValue(
  environment: EnvironmentSource,
  key: RequiredKey,
): string | undefined {
  return readOptionalValue(environment, key);
}

function readOptionalValue(
  environment: EnvironmentSource,
  key: string,
): string | undefined {
  const value = environment[key]?.trim();
  return value === "" ? undefined : value;
}

function readDiscoveryValue(
  environment: EnvironmentSource,
  primaryKey: RequiredKey,
  legacyKey: string,
): string | undefined {
  return readOptionalValue(environment, primaryKey) ?? readOptionalValue(environment, legacyKey);
}
