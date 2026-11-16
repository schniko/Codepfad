import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { buildNumber } from "../tools/build-version.mjs";

const run = promisify(execFile);

test("Buildnummer zählt Commits der Hauptlinie und bleibt bei erneutem Build gleich", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "codepfad-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "repository");
  await mkdir(repository);
  const git = (...args) => run("git", ["-C", repository, "-c", "user.name=Version Test", "-c", "user.email=version@example.invalid", "-c", "commit.gpgsign=false", ...args]);
  const commit = async name => {
    await writeFile(path.join(repository, name), name);
    await git("add", name);
    await git("commit", "-m", name);
  };
  assert.equal(await buildNumber(repository), null);
  await git("init", "-b", "main");
  await commit("first");
  assert.equal(await buildNumber(repository), "1");
  assert.equal(await buildNumber(repository), "1");
  await git("checkout", "-b", "feature");
  await commit("feature-one");
  await commit("feature-two");
  await git("checkout", "main");
  await commit("second");
  assert.equal(await buildNumber(repository), "2");
  await git("merge", "--no-ff", "feature", "-m", "merge");
  assert.equal(await buildNumber(repository), "3");
  await writeFile(path.join(repository, "uncommitted"), "local edits");
  assert.equal(await buildNumber(repository), "3");

  const shallow = path.join(root, "shallow");
  await run("git", ["clone", "--depth=1", pathToFileURL(repository).href, shallow]);
  await assert.rejects(buildNumber(shallow), /vollständige Git-Historie/);
  assert.equal(await buildNumber(shallow, "42"), "42");
  await assert.rejects(buildNumber(repository, "<invalid>"), /positive ganze Zahl/);
});
