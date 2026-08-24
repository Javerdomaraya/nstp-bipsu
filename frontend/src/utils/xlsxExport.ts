import { strToU8, zipSync } from 'fflate';
import { escapeSpreadsheetFormula, MAX_CELL_LENGTH, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './spreadsheet';

type Sheet = { name: string; rows: Array<Array<unknown>> };
const MAX_EXPORT_SHEETS = 10;

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!);
}

function columnName(index: number): string {
  let result = '';
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellXml(value: unknown, rowIndex: number, columnIndex: number): string {
  const address = `${columnName(columnIndex)}${rowIndex + 1}`;
  const safeValue = escapeSpreadsheetFormula(value);
  if (typeof safeValue === 'number' && Number.isFinite(safeValue)) return `<c r="${address}"><v>${safeValue}</v></c>`;
  if (typeof safeValue === 'boolean') return `<c r="${address}" t="b"><v>${safeValue ? 1 : 0}</v></c>`;
  const text = String(safeValue ?? '');
  if (text.length > MAX_CELL_LENGTH) throw new Error(`Export cell ${address} exceeds the supported length.`);
  return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function columnWidthsXml(rows: Array<Array<unknown>>): string {
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (columnCount === 0) return '';
  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const longestValue = rows.reduce((maximum, row) => Math.max(maximum, String(row[columnIndex] ?? '').length), 0);
    return Math.min(60, Math.max(10, longestValue + 2));
  });
  return `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`;
}

function sheetXml(rows: Array<Array<unknown>>): string {
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Exports may contain at most ${MAX_IMPORT_ROWS} rows per sheet.`);
  const body = rows.map((row, rowIndex) => {
    if (row.length > MAX_IMPORT_COLUMNS) throw new Error(`Exports may contain at most ${MAX_IMPORT_COLUMNS} columns per sheet.`);
    return `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(value, rowIndex, columnIndex)).join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columnWidthsXml(rows)}<sheetData>${body}</sheetData></worksheet>`;
}

function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet ${index + 1}`;
}

export function createXlsxWorkbook(sheets: Sheet[]): ArrayBuffer {
  if (sheets.length === 0 || sheets.length > MAX_EXPORT_SHEETS) throw new Error(`Exports must contain 1 to ${MAX_EXPORT_SHEETS} sheets.`);
  const normalizedSheets = sheets.map((sheet, index) => ({ ...sheet, name: safeSheetName(sheet.name, index) }));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${normalizedSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${normalizedSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${normalizedSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`),
  };
  normalizedSheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows)); });
  const archive = zipSync(files, { level: 6 });
  const copy = new Uint8Array(archive.byteLength);
  copy.set(archive);
  return copy.buffer;
}
