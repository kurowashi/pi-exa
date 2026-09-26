/**
 * Contract: every import in src/ and every manifest entry has been reviewed
 * once, here.
 *
 * The external import surface is snapshot-tested: a new package or builtin
 * shows up as a failing diff instead of a silent supply-chain edge. Relative
 * imports are checked structurally instead, so moving files stays free.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PACKAGE_ROOT } from "../helpers/loader.ts";

/** Node builtins and packages allowed to appear in src/. */
const ALLOWED_EXTERNAL = new Set(["node:fs", "node:os", "node:path", "@earendil-works/pi-coding-agent", "typebox"]);

/** Packages Pi injects into an extension process, for the peer section. */
const PI_PACKAGES = new Set([
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
	"typebox",
]);

/** Tools used to develop and verify this repository, for the dev section. */
const DEV_TOOLS = new Set([
	"@biomejs/biome",
	"@earendil-works/pi-coding-agent",
	"@types/node",
	"lefthook",
	"typebox",
	"typescript",
]);

interface Manifest {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as Manifest;

test("src imports from nothing outside the reviewed external set", () => {
	const offenders: string[] = [];
	for (const file of sourceFiles()) {
		for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
			if (specifier.startsWith(".")) continue;
			if (!ALLOWED_EXTERNAL.has(specifier)) offenders.push(`${file.replace(PACKAGE_ROOT, ".")} -> ${specifier}`);
		}
	}
	assert.deepEqual(offenders, [], "new external imports need a review and an entry in ALLOWED_EXTERNAL");
});

test("relative imports stay inside the repository and name a .ts file", () => {
	const offenders: string[] = [];
	for (const file of sourceFiles()) {
		for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
			if (!specifier.startsWith(".")) continue;
			if (!specifier.endsWith(".ts")) offenders.push(`${file.replace(PACKAGE_ROOT, ".")} -> ${specifier} (no .ts)`);
		}
	}
	assert.deepEqual(offenders, [], "relative imports must be explicit .ts files for node type stripping");
});

test("runtime dependencies stay empty", () => {
	assert.deepEqual(manifest.dependencies ?? {}, {});
});

test("peer and dev sections stay inside their reviewed sets", () => {
	for (const name of Object.keys(manifest.peerDependencies ?? {})) {
		assert.ok(PI_PACKAGES.has(name), `peer dependency ${name} is not supplied by Pi`);
	}
	for (const name of Object.keys(manifest.devDependencies ?? {})) {
		assert.ok(DEV_TOOLS.has(name), `dev dependency ${name} is not in the reviewed tooling set`);
	}
});

function importSpecifiers(source: string): string[] {
	return [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].flatMap((match) => match[1] ?? []);
}

function sourceFiles(): string[] {
	return readdirSync(join(PACKAGE_ROOT, "src"), { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
		.map((entry) => join(entry.parentPath, entry.name));
}
