import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_SKEW_SECONDS = 60;

export const GOOGLE_AUTH_SCOPE = {
  cloudPlatform: "https://www.googleapis.com/auth/cloud-platform",
  firebaseDatabase: "https://www.googleapis.com/auth/firebase.database",
  firestore: "https://www.googleapis.com/auth/datastore",
  userInfoEmail: "https://www.googleapis.com/auth/userinfo.email",
} as const;

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

export type GoogleServiceAccountConfig = {
  credentialFilePath?: string;
  credentialsJson?: string;
  scopes?: string[];
};

type TokenCacheEntry = {
  accessToken: string;
  expiresAtEpochSeconds: number;
};

export class GoogleServiceAccountAccessTokenProvider {
  private readonly config: GoogleServiceAccountConfig;
  private tokenCache: TokenCacheEntry | null = null;

  constructor(config: GoogleServiceAccountConfig) {
    this.config = config;
  }

  async getAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
    const now = currentEpochSeconds();
    if (
      this.tokenCache !== null &&
      this.tokenCache.expiresAtEpochSeconds - TOKEN_REFRESH_SKEW_SECONDS > now
    ) {
      return this.tokenCache.accessToken;
    }

    const serviceAccount = this.loadServiceAccount();
    const assertion = buildJwtAssertion(
      serviceAccount,
      now,
      this.config.scopes ?? [GOOGLE_AUTH_SCOPE.firestore],
    );
    const tokenUrl = serviceAccount.token_uri ?? GOOGLE_TOKEN_URL;

    const response = await fetchImpl(tokenUrl, {
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }).toString(),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    const payload = (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      expires_in?: number;
    };

    if (!response.ok || typeof payload.access_token !== "string") {
      const message =
        payload.error_description ??
        payload.error ??
        `Google OAuth token exchange failed with status ${response.status}.`;
      throw new Error(message);
    }

    this.tokenCache = {
      accessToken: payload.access_token,
      expiresAtEpochSeconds: now + (payload.expires_in ?? TOKEN_LIFETIME_SECONDS),
    };

    return payload.access_token;
  }

  private loadServiceAccount(): Required<Pick<ServiceAccountJson, "client_email" | "private_key">> &
    ServiceAccountJson {
    const rawCredentials =
      this.config.credentialsJson ??
      (this.config.credentialFilePath !== undefined
        ? readFileSync(this.config.credentialFilePath, "utf8")
        : undefined);

    if (rawCredentials === undefined) {
      throw new Error(
        "Firestore cloud mode requires GOOGLE_APPLICATION_CREDENTIALS or FIRESTORE_SERVICE_ACCOUNT_JSON.",
      );
    }

    const parsed = JSON.parse(rawCredentials) as ServiceAccountJson;
    if (typeof parsed.client_email !== "string" || parsed.client_email.trim() === "") {
      throw new Error("Service account credentials are missing client_email.");
    }
    if (typeof parsed.private_key !== "string" || parsed.private_key.trim() === "") {
      throw new Error("Service account credentials are missing private_key.");
    }

    return parsed as Required<Pick<ServiceAccountJson, "client_email" | "private_key">> &
      ServiceAccountJson;
  }
}

function buildJwtAssertion(
  serviceAccount: Required<Pick<ServiceAccountJson, "client_email" | "private_key">> &
    ServiceAccountJson,
  nowEpochSeconds: number,
  scopes: string[],
): string {
  const encodedHeader = encodeBase64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const encodedPayload = encodeBase64Url(
    JSON.stringify({
      aud: serviceAccount.token_uri ?? GOOGLE_TOKEN_URL,
      exp: nowEpochSeconds + TOKEN_LIFETIME_SECONDS,
      iat: nowEpochSeconds,
      iss: serviceAccount.client_email,
      scope: scopes.join(" "),
    }),
  );

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key);
  return `${unsignedToken}.${encodeBufferBase64Url(signature)}`;
}

function encodeBase64Url(value: string): string {
  return encodeBufferBase64Url(Buffer.from(value, "utf8"));
}

function encodeBufferBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function currentEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
