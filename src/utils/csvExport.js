function toCSVValue(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Converts an array of flat objects to a CSV file and triggers a
 * browser download. Works client-side only (no server round trip).
 */
export function downloadCSV(rows, filename = "export.csv") {
  if (!rows || rows.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("downloadCSV: no rows to export");
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => toCSVValue(row[h])).join(",")),
  ];
  const csv = lines.join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
