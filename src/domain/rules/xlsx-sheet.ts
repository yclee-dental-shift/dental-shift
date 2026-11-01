/**
 * 讀 Excel（.xlsx）第一個工作表的文字，回傳「列 × 欄」的二維陣列（從 0 起算，空格＝""）。
 * 不用套件：.xlsx 是 zip 裡放 XML，用瀏覽器內建的 DecompressionStream 解壓、DOMParser 讀 XML。
 * 只在這台裝置讀，檔案不上傳。合併儲存格只有左上角那一格有字（和 Excel 存的一樣）。
 */

export class XlsxError extends Error {}

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 中央目錄結尾（End of Central Directory）在檔案最後 22～65557 bytes 內。
  let end = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new XlsxError("這不是 Excel（.xlsx）檔案");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new XlsxError("Excel 檔案損壞，讀不出來");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(copy);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = entries.get(name);
  if (!entry) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localOffset;
  if (view.getUint32(local, true) !== 0x04034b50) throw new XlsxError("Excel 檔案損壞，讀不出來");
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let raw: Uint8Array;
  if (entry.method === 0) raw = data;
  else if (entry.method === 8) raw = await inflateRaw(data);
  else throw new XlsxError("Excel 檔案用了不支援的壓縮方式");
  return new TextDecoder().decode(raw);
}

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new XlsxError("Excel 檔案內容讀不懂");
  return doc;
}

const elements = (parent: Document | Element, name: string) => Array.from(parent.getElementsByTagNameNS("*", name));

/** 一段文字（<si> 或 <is>）：把所有 <t> 接起來，不含注音（<rPh>）。 */
function textOf(element: Element): string {
  return elements(element, "t")
    .filter((t) => !(t.parentElement && t.parentElement.localName === "rPh"))
    .map((t) => t.textContent ?? "")
    .join("");
}

/** 欄位字母 → 從 0 起算的欄號（A＝0、AA＝26）。 */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** 每個工作表的名稱與路徑，照 workbook.xml 的順序。 */
async function sheetPaths(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<Array<{ name: string; path: string }>> {
  const workbook = await readEntry(bytes, entries, "xl/workbook.xml");
  const rels = await readEntry(bytes, entries, "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return [];
  const relations = elements(parseXml(rels), "Relationship");
  return elements(parseXml(workbook), "sheet").flatMap((sheet) => {
    const id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sheet.getAttribute("r:id");
    const target = relations.find((rel) => rel.getAttribute("Id") === id)?.getAttribute("Target");
    if (!target) return [];
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    return entries.has(path) ? [{ name: sheet.getAttribute("name") ?? "", path }] : [];
  });
}

/** 第一個工作表的路徑：照 workbook.xml 的順序；讀不到就用 worksheets 資料夾裡第一個。 */
async function firstSheetPath(bytes: Uint8Array, entries: Map<string, ZipEntry>): Promise<string> {
  const first = (await sheetPaths(bytes, entries))[0];
  if (first) return first.path;
  const fallback = [...entries.keys()].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).sort()[0];
  if (!fallback) throw new XlsxError("Excel 裡找不到工作表");
  return fallback;
}

/** 一個工作表的 XML → 每一格的文字。 */
function cellsOf(sheetText: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  elements(parseXml(sheetText), "row").forEach((row, rowPosition) => {
    const rowIndex = Number(row.getAttribute("r") ?? rowPosition + 1) - 1;
    const cells: string[] = [];
    elements(row, "c").forEach((cell, cellPosition) => {
      const ref = cell.getAttribute("r");
      const column = ref ? columnIndex(ref) : cellPosition;
      const type = cell.getAttribute("t");
      const value = elements(cell, "v")[0]?.textContent ?? "";
      let text: string;
      if (type === "s") text = shared[Number(value)] ?? "";
      else if (type === "inlineStr") text = elements(cell, "is")[0] ? textOf(elements(cell, "is")[0]) : "";
      else text = value;
      cells[column] = text;
    });
    rows[rowIndex] = Array.from(cells, (text) => text ?? "");
  });
  return Array.from(rows, (row) => row ?? []);
}

async function openBook(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const entries = readZipDirectory(bytes);
  const sharedText = await readEntry(bytes, entries, "xl/sharedStrings.xml");
  const shared = sharedText ? elements(parseXml(sharedText), "si").map(textOf) : [];
  return { bytes, entries, shared };
}

/** 讀第一個工作表，回傳每一格的文字。 */
export async function readFirstSheet(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const { bytes, entries, shared } = await openBook(data);
  const sheetText = await readEntry(bytes, entries, await firstSheetPath(bytes, entries));
  if (!sheetText) throw new XlsxError("Excel 裡找不到工作表");
  return cellsOf(sheetText, shared);
}

/** 讀所有工作表：名稱 → 每一格的文字（照 Excel 下方分頁的名稱）。 */
export async function readAllSheets(data: ArrayBuffer | Uint8Array): Promise<Record<string, string[][]>> {
  const { bytes, entries, shared } = await openBook(data);
  const sheets: Record<string, string[][]> = {};
  for (const { name, path } of await sheetPaths(bytes, entries)) {
    const text = await readEntry(bytes, entries, path);
    if (text) sheets[name] = cellsOf(text, shared);
  }
  if (Object.keys(sheets).length === 0) throw new XlsxError("Excel 裡找不到工作表");
  return sheets;
}
