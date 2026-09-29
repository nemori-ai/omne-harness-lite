# T26 19a3b968 precise definition closure and executable minimal-resource graph

Bounded result: exit 0. MS7's 50 public definitions and MR10's 25 public definitions compiled using nine exact canonical resources each. Eighteen fresh omission graphs (one removed resource per package graph) each raised a real `MissingRefError` whose `missingSchema` equals the omitted URI. This supports the candidate graph correction; production registration, dependencies and acceptance were not changed. Current HUB runtime build remains failed per root's actual handoff; this result does not make HUB green.

## Fixed inputs and provenance

- Actual source: `19a3b968fa5effed845341612959621eaa8c4d1d`, read using `git show`, not mutable HUB working files. Own branch remains `panqiwei/model-request-runtime-t26-rolling` / `e66ddc9dc4887a991bdde8d712ce65144cc21836`.
- Core-resource prior audit: fixed `96ae5241b935f7735051f2ffae452a6d978c383c`. `prior-current-core-delta.json` is empty: all core package paths unchanged through 19a. Independently extracted public root arrays and source SHA agree with the prior audit. Prior files are preserved here for traceability; the executable graph is independently derived.
- `closure.json` records every public root, visited definition/pointer, reference edge, resource byte SHA, source SHA and 16 package Schema → canonical spec byte matches. `schema-runtime-source-audit.json` records unchanged public compiler implementation and manifest between e66 and 19a.
- Executed compiler is the public content-blocks schema-runtime installed in T26's independently packed e66 consumer, previously archive/source/installed-byte audited. No author dist was executed. Runtime JS SHA256: `8b9d5514807d51e11097a2a32aeecedd1325291edc8c59202b8036b945ac2c28`; Node v24.18.0, TypeScript 6.0.3.

## Definition-level algorithm and applicability

Public roots are extracted from the actual TypeScript AST of `SCHEMA_DEF_NAMES`, requiring a unique literal string array. URI+JSON Pointer traversal starts at those roots, checks resource/pointer existence and follows references inside the reached definitions; it does not treat every unused definition in a registered file as a root. A visited set terminates cycles. Arbitrary property-map names (including a property called `default`) are distinct from actual annotation/default/constant data, which are excluded from reference traversal.

Across all 16 resources reached by the MS/MR/AE/LC public root sets, `$dynamicRef`, `$recursiveRef`, nested `$id`, anchors/dynamic anchors and annotation-contained `$ref` are absent. The algorithm refuses these unsupported constructs; this is an input-specific result, not a general Schema resolver. Measurement self-tests cover annotations, property names, escaped pointers, unused definitions, a definition cycle, missing resources and missing pointers (all pass). Exact-resource negative tests additionally check a causal missing-URI witness, not an arbitrary error or process exit.

| Current public root | Public definitions | Independently reached canonical resources | Production registered resources | Executed here                        |
| ------------------- | -----------------: | ----------------------------------------: | ------------------------------: | ------------------------------------ |
| MS7                 |                 50 |                                         9 |                              22 | all 50 compile; 9 omission negatives |
| MR10                |                 25 |                                         9 |                              25 | all 25 compile; 9 omission negatives |
| AE2                 |                 14 |                                         4 |                               4 | static only; CA2 still required      |
| LC6                 |                 43 |                                        10 |                              21 | static only; MS6/CA2 still required  |

MS graph: MS7, CB3, CB2, OE1, CA3, IV1, MP5, MP6, TD3.

MR graph: MR10, CA3, IV1, MP5, CB2, OE1, LC6, CB3, MS7. MR's reached MS7 branch does not reach created-payload MP6/TD3; its LC6 branch is FailureCause, not all LC6 definitions.

MR's source-defined private members view was also reconstructed faithfully (remove `allOf` only for ModelResponse/PendingModelResponse and `dependentRequired` for Failure), keeping the nine canonical files plus one derived private resource. Both private entry definitions compile. This is compiler initialization coverage only; it does not test finalization semantics or amend the normative Schema.

## Actual command and raw results

From the own worktree:

```sh
node tmp/model-request-runtime/t26-rolling/19a3b968-minimal-graph/verify-minimal-graph.mjs
```

Actual exit 0; elapsed 3.946 seconds. `command.json` fixes argv/cwd, script SHA and terminal status. `execution.log`, `execution.exit`, `execution-results.json` retain raw results. Rerun requires the existing own e66 installed consumer and the local source commits. The evidence directory's node_modules symlink resolves only to that own consumer.

Earlier measurement attempts are retained: attempt 1 used CommonJS resolution against an import-only export; attempt 2 initially mistook ToolSettings properties called default for annotation keywords. Only measurement resolution/traversal was corrected, with added self-tests; no product assertion, fixture contract or timeout was weakened.

## Exact omission witnesses

| Graph          | Omitted exact canonical resource                 | First observed failing public compile | Actual witness                                 |
| -------------- | ------------------------------------------------ | ------------------------------------- | ---------------------------------------------- |
| messages       | `call-accounts/v3/call-accounts.schema.json`     | `SystemReminderMessage`               | MissingRefError; exact `missingSchema` matches |
| messages       | `content-blocks/v2/content-blocks.schema.json`   | `ModelCallDispatchedRecord`           | MissingRefError; exact `missingSchema` matches |
| messages       | `content-blocks/v3/content-blocks.schema.json`   | `MessageBase`                         | MissingRefError; exact `missingSchema` matches |
| messages       | `identity-values/v1/identity-values.schema.json` | `ModelCallDispatchedRecord`           | MissingRefError; exact `missingSchema` matches |
| messages       | `messages/v7/messages.schema.json`               | `MessageId`                           | MissingRefError; exact `missingSchema` matches |
| messages       | `model-profile/v5/model-profile.schema.json`     | `ModelCallDispatchedRecord`           | MissingRefError; exact `missingSchema` matches |
| messages       | `model-profile/v6/model-profile.schema.json`     | `ModelCallCreationInput`              | MissingRefError; exact `missingSchema` matches |
| messages       | `offer-expiry/v1/offer-expiry.schema.json`       | `MessageBase`                         | MissingRefError; exact `missingSchema` matches |
| messages       | `tool-definition/v3/tool-definition.schema.json` | `ModelCallCreationInput`              | MissingRefError; exact `missingSchema` matches |
| model-response | `call-accounts/v3/call-accounts.schema.json`     | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `content-blocks/v2/content-blocks.schema.json`   | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `content-blocks/v3/content-blocks.schema.json`   | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `identity-values/v1/identity-values.schema.json` | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `loop-extension/v6/loop-extension.schema.json`   | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `messages/v7/messages.schema.json`               | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `model-profile/v5/model-profile.schema.json`     | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `model-response/v10/model-response.schema.json`  | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |
| model-response | `offer-expiry/v1/offer-expiry.schema.json`       | `ResponseId`                          | MissingRefError; exact `missingSchema` matches |

AJV reports every MR omission during its first `ResponseId` compile because of actual registered-resource resolution behavior. This is a witness for the aggregate public graph under the actual engine; it does not mean ResponseId's logical value shape directly needs all nine resources. “Minimal” here means each of the nine exact full canonical files is necessary to compile this aggregate public-root set with this engine and unchanged files; no claim is made about substituted fragments or a redesigned compiler.

## Adoption and remaining gates

Root owns any adopted change to provider registrations, manifests, realization/verification roots or source. MS production22/MR production25 are still unchanged. AE2/LC6 are only statically audited here and still have precise CA2/MS6 references; executable initialization and the exact registrations require the provider correction. See `IMPACT-MATRIX.md` for the actual A1/A2/A3 source match and e66 invalidation boundaries. No full package build, pack, repeated 37-model CLI gate, runtime service suite, vendor call or paid request was run in this increment. Local engineering evidence is not online vendor certification. Final acceptance and TODO updates remain root-owned.
