import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Hair&Air schema.
 *
 * Conventions
 *  - Every tenant-owned table carries clinic_id (directly or through its parent), so
 *    multi-clinic support and Row Level Security need no structural change.
 *  - Identifying patient fields are stored only as AES-256-GCM ciphertext (*_enc)
 *    plus an HMAC blind index (*_idx) for exact-match lookup. See src/lib/crypto.
 *  - Day numbers are never stored; they are derived from captured_at and the
 *    treatment's actual surgery date. See src/lib/timeline/days.ts.
 *  - Deleting a patient cascades to everything they own; audit_log keeps only
 *    a non-identifying record (no FK, so it survives the deletion).
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ─── Enums ────────────────────────────────────────────────────────────────────

export const timelinePhase = pgEnum("timeline_phase", ["pre_op", "post_op"]);
export const photoAngle = pgEnum("photo_angle", ["front", "top", "back"]);
export const treatmentStatus = pgEnum("treatment_status", ["scheduled", "performed"]);
export const publishStatus = pgEnum("publish_status", ["draft", "published", "superseded"]);
export const contentType = pgEnum("content_type", ["tip", "recommendation", "instruction"]);
export const assetKind = pgEnum("asset_kind", ["logo", "background", "document", "signature"]);
export const legalDocumentKind = pgEnum("legal_document_kind", ["privacy_policy", "consent"]);
export const legalDocumentFormat = pgEnum("legal_document_format", ["file", "text"]);
export const actorKind = pgEnum("actor_kind", ["staff", "patient", "system"]);

// ─── Clinic & configuration ───────────────────────────────────────────────────

export const clinics = pgTable("clinics", {
  id: id(),
  name: text("name").notNull(),
  timeZone: text("time_zone").notNull().default("Asia/Jerusalem"),
  createdAt: createdAt(),
});

/** Versioned JSON, always read through parseClinicSettings(). */
export const clinicSettings = pgTable("clinic_settings", {
  clinicId: uuid("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

/** Design tokens for the patient interface; one draft and one published row at a time. */
export const clinicThemes = pgTable(
  "clinic_themes",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    status: publishStatus("status").notNull().default("draft"),
    version: integer("version").notNull(),
    tokens: jsonb("tokens").notNull(),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("clinic_themes_clinic_version_uq").on(t.clinicId, t.version)],
);

export const clinicAssets = pgTable(
  "clinic_assets",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("clinic_assets_clinic_kind_idx").on(t.clinicId, t.kind)],
);

// ─── Staff, roles, capabilities ───────────────────────────────────────────────

/** System roles (admin, doctor) are seeded per clinic; custom roles are just more rows. */
export const roles = pgTable(
  "roles",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    systemKey: text("system_key"), // 'admin' | 'doctor' | null for custom roles
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("roles_clinic_name_uq").on(t.clinicId, t.name),
    uniqueIndex("roles_clinic_system_key_uq").on(t.clinicId, t.systemKey),
    check("roles_system_key_ck", sql`${t.systemKey} is null or ${t.systemKey} in ('admin', 'doctor')`),
  ],
);

/** Only used by custom roles; system roles derive capabilities from clinic settings. */
export const roleCapabilities = pgTable(
  "role_capabilities",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.capability] })],
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    /** Link to the auth library's user record (Better Auth), set when the account is activated. */
    authUserId: text("auth_user_id").unique(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    totpSecretEnc: text("totp_secret_enc"),
    createdAt: createdAt(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("staff_users_clinic_email_uq").on(t.clinicId, sql`lower(${t.email})`)],
);

// ─── Patients ─────────────────────────────────────────────────────────────────

export const patients = pgTable(
  "patients",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    fullNameEnc: text("full_name_enc").notNull(),
    nationalIdEnc: text("national_id_enc").notNull(),
    nationalIdIdx: text("national_id_idx").notNull(),
    phoneEnc: text("phone_enc").notNull(),
    phoneIdx: text("phone_idx").notNull(),
    /** Encryption key version of the *_enc columns, for re-encryption after rotation. */
    keyVersion: integer("key_version").notNull(),
    createdAt: createdAt(),
    createdBy: uuid("created_by").references(() => staffUsers.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("patients_clinic_national_id_uq").on(t.clinicId, t.nationalIdIdx),
    index("patients_login_idx").on(t.nationalIdIdx, t.phoneIdx),
  ],
);

/** Many-to-many from day one, even while every doctor sees every patient. */
export const patientAssignments = pgTable(
  "patient_assignments",
  {
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.staffId] }), index("patient_assignments_staff_idx").on(t.staffId)],
);

// ─── Timeline templates (editable by the clinic) ──────────────────────────────

export const timelineTemplates = pgTable("timeline_templates", {
  id: id(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  technique: text("technique"),
  createdAt: createdAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** Every publish creates a new version; treatments point at the version they follow. */
export const timelineVersions = pgTable(
  "timeline_versions",
  {
    id: id(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => timelineTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: publishStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by").references(() => staffUsers.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("timeline_versions_template_version_uq").on(t.templateId, t.version)],
);

const dayRange = {
  phase: timelinePhase("phase").notNull(),
  /** Null for pre_op rows, which have no day numbers. */
  fromDay: integer("from_day"),
  toDay: integer("to_day"),
};

export const timelinePhases = pgTable(
  "timeline_phases",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => timelineVersions.id, { onDelete: "cascade" }),
    ...dayRange,
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("timeline_phases_version_idx").on(t.versionId)],
);

export const captureRules = pgTable(
  "capture_rules",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => timelineVersions.id, { onDelete: "cascade" }),
    ...dayRange,
    everyDays: integer("every_days"),
    maxCount: integer("max_count"),
    angles: photoAngle("angles").array().notNull(),
  },
  (t) => [
    index("capture_rules_version_idx").on(t.versionId),
    check(
      "capture_rules_shape_ck",
      sql`(${t.phase} = 'pre_op' and ${t.maxCount} >= 1)
       or (${t.phase} = 'post_op' and ${t.fromDay} >= 0 and ${t.toDay} >= ${t.fromDay} and ${t.everyDays} >= 1)`,
    ),
  ],
);

/** Tips, recommendations and instructions. `body` is structured JSON, never raw HTML. */
export const timelineContent = pgTable(
  "timeline_content",
  {
    id: id(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => timelineVersions.id, { onDelete: "cascade" }),
    ...dayRange,
    contentType: contentType("content_type").notNull(),
    title: text("title").notNull(),
    body: jsonb("body").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("timeline_content_version_idx").on(t.versionId)],
);

// ─── Treatments & journal ─────────────────────────────────────────────────────

export const treatments = pgTable(
  "treatments",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    status: treatmentStatus("status").notNull().default("scheduled"),
    /** Editable at any time while scheduled (postponements). */
    plannedSurgeryDate: date("planned_surgery_date").notNull(),
    /** Set when the clinic marks the surgery as performed; day 0 of the timeline. */
    actualSurgeryDate: date("actual_surgery_date"),
    performedMarkedAt: timestamp("performed_marked_at", { withTimezone: true }),
    performedMarkedBy: uuid("performed_marked_by").references(() => staffUsers.id, { onDelete: "set null" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => timelineTemplates.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => timelineVersions.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("treatments_patient_idx").on(t.patientId),
    index("treatments_clinic_status_idx").on(t.clinicId, t.status),
    check(
      "treatments_performed_ck",
      sql`(${t.status} = 'scheduled' and ${t.actualSurgeryDate} is null)
       or (${t.status} = 'performed' and ${t.actualSurgeryDate} is not null)`,
    ),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    treatmentId: uuid("treatment_id")
      .notNull()
      .references(() => treatments.id, { onDelete: "cascade" }),
    /** Phase at capture time; pre_op entries never get a day number. */
    phase: timelinePhase("phase").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("journal_entries_treatment_captured_idx").on(t.treatmentId, t.capturedAt)],
);

/** Originals are stored clean; the clinic logo is overlaid at display / export time. */
export const photos = pgTable(
  "photos",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    angle: photoAngle("angle").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("photos_entry_angle_uq").on(t.entryId, t.angle)],
);

// ─── Legal documents & consent ────────────────────────────────────────────────

export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: id(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    kind: legalDocumentKind("kind").notNull(),
    version: integer("version").notNull(),
    format: legalDocumentFormat("format").notNull(),
    storageKey: text("storage_key"),
    bodyText: text("body_text"),
    /** SHA-256 of the exact content shown to patients; copied into each consent. */
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("legal_documents_clinic_kind_version_uq").on(t.clinicId, t.kind, t.version),
    check(
      "legal_documents_format_ck",
      sql`(${t.format} = 'file' and ${t.storageKey} is not null) or (${t.format} = 'text' and ${t.bodyText} is not null)`,
    ),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => legalDocuments.id),
    contentHash: text("content_hash").notNull(),
    signatureStorageKey: text("signature_storage_key").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("consents_patient_idx").on(t.patientId)],
);

// ─── Auth & audit ─────────────────────────────────────────────────────────────

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: id(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    /** Keyed hash (see hashSecret), salted with this row's id. */
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("otp_challenges_patient_created_idx").on(t.patientId, t.createdAt)],
);

/** Append-only. No FKs, so entries survive patient deletion; store no identifying data. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clinicId: uuid("clinic_id").notNull(),
    actorKind: actorKind("actor_kind").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    patientId: uuid("patient_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("audit_log_patient_idx").on(t.patientId),
  ],
);
