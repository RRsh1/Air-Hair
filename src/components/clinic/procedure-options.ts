import type { ClinicProcedure, LibraryProcedure } from "@/lib/catalog/procedures";

export type ProcedureOption = { value: string; label: string };

/** The clinic's procedures, then library procedures it hasn't adopted yet (adopted on first use). */
export function procedureOptions(clinic: ClinicProcedure[], library: LibraryProcedure[]): ProcedureOption[] {
  const adopted = new Set(clinic.map((p) => p.libraryKey).filter(Boolean));
  return [
    ...clinic.map((p) => ({ value: `t:${p.templateId}`, label: p.name })),
    ...library.filter((p) => !adopted.has(p.key)).map((p) => ({ value: `l:${p.key}`, label: p.nameHe })),
  ];
}
