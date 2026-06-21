import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataFile = join(root, "data", "encrypted-batches.json");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 1_000_000);
const defaultOrigins = ["http://127.0.0.1:5173", "http://localhost:5173", "https://easygrab.fun", "https://www.easygrab.fun"];
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
let storeQueue = Promise.resolve();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readStore() {
  try {
    const text = await readFile(dataFile, "utf8");
    return JSON.parse(text);
  } catch {
    return { records: [] };
  }
}

async function writeStore(store) {
  await mkdir(dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, dataFile);
}

async function updateStore(mutator) {
  const previous = storeQueue;
  let release;
  storeQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous.catch(() => undefined);
  try {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  } finally {
    release();
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin"
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function assertAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    throw new HttpError(403, "Origin not allowed");
  }
}

function send(request, response, status, body) {
  response.writeHead(status, {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function validShortString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function validRecord(record) {
  return (
    validShortString(record?.id, 96) &&
    validShortString(record?.storageId, 96) &&
    validShortString(record?.createdAt, 64) &&
    record?.payload?.version === 1 &&
    record?.payload?.cipher === "AES-256-GCM" &&
    validShortString(record?.payload?.iv, 128) &&
    validShortString(record?.payload?.ciphertext, 750_000)
  );
}

createServer(async (request, response) => {
  try {
    assertAllowedOrigin(request);

    if (request.method === "OPTIONS") {
      send(request, response, 204, {});
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/api/batches") {
      const storageId = url.searchParams.get("storageId");
      if (!storageId) {
        send(request, response, 400, { error: "Missing storageId" });
        return;
      }

      const store = await readStore();
      send(request, response, 200, {
        records: store.records.filter((record) => record.storageId === storageId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/batches") {
      const body = await readJson(request);
      if (!validRecord(body)) {
        send(request, response, 400, { error: "Invalid encrypted batch record" });
        return;
      }

      await updateStore(async (store) => {
        const now = new Date().toISOString();
        const existingIndex = store.records.findIndex((record) => record.id === body.id);
        const record = { ...body, updatedAt: now };

        if (existingIndex >= 0) {
          store.records[existingIndex] = record;
        } else {
          store.records.unshift(record);
        }
      });

      send(request, response, 200, { ok: true });
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/batches/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/batches/".length));
      const body = await readJson(request);
      if (!validShortString(id, 96) || !validShortString(body?.storageId, 96)) {
        send(request, response, 400, { error: "Invalid batch id" });
        return;
      }

      const updated = await updateStore(async (store) => {
        const index = store.records.findIndex((record) => record.id === id && record.storageId === body.storageId);
        if (index < 0) return false;

        if (
          body?.payload?.version !== 1 ||
          body?.payload?.cipher !== "AES-256-GCM" ||
          !validShortString(body?.payload?.iv, 128) ||
          !validShortString(body?.payload?.ciphertext, 750_000)
        ) {
          throw new HttpError(400, "Invalid encrypted payload");
        }

        store.records[index] = {
          ...store.records[index],
          payload: body.payload,
          updatedAt: new Date().toISOString()
        };
        return true;
      });

      if (!updated) {
        send(request, response, 404, { error: "Record not found" });
        return;
      }

      send(request, response, 200, { ok: true });
      return;
    }

    send(request, response, 404, { error: "Not found" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    send(request, response, status, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, host, () => {
  console.log(`Easy Grab encrypted batch API running at http://${host}:${port}`);
});
