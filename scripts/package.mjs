import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const stage = `artifacts/bundle-${version}`;
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const file of ["dist", "manifest.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md"]) cpSync(file, `${stage}/${file}`, { recursive: true });
const artifact = `artifacts/claude-watermark-remover-${version}.mcpb`;
execFileSync(process.execPath, ["node_modules/@anthropic-ai/mcpb/dist/cli/cli.js", "pack", stage, artifact], { stdio: "inherit" });
const hash = createHash("sha256").update(readFileSync(artifact)).digest("hex");
writeFileSync("artifacts/SHA256SUMS", `${hash}  claude-watermark-remover-${version}.mcpb\n`);
console.log(`${artifact} sha256 ${hash}`);
