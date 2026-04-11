/** First 8 bytes of SHA-256 (UTF-8), little-endian uint64 — matches Qt `HashMessageText`. */

export async function hashMessageText(text: string): Promise<bigint> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const view = new DataView(buf);
  return view.getBigUint64(0, true);
}
