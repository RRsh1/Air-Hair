import "server-only";
import { localDiskStorage } from "./local-disk";
import type { ObjectStorage } from "./types";

export type { ObjectStorage } from "./types";

let instance: ObjectStorage | undefined;

/**
 * STORAGE_DRIVER=local (default in development) writes under STORAGE_LOCAL_DIR (.data/storage).
 * Production requires a real driver; R2 is added before the pilot.
 */
export function getStorage(): ObjectStorage {
  if (!instance) {
    const driver = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "" : "local");
    if (driver !== "local") throw new Error(`Storage driver "${driver}" is not configured`);
    instance = localDiskStorage(process.env.STORAGE_LOCAL_DIR ?? ".data/storage");
  }
  return instance;
}
