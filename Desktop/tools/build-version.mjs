import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function buildNumber(repository, override = process.env.CODEPFAD_BUILD_NUMBER) {
  if (override !== undefined) {
    if (!/^[1-9]\d*$/.test(override)) throw new Error("CODEPFAD_BUILD_NUMBER muss eine positive ganze Zahl sein.");
    return override;
  }
  try { await access(path.join(repository, ".git")); }
  catch { return null; } // Source archives can still be previewed without Git metadata.

  const git = async args => (await run("git", ["-C", repository, ...args])).stdout.trim();
  if (await git(["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error("Die Buildnummer benötigt die vollständige Git-Historie (git fetch --unshallow).");
  }
  // A merge into the release branch counts as one step, like any other commit.
  return git(["rev-list", "--first-parent", "--count", "HEAD"]);
}
