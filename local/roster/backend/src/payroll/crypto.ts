const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (a: Uint8Array) => btoa(String.fromCharCode(...a));
const un64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes(JSON.stringify(value))),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function seal(value: any, key: string, aad: string) {
  const raw = un64(key);
  if (raw.length !== 32)
    throw new Error("XERO_TOKEN_KEY must be base64 of 32 bytes");
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return (
    b64(iv) +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: bytes(aad) },
          k,
          bytes(JSON.stringify(value)),
        ),
      ),
    )
  );
}
export async function unseal(value: string, key: string, aad: string) {
  const [iv, data] = value.split(".");
  const k = await crypto.subtle.importKey("raw", un64(key), "AES-GCM", false, [
    "decrypt",
  ]);
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: un64(iv), additionalData: bytes(aad) },
        k,
        un64(data),
      ),
    ),
  );
}
