import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(path.join(tmpdir(), "proof-job-"));
const outfile = path.join(dir, "check.cjs");
try {
  execFileSync(path.join(root, "node_modules/esbuild/bin/esbuild"), [
    path.join(root, "lambda/check/jobs.check.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${outfile}`,
  ], { stdio: "inherit" });
  execFileSync("node", [outfile], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
