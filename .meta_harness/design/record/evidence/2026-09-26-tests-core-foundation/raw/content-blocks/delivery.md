# W1 content-blocks delivery

Dispatcher and receiver: /root. Execution worktree:
`/data/qiwei/repos/omne-harness-lite/.worktrees/core-delivery-content`.
Branch `panqiwei/core-delivery-content`, baseline `f73078ba4f0c28ac88ed0087189648f7a456c252`.
Implementation commit: `44b84525e998113b45e3b0b351caf1041f23cd75` (author panqiwei;
no coding-agent attribution). Tracked changes are confined to `packages/core/content-blocks/**`.
The root lock/catalog, other package sources, frozen spec and realization nodes were not changed.

## Adopted inputs and ownership

The accepted coordinate is `(omne-harness-lite-design-2026-09-15, data.content-blocks, 1)`;
registry catalog/frozen and D-041 / D-042 / D-045 establish adoption. Exact spec contract,
Schema and examples plus realization design/verification hashes are in `input-hashes.txt`.
Spec/Schema/examples hashes match frozen.json; the bundled Schema has the same bytes and hash.
The consumed identity-values implementation is from the foundation already integrated in this
baseline; runtime identity branding uses its public `parseOpaqueIdentifier` and whitespace
regression tests use its public `OPAQUE_IDENTIFIER_WHITESPACE_CODE_POINTS` input.

This package has no authoritative mutable runtime state, lifecycle or provider work to recover.
The input value is the authority for pure judgments, and successful results own frozen copies.
Read syntax and duplicate-member failure precede block judgment. The five named predicates run
over all block positions in the specified order; Schema plus cross-member checks decide the
remaining malformed case. Rejected values are never repaired or returned partly.

## Acceptance evidence

| Obligation | Implementation / evidence | Actual result |
| --- | --- | --- |
| S-1–S-21 public data surface, S-23–S-27 representation | `src/types.ts`, `src/content.ts`, `src/schema.ts`; root public exports and negative declaration consumer | Implemented within pure module scope |
| V-1 | `tests/schema.spec.ts` reads the frozen normative examples: all 162 rows, 60 pass / 102 reject, all 22 defs; copy byte comparison | Pass |
| V-2 / S-26–S-27 | Every ContentBlock normative row, all six section-12 examples, reversed siblings, ignored block-like opaque/arguments; exact refusal and unchanged input | Pass |
| V-3 module part | `tests/content.spec.ts`: mismatched reference media strings, same-modality derivation including text file, modality-free file, canonical strings remain unchanged | Pass |
| V-6 / S-9 module part | `tests/json.spec.ts`: branded opaque with 9007199254740993, nested arrays/objects/null, absence vs null, frozen copies, original JSON decimal literal round-trip | Pass |
| V-11 module part / M36 | Duplicate decoded names at arbitrary tested nesting, escaped Unicode/backslash/quote names, __proto__, exact 12345678901234567890 and decimals, malformed syntax precedence; receiver mapping failure to malformed | Pass |
| Node API prerequisite / M49 | `node-probe.mjs` and `node-probe.json`: actual Node v24.18.0, V8 13.6.233.17-node.50; context.source/rawJSON and public reader/writer preserve all six explicit sources | Pass, six-sample scope only |
| Schema number correctness | LosslessNumber is distinguished from an object; AttachmentRef.bytes integer>=0 tests use original coefficient/exponent, including 1e400 and tiny/negative/noninteger counterexamples | Pass |
| Deep freezing / opaque type | Owned copies recursively frozen; original input remains mutable. OpaqueJson has no public content members; explicit read/write boundary; identity brands differ | Pass |
| Public built module | Independent Node process imports package root and ./schema; large call argument round-trip and all public numeric helpers including 0.1 | Pass |
| Public built declarations | types.spec-d.ts imports package exports/dist declarations; useful negative identities, opaque, calls, reasons, derivations and immutability checks | Pass |
| Format and static scan | `format-staged.log`, `lint.log`; the spoke's 20-rule lint suite | Pass; later HUB rules remain root's verification |

Commands, using this spoke's environment:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm install --ignore-scripts --lockfile=false
pnpm --filter @omne-harness-lite/content-blocks run build
pnpm --filter @omne-harness-lite/content-blocks run typecheck
pnpm --filter @omne-harness-lite/content-blocks run test
node tmp/content-blocks/node-probe.mjs
pnpm run lint:rules
pnpm format:staged
git diff --cached --check
```

Build/typecheck/test logs are in this directory. Final tests: **306 passed, 5 files passed,
zero skip, no type errors**, under vitest 4.1.11 / TypeScript 6.0.3 / pnpm 10.28.1.
The runtime public consumer is a real built Node import; the declaration consumer is the real
package export, not a source alias. Build does not expose the private JSON copy or Schema
projection helpers. No new universal testing wrapper or total package was added.

## Reuse handoff

Stable exported signatures and exact Schema import shape are maintained in the package README.
`readJsonStrict` returns neutral syntax/duplicate_member failure. Downstream reception owns
mapping that failure; stream-assembly owns the one argument parse and unparseable call behavior.
`writeJsonLossless` throws on invalid JS data such as undefined/functions/BigInt/nonfinite
numbers/accessors/cycles instead of silently omitting it. It accepts validated block objects
and unwraps branded opaque only at the explicit serialization boundary.

Technical representation difference for root's realization update: only ordinary safe integer
literals (excluding -0) use number. Other numeric spellings use LosslessNumber, including 0.1
where the original node prose illustrated number. This conservative representation is
explicitly authorized in the dispatch and documented as an implementation choice, preserving
the original decimal value and spelling. It is not claimed to be the original design wording.

Reuse `LosslessNumber`, `LosslessNumber.is`, `isJsonNumber`, `jsonNumberSource` and
`isNonNegativeJsonInteger`. Exact decimals stay textual; future monetary arithmetic belongs
to call-accounts. Numeric wrappers must not be passed to Ajv as ordinary objects or converted
to double to prove original equality/bounds. The current Schema view is **private and specific
to the fixed 22 definitions**: all original AttachmentRef.bytes constraints are checked exactly,
and arguments/opaque permit arbitrary JSON. Consumers with other numeric constraints must
implement their exact original-value checks; no generic Schema projection was released.

Ajv uses strict=true, ownProperties=true and strictTypes/strictRequired=false: the disabled
items are static diagnostics inconsistent with the frozen allOf/not/required composition.
Constraints are not edited. External consumers register the exported Schema `$id` to resolve
their `$ref`s and select the declared def. Refusal names are never chosen from Ajv errors.

## Uncovered and handoff to root

- V-3 message-wide duplicate BlockId, S-3 uniqueness and CallId registration: messages and
  identity construction owners; the pure block judge deliberately does not inspect a message.
- V-4 actual reception/log persistence, V-5 assembly, V-7 immutable stored history, V-8 real
  consumer paths, V-9 cross-process guarantees and the external portions of V-6/V-11 remain
  outside this package. The module tests are not evidence for those paths.
- V-11(1)'s actual stream-assembly transition to rawArguments/unparseable is that owner’s
  obligation. This package supplies the tested neutral parser and proves neither execution
  nor log registration. V-11(2)/(3) every external JSON hop remains its respective owner's duty.
- SC-2 product parsing call whitelist and SC-3 external opaque consumers remain tools/ts-checks
  and consumer owners. This package exposes no rawArguments parser; its public opaque brand
  negative tests only prove the type surface. SC-1/SC-4 remain their documented owners.
- Attachment authorization/dereference is CB-3/G-1; there is no storage/session/runtime code.
- Depth 128, long-input 100000 characters and six Node API probe numbers are finite tests,
  not universal input-size or runtime proofs. No policy cap was added.
- Root owns HUB integration, additional rules, durable record/evidence and realization status
  updates. Implementation completion and package checks do not constitute independent review
  or final acceptance.

The only unique ignored artifacts are this `tmp/content-blocks/` directory. Preserve/hash it
before retiring the spoke. No active local test session remains; the dispatcher can use the
worktree for review and should release it after those consumers finish.
