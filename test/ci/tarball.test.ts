/**
 * Contract: the packed tarball is exactly the source tree plus package
 * metadata.
 *
 * The expected list is computed from the files on disk and compared as a set,
 * so packing anything outside src/ (tests, configs, this test itself) fails.
 * `--ignore-scripts` keeps the `prepare` hook (lefthook) out of the output and
 * the check side-effect free.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { PACKAGE_ROOT } from "../helpers/loader.ts";

/** npm always adds these; nothing else may appear besides src/. */
const METADATA = ["package.json", "README.md"];

test("the tarball is exactly the source tree plus package metadata", () => {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
		cwd: PACKAGE_ROOT,
		encoding: "utf8",
	});
	const parsed = JSON.parse(output) as Array<{ files?: Array<{ path?: unknown }> }>;
	const shipped = (parsed[0]?.files ?? [])
		.map((file) => file.path)
		.filter((path): path is string => typeof path === "string")
		.sort();

	const source = readdirSync(join(PACKAGE_ROOT, "src"), { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile())
		.map((entry) => relative(PACKAGE_ROOT, join(entry.parentPath, entry.name)));
	const expected = [...METADATA, ...source].sort();
	assert.deepEqual(shipped, expected, "only src/ and package metadata may be published");
});
