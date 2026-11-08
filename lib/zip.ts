import { inflateRawSync } from "node:zlib";

/**
 * Leitor mínimo de ZIP (métodos "stored" e "deflate"), suficiente para os
 * pacotes de edital publicados no PNCP. Lê o diretório central, que traz os
 * tamanhos mesmo quando o arquivo usa "data descriptor".
 */

export type ZipEntry = {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
};

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectorySignature = 0x02014b50;
const localHeaderSignature = 0x04034b50;

export function isZip(bytes: Uint8Array) {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

export function listZipEntries(bytes: Buffer): ZipEntry[] {
  // O registro final fica nos últimos 22 bytes + até 64 KiB de comentário.
  const searchStart = Math.max(0, bytes.length - 22 - 0xffff);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) {
    if (bytes.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP inválido: diretório central não encontrado.");

  const entryCount = bytes.readUInt16LE(endOffset + 10);
  let offset = bytes.readUInt32LE(endOffset + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new Error("ZIP inválido: entrada do diretório central corrompida.");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength);
    // Bit 11: nome em UTF-8; senão, CP437 (aproximado por latin1).
    const name = rawName.toString(flags & 0x800 ? "utf8" : "latin1");
    entries.push({
      name,
      method: bytes.readUInt16LE(offset + 10),
      compressedSize: bytes.readUInt32LE(offset + 20),
      uncompressedSize: bytes.readUInt32LE(offset + 24),
      localHeaderOffset: bytes.readUInt32LE(offset + 42),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Extrai uma entrada, recusando tamanhos acima de `maxBytes` (proteção contra "zip bomb"). */
export function readZipEntry(bytes: Buffer, entry: ZipEntry, maxBytes: number): Buffer {
  if (entry.uncompressedSize > maxBytes) {
    throw new Error(`Arquivo "${entry.name}" excede o limite de leitura.`);
  }
  const offset = entry.localHeaderOffset;
  if (offset + 30 > bytes.length || bytes.readUInt32LE(offset) !== localHeaderSignature) {
    throw new Error("ZIP inválido: cabeçalho local corrompido.");
  }
  const dataStart =
    offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
  const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: maxBytes });
  throw new Error(`Compressão ZIP não suportada (método ${entry.method}).`);
}
