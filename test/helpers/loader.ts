/**
 * Loads the real extension entry through Pi's loader (jiti), the same path Pi
 * uses at runtime. Contract tests therefore validate the shipped artifact
 * rather than a re-import of the modules under test.
 *
 * The loader also scans project and global extension directories, so both are
 * redirected to an empty sandbox to keep the test hermetic.
 */

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverAndLoadExtensions, type Extension } from "@earendil-works/pi-coding-agent";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repository root, derived from this file: test/helpers/ -> ../.. */
export const PACKAGE_ROOT = join(HERE, "..", "..");

export async function loadExaExtension(): Promise<Extension> {
	const sandbox = mkdtempSync(join(tmpdir(), "pi-exa-contract-"));
	const result = await discoverAndLoadExtensions([join(PACKAGE_ROOT, "src", "index.ts")], sandbox, sandbox);
	assert.deepEqual(result.errors, [], "the extension must load without errors");
	assert.equal(result.extensions.length, 1, "the sandbox must load only this extension");
	const extension = result.extensions[0];
	assert.ok(extension, "the loader must return the extension");
	return extension;
}
