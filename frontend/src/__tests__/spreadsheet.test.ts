import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, escapeSpreadsheetFormula, parseStudentCsv, toCsv } from '../utils/spreadsheet';
import { createXlsxWorkbook } from '../utils/xlsxExport';

function csvFile(content: string, name = 'students.csv', size = content.length): File {
  return { name, size, type: 'text/csv', text: async () => content } as File;
}

const header = 'id,name,email,component,progress,assessments,status,notes';
const row = 'student-1,Jane Doe,jane@example.edu,CWTS,75,3,active,Ready';

describe('bounded spreadsheet import and export', () => {
  it('imports a valid compatible student CSV', async () => {
    await expect(parseStudentCsv(csvFile(`${header}\n${row}`))).resolves.toEqual([{
      id: 'student-1', name: 'Jane Doe', email: 'jane@example.edu', component: 'CWTS', progress: 75, assessments: 3, status: 'active', notes: 'Ready',
    }]);
  });

  it('rejects invalid headers, oversized files, unsupported workbooks, and malformed CSV data', async () => {
    await expect(parseStudentCsv(csvFile('name,email\nJane,jane@example.edu'))).rejects.toThrow('Missing required CSV header: component');
    await expect(parseStudentCsv(csvFile(`${header}\n${row}`, 'students.csv', MAX_IMPORT_FILE_BYTES + 1))).rejects.toThrow('1 MB');
    await expect(parseStudentCsv(csvFile('not-an-xlsx', 'students.xlsx'))).rejects.toThrow('Only CSV files');
    await expect(parseStudentCsv(csvFile(`${header}\n"broken,jane@example.edu,CWTS,75,3,active,Ready`))).rejects.toThrow('malformed');
  });

  it('rejects excessive row counts', async () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row).join('\n');
    await expect(parseStudentCsv(csvFile(`${header}\n${rows}`))).rejects.toThrow('at most');
  });

  it('escapes formula prefixes and preserves CSV export columns', () => {
    expect(escapeSpreadsheetFormula('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeSpreadsheetFormula('+cmd')).toBe("'+cmd");
    expect(escapeSpreadsheetFormula('-value')).toBe("'-value");
    expect(escapeSpreadsheetFormula('@value')).toBe("'@value");
    expect(escapeSpreadsheetFormula(' =SUM(A1:A2)')).toBe("' =SUM(A1:A2)");
    expect(toCsv(['name', 'notes'], [['Jane', '=SUM(A1:A2)']])).toBe('"name","notes"\n"Jane","\'=SUM(A1:A2)"');
  });

  it('uses the bounded XLSX exporter for the existing multi-sheet report export and removes xlsx 0.18.5', async () => {
    const reportsPage = await readFile(new URL('../pages/ReportsPage.tsx', import.meta.url), 'utf8');
    const packageManifest = await readFile(new URL('../../package.json', import.meta.url), 'utf8');
    const lockfile = await readFile(new URL('../../../package-lock.json', import.meta.url), 'utf8');
    expect(reportsPage).toContain('createXlsxWorkbook');
    expect(reportsPage).toContain("name: 'Students'");
    expect(reportsPage).toContain("name: 'Training Groups'");
    expect(packageManifest).not.toContain('"xlsx"');
    expect(lockfile).not.toContain('xlsx@0.18.5');
  });

  it('creates compatible literal-value XLSX sheets without formulas', () => {
    const archive = unzipSync(new Uint8Array(createXlsxWorkbook([
      { name: 'Students', rows: [['Name', 'Notes'], ['Jane', '=SUM(A1:A2)']] },
      { name: 'Grades', rows: [['Student ID', 'Final'], ['student-1', 95]] },
    ])));
    expect(strFromU8(archive['xl/workbook.xml'])).toContain('name="Students"');
    const students = strFromU8(archive['xl/worksheets/sheet1.xml']);
    expect(students).toContain('<cols><col min="1" max="1" width="10" customWidth="1"/>');
    expect(students).toContain('<col min="2" max="2" width="13" customWidth="1"/></cols>');
    expect(students).toContain('&apos;=SUM(A1:A2)');
    expect(students).not.toContain('<f>');
    expect(strFromU8(archive['xl/worksheets/sheet2.xml'])).toContain('<v>95</v>');
  });
});
