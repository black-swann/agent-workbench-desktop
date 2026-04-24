import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const bundleDir = path.join(repoRoot, "src-tauri", "target", "release", "bundle", "deb");
const outputPath = path.join(bundleDir, "SHA256SUMS");

const entries = await readdir(bundleDir, { withFileTypes: true });
const artifacts = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".deb"))
  .map((entry) => entry.name)
  .sort();

if (artifacts.length === 0) {
  throw new Error(`No .deb artifacts found in ${bundleDir}`);
}

const lines = [];
for (const artifact of artifacts) {
  const artifactPath = path.join(bundleDir, artifact);
  const digest = createHash("sha256")
    .update(await readFile(artifactPath))
    .digest("hex");
  lines.push(`${digest}  ${artifact}`);
}

await writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
