// RFC 4180-style quoted fields, including commas, quotes, CRLF, and multiline explanations.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error("Invalid quote in CSV field.");
      quoted = true;
    } else if (char === ",") { row.push(field); field = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); if (row.some((cell) => cell !== "")) rows.push(row);
      row = []; field = ""; closed = false;
    } else {
      if (closed) throw new Error("Unexpected data after a closing CSV quote.");
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(field); if (row.some((cell) => cell !== "")) rows.push(row);
  const headers = rows.shift();
  if (!headers || new Set(headers).size !== headers.length) throw new Error("CSV needs unique column headers.");
  return rows.map((values) => {
    if (values.length !== headers.length) throw new Error("CSV row does not match its headers.");
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
export function csv(rows: Record<string, unknown>[], headers: string[]): string {
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; // Prevent spreadsheet formula execution.
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n");
}
