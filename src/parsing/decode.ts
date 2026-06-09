// HWiNFO writes CSVs in the OS code page (Windows-1252 here). We sniff for a UTF-8 BOM /
// valid UTF-8; otherwise fall back to Windows-1252 so '°C' doesn't become '�C'.
export function decodeBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('�')) return utf8; // clean utf-8 (no replacement char)
  return new TextDecoder('windows-1252').decode(bytes); // HWiNFO default
}
