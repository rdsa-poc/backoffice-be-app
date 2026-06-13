import type { AppConfig } from "../config/app-config.ts";
import { FirestoreStreamRepository } from "./firestore-stream-repository.ts";
import { createSeededStreamRepository } from "./in-memory-stream-repository.ts";
import type { StreamRepository } from "./stream-repository.ts";

export async function createStreamRepository(config: AppConfig): Promise<StreamRepository> {
  if (config.streamPersistence.driver === "memory") {
    return createSeededStreamRepository();
  }

  const repository = new FirestoreStreamRepository(config.streamPersistence);
  await repository.seedIfEmpty();
  return repository;
}
