import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type ObjectStorage } from "./types";

/**
 * Development storage under a local directory (default .data/storage, git-ignored).
 * The content type is kept in a sidecar file so reads return what was written.
 */
export function localDiskStorage(root: string): ObjectStorage {
  const resolve = (key: string) => {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    async put(key, body, contentType) {
      const file = resolve(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body, { mode: 0o600 });
      await writeFile(`${file}.type`, contentType, { mode: 0o600 });
    },
    async get(key) {
      const file = resolve(key);
      try {
        const [body, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
        return { body: new Uint8Array(body), contentType };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      const file = resolve(key);
      await rm(file, { force: true });
      await rm(`${file}.type`, { force: true });
    },
  };
}
