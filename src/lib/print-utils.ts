/**
 * Open styled HTML content in a new browser tab for viewing/printing.
 * Consistent styling across all report views (Reports, Checks, etc.)
 * No auto-print — user clicks "Print / Save as PDF" when ready.
 */
export function openReport(title: string, subtitle: string, bodyHtml: string) {
  const html = '<!DOCTYPE html><html><head><title>' + title + '</title>' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;color:#1a1a2e;max-width:800px;margin:0 auto}' +
    '.header{background:#4f46e5;color:white;padding:20px 24px;border-radius:8px 8px 0 0}' +
    '.header h1{margin:0;font-size:18px;font-weight:600}' +
    '.header p{margin:4px 0 0;font-size:13px;opacity:0.85}' +
    '.content{border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;overflow:hidden}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}' +
    'th{padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #cbd5e1;background:#f1f5f9}' +
    'th:first-child{text-align:left}' +
    'td{padding:8px 12px;text-align:right;border-bottom:1px solid #e5e7eb}' +
    'td:first-child{text-align:left}' +
    'tbody tr:nth-child(even){background:#f8fafc}' +
    'tfoot tr{background:#4f46e5;color:white}' +
    'tfoot td{font-weight:bold;border:none;padding:10px 12px}' +
    '.card{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;max-width:420px;display:inline-block;vertical-align:top;margin-right:16px}' +
    '.card-header{background:#4f46e5;color:white;padding:14px 18px}' +
    '.card-header h3{margin:0;font-size:15px}' +
    '.card-header p{margin:3px 0 0;font-size:11px;opacity:0.85}' +
    '.card-body{padding:14px 18px}' +
    '.card-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px}' +
    '.card-total{display:flex;justify-content:space-between;padding:10px 0 0;margin-top:4px;border-top:2px solid #4f46e5;font-weight:bold;font-size:15px;color:#4f46e5}' +
    '.left{text-align:left}.right{text-align:right}' +
    '.footer{margin-top:30px;font-size:10px;color:#94a3b8;text-align:center}' +
    '.print-btn{display:inline-block;margin:16px 0;padding:8px 20px;background:#4f46e5;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer}' +
    '.print-btn:hover{background:#4338ca}' +
    '@media print{.print-btn{display:none}body{padding:0}}' +
    '</style></head><body>' +
    '<div class="header"><h1>' + title + '</h1><p>' + subtitle + '</p></div>' +
    '<div class="content">' + bodyHtml + '</div>' +
    '<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>' +
    '<p class="footer">Generated ' + new Date().toLocaleDateString() + ' | OTS</p>' +
    '</body></html>'
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
