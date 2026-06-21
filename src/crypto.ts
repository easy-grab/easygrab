const HISTORY_VERSION = 1;

export type EncryptedHistoryPayload = {
  version: number;
  cipher: "AES-256-GCM";
  iv: string;
  ciphertext: string;
};

export type HistoryAccess = {
  key: CryptoKey;
  storageId: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function sha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", exactArrayBuffer(bytes)));
}

function joinBytes(...chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

export async function deriveHistoryAccess(signature: Uint8Array): Promise<HistoryAccess> {
  const encoder = new TextEncoder();
  const keyBytes = await sha256(joinBytes(encoder.encode("grab-history-key-v1:"), signature));
  const storageBytes = await sha256(joinBytes(encoder.encode("grab-history-storage-v1:"), signature));
  const key = await crypto.subtle.importKey("raw", exactArrayBuffer(keyBytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);

  return {
    key,
    storageId: base64Url(storageBytes)
  };
}

export async function encryptHistoryJson(json: string, key: CryptoKey): Promise<EncryptedHistoryPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(json);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: exactArrayBuffer(iv) }, key, exactArrayBuffer(plaintext))
  );

  return {
    version: HISTORY_VERSION,
    cipher: "AES-256-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

export async function decryptHistoryJson(payload: EncryptedHistoryPayload, key: CryptoKey) {
  if (payload.version !== HISTORY_VERSION || payload.cipher !== "AES-256-GCM") {
    throw new Error("Unsupported encrypted history payload.");
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: exactArrayBuffer(base64ToBytes(payload.iv)) },
    key,
    exactArrayBuffer(base64ToBytes(payload.ciphertext))
  );

  return new TextDecoder().decode(plaintext);
}
