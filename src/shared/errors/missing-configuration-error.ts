export class MissingConfigurationError extends Error {
  readonly missingKeys: string[];

  constructor(serviceName: string, missingKeys: string[]) {
    const label = missingKeys.length === 1 ? "value" : "values";
    super(
      `Missing required configuration ${label} for ${serviceName}: ${missingKeys.join(", ")}`,
    );
    this.name = "MissingConfigurationError";
    this.missingKeys = missingKeys;
  }
}
