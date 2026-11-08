import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isZip, listZipEntries, readZipEntry } from "./zip";

/** Monta um ZIP mínimo (sem CRC verificado pelo leitor) para os testes. */
export function buildZip(files: Array<{ name: string; data: Buffer; store?: boolean }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = file.store ? file.data : deflateRawSync(file.data);
    const method = file.store ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

describe("zip reader", () => {
  const edital = Buffer.from("%PDF-1.4 edital ".repeat(200));
  const zip = buildZip([
    { name: "EDITAL-PREGÃO.pdf", data: edital },
    { name: "leia-me.txt", data: Buffer.from("olá"), store: true },
  ]);

  it("lists and extracts deflated and stored entries", () => {
    expect(isZip(zip)).toBe(true);
    const entries = listZipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["EDITAL-PREGÃO.pdf", "leia-me.txt"]);
    expect(readZipEntry(zip, entries[0], 1_000_000).equals(edital)).toBe(true);
    expect(readZipEntry(zip, entries[1], 1_000_000).toString()).toBe("olá");
  });

  it("refuses entries above the size limit", () => {
    const [entry] = listZipEntries(zip);
    expect(() => readZipEntry(zip, entry, 100)).toThrow(/limite/);
  });

  it("rejects data that is not a zip", () => {
    expect(isZip(Buffer.from("%PDF-"))).toBe(false);
    expect(() => listZipEntries(Buffer.alloc(40))).toThrow(/ZIP inválido/);
  });
});
