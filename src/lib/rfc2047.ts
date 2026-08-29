/**
 * RFC 2047 encoded-word encoding for non-ASCII email headers (Op 5 subject).
 *
 * gws's `gmail +send` helper mangles raw non-ASCII subjects (observed:
 * UTF-8 bytes re-encoded through Latin-1 → "Ã¨ÂªÂ²…" mojibake in the sent
 * mail), and RFC 5322 requires headers to be ASCII anyway. Passing an
 * encoded-word (`=?UTF-8?B?<base64>?=`) is pure ASCII — immune to any
 * encoding confusion downstream — and every mail client decodes it back.
 *
 * Body is NOT encoded here: gws already base64's the body with
 * `charset=UTF-8` correctly.
 */

/** Max encoded-word length per RFC 2047 §2 (75 chars). */
const MAX_WORD_LEN = 75;
// "=?UTF-8?B?" (10) + "?=" (2) = 12 chars of wrapper; base64 expands 3→4.
const MAX_CHUNK_BYTES = Math.floor((MAX_WORD_LEN - 12) / 4) * 3; // 45

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

/**
 * Split a string into chunks of at most `maxBytes` UTF-8 bytes without
 * breaking a multi-byte code point.
 */
function chunkByBytes(s: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of s) {
    const size = Buffer.byteLength(ch, "utf8");
    if (currentBytes + size > maxBytes && current !== "") {
      chunks.push(current);
      current = ch;
      currentBytes = size;
    } else {
      current += ch;
      currentBytes += size;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/**
 * Encode a header value as one or more RFC 2047 B-encoded words. ASCII-only
 * input is returned unchanged (no encoding needed, nothing to mangle).
 * Multiple words are separated by a single space; per RFC 2047 §6.2 the
 * whitespace between adjacent encoded-words is ignored when decoding.
 */
export function encodeRFC2047Subject(s: string): string {
  if (isAscii(s)) return s;
  return chunkByBytes(s, MAX_CHUNK_BYTES)
    .map(
      (chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`,
    )
    .join(" ");
}
