import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const lines = [];

if (!existsSync(dist)) {
  throw new Error("dist does not exist. Run npm run build first.");
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
    } else if (!path.endsWith("manifest.sha256.txt")) {
      const bytes = readFileSync(path);
      const hash = createHash("sha256").update(bytes).digest("hex");
      lines.push(`${hash}  ${relative(dist, path).replaceAll("\\", "/")}`);
    }
  }
}

walk(dist);
lines.sort();
writeFileSync(join(dist, "manifest.sha256.txt"), `${lines.join("\n")}\n`);
console.log(`Wrote dist/manifest.sha256.txt with ${lines.length} entries.`);
