import type { AppConfig } from "../config/app-config.ts";
import {
  FirebaseRtdbStreamProjectionStore,
} from "./firebase-rtdb-stream-projection-store.ts";
import {
  createSeededStreamProjectionStore,
  type StreamProjectionStore,
} from "./stream-projection-store.ts";
import { seededStreams } from "./stream-repository.ts";

export function createStreamProjectionStore(config: AppConfig): StreamProjectionStore {
  if (config.streamProjectionPersistence?.driver !== "firebase-rtdb") {
    return createSeededStreamProjectionStore(seededStreams);
  }

  return new FirebaseRtdbStreamProjectionStore(config.streamProjectionPersistence);
}
