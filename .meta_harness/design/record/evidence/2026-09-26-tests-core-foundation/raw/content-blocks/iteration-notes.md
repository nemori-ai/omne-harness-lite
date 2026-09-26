# Local iteration observations

Baseline f73078ba4f0c28ac88ed0087189648f7a456c252; branch panqiwei/core-delivery-content.
Initial `pnpm install --frozen-lockfile --ignore-scripts` exited 0. After adding the member,
`pnpm install --ignore-scripts --lockfile=false` prepared its links without changing the root lock.

During implementation `typecheck` identified widened frozen result literals, unwrapped opaque
and CallId values, and unavailable TypeScript declarations for JSON.rawJSON. These were fixed
with discriminated results, explicit validated branding/wrapping and actual runtime member
narrowing. An attempted ESNext.JSON lib option failed because TypeScript 6.0.3 does not provide
that lib; it was removed. The public surface does not require a consumer lib augmentation.

The first runtime test run exited 1 with four failed imports (zero executed runtime tests):
`strict mode: required property "renderings" is not defined at ...#/not/anyOf/0 (strictRequired)`.
The accepted Schema puts this property in the shared allOf base. Ajv strictRequired and
strictTypes static diagnostics are disabled explicitly; all data constraints remain unchanged.

After fixes, build / typecheck / tests exited 0: 305 tests, five files, no type errors or skips.
Subsequent final runs include additional built declaration/API and bounded nested/long-input
verification; their raw logs and exact input hashes are preserved alongside this note.
