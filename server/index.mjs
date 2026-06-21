import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dataFile = join(root, "data", "encrypted-batches.json");
const port = Number(process.env.PORT || 8787);

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

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(response, status, body) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function validRecord(record) {
  return (
    typeof record?.id === "string" &&
    typeof record?.storageId === "string" &&
    typeof record?.createdAt === "string" &&
    typeof record?.payload?.iv === "string" &&
    typeof record?.payload?.ciphertext === "string"
  );
}

createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      send(response, 204, {});
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/api/batches") {
      const storageId = url.searchParams.get("storageId");
      if (!storageId) {
        send(response, 400, { error: "Missing storageId" });
        return;
      }

      const store = await readStore();
      send(response, 200, {
        records: store.records.filter((record) => record.storageId === storageId)
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/batches") {
      const body = await readJson(request);
      if (!validRecord(body)) {
        send(response, 400, { error: "Invalid encrypted batch record" });
        return;
      }

      const store = await readStore();
      const now = new Date().toISOString();
      const existingIndex = store.records.findIndex((record) => record.id === body.id);
      const record = { ...body, updatedAt: now };

      if (existingIndex >= 0) {
        store.records[existingIndex] = record;
      } else {
        store.records.unshift(record);
      }

      await writeStore(store);
      send(response, 200, { ok: true });
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/batches/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/batches/".length));
      const body = await readJson(request);
      const store = await readStore();
      const index = store.records.findIndex((record) => record.id === id && record.storageId === body.storageId);

      if (index < 0) {
        send(response, 404, { error: "Record not found" });
        return;
      }

      if (typeof body?.payload?.iv !== "string" || typeof body?.payload?.ciphertext !== "string") {
        send(response, 400, { error: "Invalid encrypted payload" });
        return;
      }

      store.records[index] = {
        ...store.records[index],
        payload: body.payload,
        updatedAt: new Date().toISOString()
      };

      await writeStore(store);
      send(response, 200, { ok: true });
      return;
    }

    send(response, 404, { error: "Not found" });
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Easy Grab encrypted batch API running at http://127.0.0.1:${port}`);
});
