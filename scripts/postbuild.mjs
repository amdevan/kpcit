import { copyFile, mkdir, symlink, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const serverDir = path.resolve("dist/server");
const indexJs = path.join(serverDir, "index.js");
const serverJs = path.join(serverDir, "server.js");

async function ensureServerEntry() {
  if (!existsSync(indexJs)) {
    throw new Error(`Missing SSR build output: ${indexJs}`);
  }

  if (existsSync(serverJs)) {
    return;
  }

  try {
    await symlink("index.js", serverJs);
  } catch {
    await copyFile(indexJs, serverJs);
  }
}

async function ensureScriptsDir() {
  await mkdir(path.resolve("scripts"), { recursive: true });
}

async function main() {
  await ensureScriptsDir();
  if (existsSync(serverDir)) {
    await ensureServerEntry();
  }
}

try {
  await main();
} catch (err) {
  try {
    await unlink(serverJs);
  } catch {}
  throw err;
}
