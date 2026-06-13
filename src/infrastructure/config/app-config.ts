import { existsSync, readFileSync } from "node:fs";

import { MissingConfigurationError } from "../../shared/errors/missing-configuration-error.ts";

const ENVIRONMENT_FILE_URL = new URL("../../../../.env", import.meta.url);
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8080;
const DEFAULT_APP_ID = "bof-be";
const DEFAULT_FIRESTORE_API_BASE_URL = "https://firestore.googleapis.com";
const DEFAULT_FIRESTORE_COLLECTION = "streams";
const DEFAULT_FIRESTORE_DATABASE_ID = "backoffice";
const DEFAULT_FIRESTORE_EMULATOR_HOST = "127.0.0.1:8081";
const DEFAULT_FIRESTORE_LOCATION = "europe-west1";
const DEFAULT_FIRESTORE_PROJECT_ID = "radiosa-poc";
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
  streamProjectionPersistence?: StreamProjectionPersistenceConfig;
  streamPersistence: StreamPersistenceConfig;
};

export type FirebaseRtdbProjectionPersistenceConfig = {
  baseUrl: string;
  driver: "firebase-rtdb";
  namespace?: string;
  serviceAccountCredentialsJson?: string;
  serviceAccountCredentialFilePath?: string;
  useEmulator: boolean;
};

export type MemoryProjectionPersistenceConfig = {
  driver: "memory";
};

export type StreamProjectionPersistenceConfig =
  | FirebaseRtdbProjectionPersistenceConfig
  | MemoryProjectionPersistenceConfig;

export type FirestorePersistenceConfig = {
  apiBaseUrl: string;
  collectionName: string;
  databaseId: string;
  driver: "firestore";
  location: string;
  projectId: string;
  serviceAccountCredentialsJson?: string;
  serviceAccountCredentialFilePath?: string;
  useEmulator: boolean;
};

export type MemoryPersistenceConfig = {
  driver: "memory";
};

export type StreamPersistenceConfig =
  | FirestorePersistenceConfig
  | MemoryPersistenceConfig;

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
    streamProjectionPersistence: resolveStreamProjectionPersistenceConfig(environment),
    streamPersistence: resolveStreamPersistenceConfig(environment),
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

function resolveStreamPersistenceConfig(
  environment: EnvironmentSource,
): StreamPersistenceConfig {
  const driver = readOptionalValue(environment, "BOF_BE_STREAM_REPOSITORY") ?? "memory";
  if (driver !== "firestore") {
    return { driver: "memory" };
  }

  const emulatorHost = readOptionalValue(environment, "FIRESTORE_EMULATOR_HOST");
  const useEmulator = emulatorHost !== undefined;

  return {
    apiBaseUrl: useEmulator
      ? `http://${emulatorHost ?? DEFAULT_FIRESTORE_EMULATOR_HOST}`
      : readOptionalValue(environment, "FIRESTORE_API_BASE_URL") ??
        DEFAULT_FIRESTORE_API_BASE_URL,
    collectionName:
      readOptionalValue(environment, "BOF_BE_STREAM_COLLECTION") ??
      DEFAULT_FIRESTORE_COLLECTION,
    databaseId:
      readOptionalValue(environment, "FIRESTORE_DATABASE_ID") ??
      DEFAULT_FIRESTORE_DATABASE_ID,
    driver: "firestore",
    location:
      readOptionalValue(environment, "FIRESTORE_LOCATION") ?? DEFAULT_FIRESTORE_LOCATION,
    projectId:
      readOptionalValue(environment, "FIRESTORE_PROJECT_ID") ??
      readOptionalValue(environment, "GOOGLE_CLOUD_PROJECT") ??
      DEFAULT_FIRESTORE_PROJECT_ID,
    serviceAccountCredentialsJson:
      readOptionalValue(environment, "FIRESTORE_SERVICE_ACCOUNT_JSON"),
    serviceAccountCredentialFilePath:
      readOptionalValue(environment, "GOOGLE_APPLICATION_CREDENTIALS"),
    useEmulator,
  };
}

function resolveStreamProjectionPersistenceConfig(
  environment: EnvironmentSource,
): StreamProjectionPersistenceConfig {
  const emulatorHost = readOptionalValue(environment, "FIREBASE_DATABASE_EMULATOR_HOST");
  const projectId =
    readOptionalValue(environment, "FIRESTORE_PROJECT_ID") ??
    readOptionalValue(environment, "GOOGLE_CLOUD_PROJECT") ??
    DEFAULT_FIRESTORE_PROJECT_ID;

  if (emulatorHost !== undefined) {
    return {
      baseUrl: `http://${emulatorHost}`,
      driver: "firebase-rtdb",
      namespace: `${projectId}-default-rtdb`,
      useEmulator: true,
    };
  }

  const databaseUrl = readOptionalValue(environment, "FIREBASE_DATABASE_URL");
  if (databaseUrl === undefined) {
    return { driver: "memory" };
  }

  return {
    baseUrl: databaseUrl,
    driver: "firebase-rtdb",
    serviceAccountCredentialsJson:
      readOptionalValue(environment, "FIRESTORE_SERVICE_ACCOUNT_JSON"),
    serviceAccountCredentialFilePath:
      readOptionalValue(environment, "GOOGLE_APPLICATION_CREDENTIALS"),
    useEmulator: false,
  };
}
