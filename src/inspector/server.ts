import { createServer, type ServerResponse } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7777;
const SKIP = new Set([".git", "node_modules"]);

const STATIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function serveStatic(urlPath: string, res: ServerResponse): Promise<void> {
  let filePath = path.join(STATIC_DIR, urlPath);

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    // File not found — SPA fallback to index.html
    filePath = path.join(STATIC_DIR, "index.html");
  }

  let content: Buffer;
  try {
    content = await readFile(filePath);
  } catch {
    res.writeHead(404);
    res.end("Not found — run `npm run build` in inspector/");
    return;
  }

  res.setHeader("Content-Type", MIME[path.extname(filePath)] ?? "application/octet-stream");
  res.end(content);
}

async function buildTree(dir: string, rootDir: string): Promise<unknown[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const children = [];
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      children.push({
        name: entry.name,
        path: relPath,
        type: "dir",
        children: await buildTree(fullPath, rootDir),
      });
    } else {
      let content: string;
      try {
        content = await readFile(fullPath, "utf8");
      } catch {
        content = "(binary)";
      }
      children.push({ name: entry.name, path: relPath, type: "file", content });
    }
  }
  return children;
}

export function startInspectorServer(rootDir: string): void {
  createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);

    if (url.pathname === "/tree") {
      try {
        const children = await buildTree(rootDir, rootDir);
        const tree = { name: path.basename(rootDir), path: "", type: "dir", children };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(tree));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    } else {
      await serveStatic(url.pathname, res);
    }
  }).listen(PORT, () => {
    console.log(`Inspector: http://localhost:${PORT}`);
  });
}
