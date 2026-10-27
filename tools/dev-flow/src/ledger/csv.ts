/** RFC 4180 CSV: CRLF line ends, and a field with a comma, quote, CR or LF in double quotes. */

/** One field; quotes inside a quoted field are doubled. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}
/** The header line, then one line per row in column order; a missing cell is empty. */
export function toCsv<C extends string>(
  columns: readonly C[],
  rows: readonly Readonly<Record<C, string>>[],
): string {
  const lines = [columns, ...rows.map(row => columns.map(column => row[column]))]
  return lines.map(line => `${line.map(csvField).join(',')}\r\n`).join('')
}
