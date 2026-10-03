import { build } from "esbuild";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

mkdirSync("dist", { recursive: true });
const built = await build({
  entryPoints: ["src/index.ts"], outfile: "dist/index.cjs", bundle: true,
  platform: "node", format: "cjs", target: "node22", minify: false,
  banner: { js: "#!/usr/bin/env node" }, legalComments: "eof", metafile: true,
});
chmodSync("dist/index.cjs", 0o755);
// pnpm nests transitive packages under node_modules/.pnpm: take each package's root from the bundled file's own path.
const roots = new Map();
for (const file of Object.keys(built.metafile.inputs)) {
  const at = file.lastIndexOf("node_modules/");
  if (at < 0) continue;
  const parts = file.slice(at + 13).split("/");
  const name = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  roots.set(name, file.slice(0, at + 13) + name);
}
const packages = new Set(roots.keys());
let notices = "# Bundled dependency licenses\n\n";
for (const name of [...packages].sort()) {
  const root = roots.get(name);
  const meta = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const license = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "LICENSE-MIT"].find(file => existsSync(path.join(root, file)));
  if (!license) throw new Error(`Review the license file for ${name} before packaging.`);
  notices += `## ${name} ${meta.version} (${meta.license})\n\n${readFileSync(path.join(root, license), "utf8")}\n\n`;
}
writeFileSync("THIRD_PARTY_NOTICES.md", notices);
