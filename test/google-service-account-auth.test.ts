import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  GOOGLE_AUTH_SCOPE,
  GoogleServiceAccountAccessTokenProvider,
} from "../src/infrastructure/persistence/google-service-account-auth.ts";

// Test: service-account access token provider uses the requested OAuth scope.
// Validates: hosted Firebase RTDB projection writes do not reuse the Firestore-only datastore scope.
test("service-account access token provider requests the configured OAuth scope", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const requestedScopes: string[] = [];
  const provider = new GoogleServiceAccountAccessTokenProvider({
    credentialsJson: JSON.stringify({
      client_email: "radiosa-test@radiosa-poc.iam.gserviceaccount.com",
      private_key: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      token_uri: "https://oauth2.googleapis.com/token",
    }),
    scopes: [GOOGLE_AUTH_SCOPE.firebaseDatabase, GOOGLE_AUTH_SCOPE.userInfoEmail],
  });

  const accessToken = await provider.getAccessToken(async (_input, init) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    const assertion = body.get("assertion");
    assert.notEqual(assertion, null);

    const [, encodedPayload] = assertion!.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as { scope?: string };

    requestedScopes.push(payload.scope ?? "");

    return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  });

  assert.equal(accessToken, "token");
  assert.deepEqual(requestedScopes, [
    `${GOOGLE_AUTH_SCOPE.firebaseDatabase} ${GOOGLE_AUTH_SCOPE.userInfoEmail}`,
  ]);
});
