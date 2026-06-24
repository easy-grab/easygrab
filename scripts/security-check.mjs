import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const deny = [];
const scanRoots = ["src", "public"];
const scanFiles = ["index.html", "package.json"];

function walk(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (["node_modules", "dist", ".git"].includes(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
    } else {
      inspect(path);
    }
  }
}

function inspect(path) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const text = readFileSync(path, "utf8");

  const rules = [
    {
      name: "no localStorage/sessionStorage for coupon secrets",
      pattern: /\b(localStorage|sessionStorage)\b/,
      allow: ["scripts/security-check.mjs", ".github/pull_request_template.md", "src/historyOutbox.ts"]
    },
    {
      name: "no URL query handling for claim secrets",
      pattern: /location\.search|URLSearchParams/,
      allow: ["scripts/security-check.mjs", ".github/pull_request_template.md"]
    },
    {
      name: "no third-party analytics",
      pattern: /google-analytics|gtag|mixpanel|segment|plausible|posthog/i,
      allow: ["scripts/security-check.mjs"]
    },
    {
      name: "no obvious private key literals",
      pattern: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/,
      allow: []
    },
    {
      name: "no hardcoded Solana secret arrays",
      pattern: /secretKey\s*[:=]\s*\[[0-9,\s]{80,}\]/,
      allow: []
    }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text) && !rule.allow.includes(rel)) {
      deny.push(`${rel}: ${rule.name}`);
    }
  }

  if (rel === "index.html") {
    if (/<script[^>]+src=["']https?:\/\//i.test(text)) {
      deny.push(`${rel}: external script tag is not allowed`);
    }
  }
}

for (const dir of scanRoots) {
  walk(join(root, dir));
}

for (const file of scanFiles) {
  inspect(join(root, file));
}

if (deny.length) {
  console.error("Security check failed:");
  for (const issue of deny) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log("Security check passed.");
