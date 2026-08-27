import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging = await mkdtemp(join(tmpdir(), "prime-question-pack-"));

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", staging],
    { cwd: root, encoding: "utf8" },
  );
  const packData = JSON.parse(packOutput);
  const packInfo = Array.isArray(packData) ? packData[0] : Object.values(packData)[0];
  const { filename } = packInfo;
  const tarball = join(staging, filename);

  execFileSync("tar", ["-xzf", tarball, "-C", staging]);
  const packagedRoot = join(staging, "package");
  const packagedManifest = JSON.parse(
    await readFile(join(packagedRoot, "package.json"), "utf8"),
  );
  assert.equal(packagedManifest.pi.extensions[0], "./dist/index.js");
  assert.equal(packagedManifest.engines.node, ">=22.19.0");
  assert.equal(packagedManifest.peerDependencies["@earendil-works/pi-coding-agent"], "*");
  assert.equal(packagedManifest.peerDependencies["@earendil-works/pi-tui"], "*");
  assert.equal(packagedManifest.peerDependencies.typebox, "*");
  await readFile(join(packagedRoot, "dist/index.js"));

  // Resolve the same runtime peers that Prime Agent supplies to an extension.
  const peerPaths = [
    ["@earendil-works/pi-coding-agent", join(root, "node_modules/@earendil-works/pi-coding-agent")],
    ["@earendil-works/pi-tui", join(root, "node_modules/@earendil-works/pi-tui")],
    ["typebox", join(root, "node_modules/typebox")],
  ];
  for (const [name, source] of peerPaths) {
    const target = join(staging, "node_modules", name);
    await mkdir(dirname(target), { recursive: true });
    await symlink(source, target, "junction");
  }

  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "const { default: extension } = await import('./package/dist/index.js'); let tool; extension({ registerTool(candidate) { tool = candidate; } }); if (tool?.name !== 'question') throw new Error('question tool was not registered');",
    ],
    { cwd: staging, stdio: "inherit" },
  );
  console.log(`Packed installation smoke test passed: ${filename}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
