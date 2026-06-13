import type { StreamRecord } from "../../domain/stream/stream.ts";
import type { FirebaseRtdbProjectionPersistenceConfig } from "../config/app-config.ts";
import {
  GOOGLE_AUTH_SCOPE,
  GoogleServiceAccountAccessTokenProvider,
} from "./google-service-account-auth.ts";
import type { StreamProjectionStore } from "./stream-projection-store.ts";

type FirebaseErrorResponse = {
  error?: string;
};

export class FirebaseRtdbStreamProjectionStore implements StreamProjectionStore {
  private readonly accessTokenProvider: GoogleServiceAccountAccessTokenProvider | null;
  private readonly config: FirebaseRtdbProjectionPersistenceConfig;

  constructor(config: FirebaseRtdbProjectionPersistenceConfig) {
    this.config = config;
    this.accessTokenProvider = config.useEmulator
      ? null
      : new GoogleServiceAccountAccessTokenProvider({
          credentialFilePath: config.serviceAccountCredentialFilePath,
          credentialsJson: config.serviceAccountCredentialsJson,
          scopes: [
            GOOGLE_AUTH_SCOPE.firebaseDatabase,
            GOOGLE_AUTH_SCOPE.userInfoEmail,
          ],
        });
  }

  async publish(stream: StreamRecord): Promise<void> {
    await this.request(this.projectionUrl(stream.streamId), {
      body: JSON.stringify({
        imageUrl: stream.imageUrl,
        streamId: stream.streamId,
        streamUrl: stream.streamUrl,
        summary: stream.summary,
        title: stream.title,
      }),
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      method: "PUT",
    });
  }

  async unpublish(streamId: string): Promise<void> {
    await this.request(this.projectionUrl(streamId), {
      method: "DELETE",
    });
  }

  private projectionUrl(streamId: string): string {
    const url = new URL(`/mobile/streams/${encodeURIComponent(streamId)}.json`, this.config.baseUrl);
    if (this.config.namespace !== undefined) {
      url.searchParams.set("ns", this.config.namespace);
    }

    return url.toString();
  }

  private async request(url: string, init: RequestInit): Promise<void> {
    const headers = new Headers(init.headers);

    if (this.accessTokenProvider !== null) {
      const accessToken = await this.accessTokenProvider.getAccessToken();
      headers.set("authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.ok) {
      return;
    }

    const fallbackMessage = `Realtime Database projection request failed with status ${response.status}.`;
    let message = fallbackMessage;

    try {
      const payload = (await response.json()) as FirebaseErrorResponse;
      message = payload.error ?? fallbackMessage;
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }
}
