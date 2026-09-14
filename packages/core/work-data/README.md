# @omne-harness-lite/work-data

This private package is the shared TypeScript and runtime-validation owner for
`data.agent-runtime-identity` v1 and `data.core-work` v1. Its only public entry is
`@omne-harness-lite/work-data`; there is no baseline or source subpath.

The entry exports the complete DTO projection and `Checked`, `JsonLimits`, `parseJson`, `copyJson`,
`parseData`, `canonicalJson`, and `equalJson`. A structurally valid reference remains data: it does
not grant membership, authorization, read, write, control, or execution rights.

`parseJson` rejects non-JSON syntax, duplicate decoded keys, unsupported numeric round trips, and
capacity violations. `copyJson` accepts only ordinary or null-prototype objects and intrinsic dense
arrays with enumerable data properties; it never invokes accessors or `toJSON`. Successful values
and all `Checked` results are detached and deeply frozen. Paths use JSON Pointer. The root has depth
zero, every JSON value counts as one node, `parseJson.maxBytes` counts the input's UTF-8 bytes, and
`copyJson`/`parseData.maxBytes` count the `core-json/1` UTF-8 result.

`core-json/1` sorts object keys by UTF-16 code units, preserves array order, uses JSON string escapes
and finite JavaScript-number JSON spelling, emits no whitespace, rejects negative zero, and requires
integers to be safe. Text number tokens must be mathematically equal to their re-encoded decimal by
sign, coefficient, and base-10 exponent; this prevents silently accepting decimal rounding.

`parseData` first applies the same strict snapshot rules, then validates one exact named `$defs` with
Ajv 8.20.0's draft-2020-12 entry. Both complete schemas are registered before all 29 validators are
compiled. Coercion, defaults, property removal, and remote loading are absent. The package embeds
byte-identical resources with these frozen SHA-256 values:

- `agent-runtime-identity.schema.json`:
  `37393c0774f7a71ee6bf663388a2ec27821740f98b19d487b1299d39829aca74`
- `core-work.schema.json`:
  `1c11b06bb94756cfea6f162173c9f4070be71bf44eb09f8ddeb3e199d579c203`

Run `pnpm run build`, `pnpm run typecheck`, and `pnpm test` from this leaf. The build copies the
checked-in schema resources byte for byte into `dist/schemas`; consumers need only the packed
artifact and its declared dependencies. Passing this package's checks is evidence for its P0
work-data slice of A30/A31, not for records/admission, a model-tool loop, or the full batch.
