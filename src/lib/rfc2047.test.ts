import { describe, it, expect } from "vitest";
import { encodeRFC2047Subject } from "./rfc2047.ts";

/** Decode RFC 2047 B-words back to the original string (test helper). */
function decodeWords(s: string): string {
  return s
    .split(" ")
    .map((word) => {
      const m = /^=\?UTF-8\?B\?(.+)\?=$/.exec(word);
      return m ? Buffer.from(m[1] ?? "", "base64").toString("utf8") : word;
    })
    .join("");
}

describe("encodeRFC2047Subject", () => {
  it("returns ASCII-only input unchanged", () => {
    expect(encodeRFC2047Subject("Course Registration: Test Course")).toBe(
      "Course Registration: Test Course",
    );
  });

  it("encodes non-ASCII input as a B-encoded word that round-trips", () => {
    const original = "課程報名：Test Course";
    const encoded = encodeRFC2047Subject(original);
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    expect(decodeWords(encoded)).toBe(original);
  });

  it("round-trips the real Op 5 subject shape", () => {
    const original = "課程報名：跨代同行、勵勉前行";
    expect(decodeWords(encodeRFC2047Subject(original))).toBe(original);
  });

  it("keeps every encoded word within the RFC 2047 75-char limit", () => {
    const original =
      "課程報名：跨代同行、勵勉前行跨代同行、勵勉前行跨代同行、勵勉前行";
    const encoded = encodeRFC2047Subject(original);
    const words = encoded.split(" ");
    expect(words.length).toBeGreaterThan(1);
    for (const w of words) {
      expect(w.length).toBeLessThanOrEqual(75);
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    }
    expect(decodeWords(encoded)).toBe(original);
  });

  it("never splits a multi-byte code point across words", () => {
    // 45-byte chunk boundary falls mid-string; every decoded word must be
    // valid UTF-8 (round-trip would throw / mangle otherwise).
    const original = "勵勉前行".repeat(20);
    const encoded = encodeRFC2047Subject(original);
    expect(decodeWords(encoded)).toBe(original);
  });
});
