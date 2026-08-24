/**
 * Batch validation for the administrator's student CSV import.
 *
 * Extracted from the admin screen for two reasons. It is the point where
 * untrusted spreadsheet data becomes a student record — the component cell
 * decides which coordinator owns that student — and it must be testable without
 * a browser, a bundler, or React.
 *
 * The contract is deliberately all-or-nothing: if any row is invalid, `rows` is
 * empty. A partially imported roster is the failure mode that matters here,
 * because a student created with a guessed component looks like legitimate data
 * to whichever coordinator owns that component and is invisible to everyone
 * else. Nothing in this module infers or defaults a component.
 *
 * This is input validation, not authorization. The server re-validates every
 * component it is sent; a client that skipped this check would be rejected
 * there, and this exists so the administrator gets an actionable message
 * instead of a partial write.
 */

import { NSTP_COMPONENTS, toNstpComponent, type NstpComponent } from '../data/nstpComponents';

/** The statuses a CSV cell may name. Anything else is a validation failure. */
export const STUDENT_IMPORT_STATUSES = ['active', 'pending', 'graduated'] as const;
export type StudentImportStatus = (typeof STUDENT_IMPORT_STATUSES)[number];

/**
 * The shape `parseStudentCsv` produces. Declared structurally so this module
 * does not depend on the spreadsheet reader (and so tests can build rows by
 * hand).
 */
export type StudentImportSource = {
  name: string;
  email: string;
  component: string;
  status: string;
};

export type ValidatedStudentImportRow<TRow extends StudentImportSource> = {
  row: TRow;
  /** Zero-based index in the parsed array, for stable generated ids. */
  index: number;
  component: NstpComponent;
  /** `null` when the cell was blank; the caller may then derive a status. */
  status: StudentImportStatus | null;
};

export type StudentImportValidation<TRow extends StudentImportSource> = {
  /** One human-readable message per problem, naming the row and the value. */
  errors: string[];
  /** Rows safe to persist. Always empty when `errors` is non-empty. */
  rows: ValidatedStudentImportRow<TRow>[];
};

/** The accepted-values hint shown alongside a rejection. */
export const ACCEPTED_COMPONENTS_HINT = `Accepted components: ${NSTP_COMPONENTS.join(', ')}.`;

/**
 * Validates the whole parsed batch before anything is persisted.
 *
 * `rowNumber` in the messages counts the header as line 1, matching what the
 * administrator sees in their spreadsheet.
 */
export function validateStudentImportRows<TRow extends StudentImportSource>(
  parsedRows: TRow[],
): StudentImportValidation<TRow> {
  const errors: string[] = [];
  const rows: ValidatedStudentImportRow<TRow>[] = [];

  parsedRows.forEach((row, index) => {
    const rowNumber = index + 2; // Header occupies line 1.
    const label = row.email || row.name || 'unnamed record';
    const component = toNstpComponent(row.component);
    const statusCell = String(row.status ?? '').trim().toLowerCase();
    const status = STUDENT_IMPORT_STATUSES.find((value) => value === statusCell) ?? null;

    if (!component) {
      const supplied = String(row.component ?? '').trim() || '(blank)';
      errors.push(`Row ${rowNumber} (${label}): component "${supplied}" is not a valid NSTP component.`);
    }
    if (statusCell && !status) {
      errors.push(`Row ${rowNumber} (${label}): status "${String(row.status ?? '').trim()}" is not one of ${STUDENT_IMPORT_STATUSES.join(', ')}.`);
    }
    if (component && (!statusCell || status)) {
      rows.push({ row, index, component, status });
    }
  });

  // All-or-nothing: one bad row cancels the batch, so no student can be created
  // with an inferred component while the administrator fixes the file.
  if (errors.length > 0) return { errors, rows: [] };
  return { errors, rows };
}
