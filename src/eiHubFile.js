// Reads EI-Hub's Child Info and Authorizations download in the browser
// (EiHubImport.jsx) into { headers: [...], rows: [[...], ...] } for the API
// (kidz-lounge-api lib/eiImport.js). No library: an .xlsx is a zip of XML
// files, unzipped with the browser's own DecompressionStream, so nothing
// extra is loaded (and the site's Content-Security-Policy needn't change).
// Also reads CSV, and the HTML table some sites save with an .xls name.
// Values are sent as they are; the server turns Excel date numbers into dates.

const decoder = new TextDecoder();

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The files in a zip, by name -> Uint8Array (only those `want` accepts).
async function unzip(buf, want) {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file couldn't be opened as an Excel workbook.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    out.set(name, method === 0 ? data : await inflate(data));
  }
  return out;
}

const xml = (bytes) => new DOMParser().parseFromString(decoder.decode(bytes), 'application/xml');
const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
const textOf = (node) => all(node, 't').map(t => t.textContent).join('');
// "AB12" -> 27 (0-based column)
const colIndex = (ref) => {
  const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

async function readXlsx(buf) {
  const files = await unzip(buf, (name) => name.startsWith('xl/'));
  // The first sheet, by the workbook's own order.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = files.get('xl/workbook.xml');
  const rels = files.get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = all(xml(wb), 'sheet')[0];
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = all(xml(rels), 'Relationship').find(r => r.getAttribute('Id') === rid);
    if (rel) {
      const target = rel.getAttribute('Target').replace(/^\//, '');
      sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
    }
  }
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error("That workbook doesn't have a sheet to read.");
  const shared = files.get('xl/sharedStrings.xml') ? all(xml(files.get('xl/sharedStrings.xml')), 'si').map(textOf) : [];
  const grid = [];
  for (const row of all(xml(sheet), 'row')) {
    const cells = [];
    all(row, 'c').forEach((c, i) => {
      const ref = c.getAttribute('r');
      const col = ref ? colIndex(ref) : i;
      const type = c.getAttribute('t');
      const v = all(c, 'v')[0];
      cells[col] = type === 's' ? shared[Number(v?.textContent)] ?? ''
        : type === 'inlineStr' ? textOf(c)
        : v ? v.textContent : '';
    });
    grid.push(Array.from(cells, x => x ?? ''));
  }
  return grid;
}

// CSV with quoted fields ("a, b" and "" for a quote).
function readCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function readHtmlTable(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return Array.from(doc.querySelectorAll('tr')).map(tr => Array.from(tr.querySelectorAll('th, td')).map(td => td.textContent.trim()));
}

// The file -> { headers, rows }. Throws an Error with a message to show.
export async function readEiHubFile(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 8));
  let grid;
  if (head[0] === 0x50 && head[1] === 0x4b) grid = await readXlsx(buf);
  else if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new Error("This is an older Excel file (.xls). Open it in Excel, choose File > Save As > Excel Workbook (.xlsx), then choose the saved file here.");
  } else {
    const text = decoder.decode(buf).replace(/^\uFEFF/, '');
    grid = /<table/i.test(text.slice(0, 5000)) ? readHtmlTable(text) : readCsv(text);
  }
  const first = grid.findIndex(r => r.some(v => String(v).trim()));
  if (first < 0) throw new Error('That file is empty.');
  const headers = grid[first].map(h => String(h).trim());
  const rows = grid.slice(first + 1).filter(r => r.some(v => String(v).trim()));
  return { headers, rows };
}
