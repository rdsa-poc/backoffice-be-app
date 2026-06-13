import {
  type StreamRecord,
  type StreamStatus,
} from "../../domain/stream/stream.ts";
import { StreamNotFoundError } from "../../shared/errors/stream-errors.ts";
import type { FirestorePersistenceConfig } from "../config/app-config.ts";
import {
  GOOGLE_AUTH_SCOPE,
  GoogleServiceAccountAccessTokenProvider,
} from "./google-service-account-auth.ts";
import { seededStreams, type StreamRepository } from "./stream-repository.ts";

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
  name?: string;
};

type FirestoreErrorResponse = {
  error?: {
    message?: string;
    status?: string;
  };
};

type FirestoreListResponse = {
  documents?: FirestoreDocument[];
};

type FirestoreValue = {
  stringValue?: string;
};

export class FirestoreStreamRepository implements StreamRepository {
  private readonly config: FirestorePersistenceConfig;
  private readonly accessTokenProvider: GoogleServiceAccountAccessTokenProvider | null;

  constructor(config: FirestorePersistenceConfig) {
    this.config = config;
    this.accessTokenProvider = config.useEmulator
      ? null
      : new GoogleServiceAccountAccessTokenProvider({
          credentialFilePath: config.serviceAccountCredentialFilePath,
          credentialsJson: config.serviceAccountCredentialsJson,
          scopes: [GOOGLE_AUTH_SCOPE.firestore],
        });
  }

  async seedIfEmpty(): Promise<void> {
    const existingStreams = await this.list();
    if (existingStreams.length > 0) {
      return;
    }

    for (const stream of seededStreams) {
      await this.writeDocument(stream.streamId, stream);
    }
  }

  async list(): Promise<StreamRecord[]> {
    const response = await this.request(this.collectionUrl());
    const payload = (await response.json()) as FirestoreListResponse;
    return (payload.documents ?? []).map((document) => this.decodeDocument(document));
  }

  async getById(streamId: string): Promise<StreamRecord> {
    const response = await this.request(this.documentUrl(streamId), { allowNotFound: true });
    if (response.status === 404) {
      throw new StreamNotFoundError(streamId);
    }

    return this.decodeDocument((await response.json()) as FirestoreDocument);
  }

  async create(record: StreamRecord): Promise<StreamRecord> {
    await this.writeDocument(record.streamId, record);
    return cloneStream(record);
  }

  async update(record: StreamRecord): Promise<StreamRecord> {
    await this.getById(record.streamId);
    await this.writeDocument(record.streamId, record);
    return cloneStream(record);
  }

  async delete(streamId: string): Promise<{ deleted: true; streamId: string }> {
    const existing = await this.getById(streamId);
    const response = await this.request(this.documentUrl(streamId), {
      allowNotFound: true,
      init: { method: "DELETE" },
    });
    if (response.status === 404) {
      throw new StreamNotFoundError(streamId);
    }

    return { deleted: true, streamId };
  }

  private async writeDocument(streamId: string, record: StreamRecord): Promise<void> {
    await this.request(this.documentUrl(streamId), {
      init: {
        body: JSON.stringify({ fields: this.encodeRecord(record) }),
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        method: "PATCH",
      },
    });
  }

  private encodeRecord(record: StreamRecord): Record<string, FirestoreValue> {
    return {
      createdAt: { stringValue: record.createdAt },
      imageUrl: { stringValue: record.imageUrl },
      status: { stringValue: record.status },
      streamId: { stringValue: record.streamId },
      streamUrl: { stringValue: record.streamUrl },
      summary: { stringValue: record.summary },
      title: { stringValue: record.title },
      updatedAt: { stringValue: record.updatedAt },
    };
  }

  private decodeDocument(document: FirestoreDocument): StreamRecord {
    const fields = document.fields ?? {};

    return cloneStream({
      createdAt: this.readStringField(fields, "createdAt"),
      imageUrl: this.readStringField(fields, "imageUrl"),
      status: this.readStatusField(fields),
      streamId: this.readStringField(fields, "streamId"),
      streamUrl: this.readStringField(fields, "streamUrl"),
      summary: this.readStringField(fields, "summary"),
      title: this.readStringField(fields, "title"),
      updatedAt: this.readStringField(fields, "updatedAt"),
    });
  }

  private readStatusField(fields: Record<string, FirestoreValue>): StreamStatus {
    const status = this.readStringField(fields, "status");
    if (status === "draft" || status === "active" || status === "inactive") {
      return status;
    }

    throw new Error(`Unsupported Firestore stream status: ${status}`);
  }

  private readStringField(
    fields: Record<string, FirestoreValue>,
    fieldName: keyof StreamRecord,
  ): string {
    const value = fields[fieldName]?.stringValue;
    if (typeof value !== "string") {
      throw new Error(`Firestore stream document is missing ${fieldName}.`);
    }

    return value;
  }

  private collectionUrl(): string {
    return `${this.config.apiBaseUrl}/v1/${this.documentRootPath()}/${this.config.collectionName}`;
  }

  private documentUrl(streamId: string): string {
    return `${this.collectionUrl()}/${encodeURIComponent(streamId)}`;
  }

  private documentRootPath(): string {
    return `projects/${this.config.projectId}/databases/${this.config.databaseId}/documents`;
  }

  private async request(
    url: string,
    options: {
      allowNotFound?: boolean;
      init?: RequestInit;
    } = {},
  ): Promise<Response> {
    const headers = new Headers(options.init?.headers);
    if (this.accessTokenProvider !== null) {
      const accessToken = await this.accessTokenProvider.getAccessToken();
      headers.set("authorization", `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      ...options.init,
      headers,
    });

    if (response.ok || (options.allowNotFound === true && response.status === 404)) {
      return response;
    }

    const fallbackMessage = `Firestore request failed with status ${response.status}.`;
    let message = fallbackMessage;

    try {
      const payload = (await response.json()) as FirestoreErrorResponse;
      message = payload.error?.message ?? payload.error?.status ?? fallbackMessage;
    } catch {
      message = fallbackMessage;
    }

    throw new Error(message);
  }
}

function cloneStream(stream: StreamRecord): StreamRecord {
  return structuredClone(stream);
}
