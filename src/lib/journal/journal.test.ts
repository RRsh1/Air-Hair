import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { testDatabase, testKeyring } from "../../../test/db";
import { photos } from "../../db/schema";
import type { Database } from "../../db/types";
import { buildAuth } from "../auth/build-auth";
import { provisionClinic } from "../clinic/provision";
import { createPatient } from "../patients/create-patient";
import type { ObjectStorage } from "../storage/types";
import { setActualSurgeryDate } from "../treatments/surgery-date";
import { buildFilmStrip } from "./film-strip";
import { inspectJpeg } from "./jpeg";
import { anglesOpenNow, ghostPhotoFor, loadPatientJournal, photoKeyForPatient, savePatientPhoto } from "./patient-journal";

/** Smallest byte sequence inspectJpeg accepts: SOI + SOF0 with the given size. */
function fakeJpeg(width = 1200, height = 900): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ]);
}

function memoryStorage(): ObjectStorage & { keys: () => string[] } {
  const store = new Map<string, Uint8Array>();
  return {
    put: async (key, body) => void store.set(key, body),
    get: async (key) => (store.has(key) ? { body: store.get(key)!, contentType: "image/jpeg" } : null),
    delete: async (key) => void store.delete(key),
    keys: () => [...store.keys()],
  };
}

const keyring = testKeyring();
const TZ_NOON = (date: string) => new Date(`${date}T09:00:00Z`); // 12:00 in Israel (summer)
let db: Database;
let clinicId = "";
let patientId = "";
let treatmentId = "";
const storage = memoryStorage();

const journal = () => loadPatientJournal(db, { clinicId, patientId, keyring }).then((j) => j!);

beforeAll(async () => {
  db = await testDatabase();
  const auth = buildAuth(db, { secret: "test-secret-test-secret-test-secret-0", baseURL: "http://localhost:3000", secureCookies: false, sendPasswordLink: async () => {} });
  clinicId = (await provisionClinic(db, auth, { clinicName: "מרפאה", slug: "j", adminEmail: "j@test.com", adminName: "א" })).clinicId;
  const created = await createPatient(db, { clinicId, fullName: "דנה כהן", nationalId: "123456782", phone: "0501234567", plannedSurgeryDate: "2026-06-10" }, keyring);
  if (created.status !== "created") throw new Error(created.status);
  ({ patientId, treatmentId } = created);
}, 60_000);

describe("inspectJpeg", () => {
  it("reads dimensions and rejects non-JPEG bytes", () => {
    expect(inspectJpeg(fakeJpeg(1600, 1200))).toEqual({ width: 1600, height: 1200 });
    expect(inspectJpeg(new TextEncoder().encode("<svg>"))).toBeNull();
    expect(inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe("before surgery", () => {
  it("opens all three angles for the pre-op capture", async () => {
    const j = await journal();
    expect(j.firstName).toBe("דנה");
    expect(anglesOpenNow(j, TZ_NOON("2026-06-01"))).toEqual(["front", "top", "back"]);
    expect(buildFilmStrip(j, TZ_NOON("2026-06-01"))[0]).toMatchObject({ key: "pre", status: "today" });
  });

  it("saves pre-op photos into one entry and refuses bad images", async () => {
    const now = TZ_NOON("2026-06-01");
    expect((await savePatientPhoto(db, storage, { journal: await journal(), angle: "front", bytes: fakeJpeg(), ip: null, now })).status).toBe("saved");
    expect((await savePatientPhoto(db, storage, { journal: await journal(), angle: "top", bytes: fakeJpeg(), ip: null, now })).status).toBe("saved");
    expect(await savePatientPhoto(db, storage, { journal: await journal(), angle: "back", bytes: new Uint8Array([1, 2, 3]), ip: null, now })).toEqual({
      status: "invalid_image",
      reason: "format",
    });
    expect(await savePatientPhoto(db, storage, { journal: await journal(), angle: "back", bytes: fakeJpeg(8000, 100), ip: null, now })).toEqual({
      status: "invalid_image",
      reason: "dimensions",
    });
    const j = await journal();
    expect(j.entries).toHaveLength(1);
    expect(Object.keys(j.entries[0].photos).sort()).toEqual(["front", "top"]);
  });

  it("a retake replaces the photo and deletes the old file", async () => {
    const now = TZ_NOON("2026-06-01");
    const before = storage.keys().length;
    const first = (await journal()).entries[0].photos.front!.id;
    const retake = await savePatientPhoto(db, storage, { journal: await journal(), angle: "front", bytes: fakeJpeg(), ip: null, now });
    expect(retake.status).toBe("saved");
    expect(storage.keys().length).toBe(before);
    expect(await db.select().from(photos).where(eq(photos.id, first))).toHaveLength(0);
  });

  it("does not reopen the pre-op capture on a later day once it was used", async () => {
    expect(anglesOpenNow(await journal(), TZ_NOON("2026-06-03"))).toEqual([]);
  });
});

describe("after surgery", () => {
  beforeAll(async () => {
    await setActualSurgeryDate(db, { clinicId, treatmentId, actualDate: "2026-06-10", staffId: null });
  });

  it("numbers the days from the actual surgery date and keeps pre-op photos pre-op", async () => {
    const strip = buildFilmStrip(await journal(), TZ_NOON("2026-06-12"));
    expect(strip[0]).toMatchObject({ key: "pre", status: "partial" });
    expect(strip.find((f) => f.key === "0")).toMatchObject({ status: "missed", date: "2026-06-10" });
    expect(strip.find((f) => f.key === "2")).toMatchObject({ status: "today", date: "2026-06-12" });
    expect(strip.find((f) => f.key === "3")).toMatchObject({ status: "upcoming" });
  });

  it("uses the latest earlier photo of the same angle as the alignment ghost", async () => {
    const j = await journal();
    expect(ghostPhotoFor(j, "top", TZ_NOON("2026-06-12"))).toBe(j.entries[0].photos.top!.id);
    expect(ghostPhotoFor(j, "back", TZ_NOON("2026-06-12"))).toBeNull();
  });

  it("refuses photos on a day with no capture scheduled", async () => {
    const result = await savePatientPhoto(db, storage, { journal: await journal(), angle: "front", bytes: fakeJpeg(), ip: null, now: TZ_NOON("2026-06-25") });
    expect(result.status).toBe("not_allowed");
  });

  it("serves photo keys only to their owner", async () => {
    const photoId = (await journal()).entries[0].photos.top!.id;
    expect(await photoKeyForPatient(db, { clinicId, patientId, photoId })).toContain(patientId);
    expect(await photoKeyForPatient(db, { clinicId, patientId: crypto.randomUUID(), photoId })).toBeNull();
    expect(await photoKeyForPatient(db, { clinicId, patientId, photoId: "../../etc/passwd" })).toBeNull();
  });
});
