# @omne-harness-lite/model-profile

[中文](README_ZH.md)

Model profile data, exact scoped references, and request parameter validation. Describe a route and its provider/modality limits without binding it to credentials or a model client.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                  | Use                                                         |
| --------------------------- | ----------------------------------------------------------- |
| `judgeModelProfileDocument` | Judge profiles, creation content, references and parameters |
| `refMatches`                | Compare a reference to one supplied row and scope           |
| `parameterNames`            | List unified parameter names and keys in `extra`            |
| `ModelProfileSnapshot`      | Type the profile facts captured by a request writer         |
| `InputLimitFact`            | Distinguish unknown, unbounded and finite upstream limits   |
| `UpstreamInputLimits`       | Carry the upstream facts for every applicable metric        |
| `InputConstraints`          | State this profile's finite project input caps              |
| `validate`                  | Validate any exported schema definition                     |

## Judge a profile and its output limit

Use the full judge for relationships that schema shape alone cannot enforce.

```ts
import {
  judgeModelProfileDocument,
  validate,
  parameterNames,
  type ModelProfile,
} from '@omne-harness-lite/model-profile'

const profile: ModelProfile = {
  routeName: 'vendor/chat',
  adaptation: {
    implementation: { name: 'example-family', revision: 'r1' },
    definition: { modelId: 'vendor/chat', revision: 'd1' },
    configuration: { revision: 'c1', values: {} },
  },
  origin: 'official',
  providers: ['provider-a'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  parameters: { maxOutputTokens: 4096, extra: { top_k: 40 } },
  registration: 'listed',
  updatedAt: '2026-09-26T10:00:00Z',
}
console.log(judgeModelProfileDocument('ModelProfile', profile)) // { ok: true }
if (profile.parameters === undefined) throw new Error('Parameters required')
console.log(parameterNames(profile.parameters)) // ['maxOutputTokens', 'top_k']
const oversized = { ...profile, parameters: { maxOutputTokens: 8193 } }
console.log(validate('ModelProfile', oversized).valid) // true
console.log(judgeModelProfileDocument('ModelProfile', oversized))
// { rejected: 'max_output_exceeds_profile' }
```

## Match a custom reference in its exact scope

The profile row carries no scope field. Its directory supplies scope as a separate argument; withdrawal does not alter identity matching.

```ts
import { parseScopeLayerIdentity, unwrap } from '@omne-harness-lite/identity-values'
import {
  refMatches,
  type ModelProfile,
  type ModelProfileRef,
} from '@omne-harness-lite/model-profile'

const alice = unwrap(
  parseScopeLayerIdentity({
    layer: 'tenant',
    tenant: { organization: 'org_acme', account: 'acc_alice' },
  }),
)
const bob = unwrap(
  parseScopeLayerIdentity({
    layer: 'tenant',
    tenant: { organization: 'org_acme', account: 'acc_bob' },
  }),
)
const profile: ModelProfile = {
  routeName: 'vendor/chat',
  adaptation: {
    implementation: { name: 'example-family', revision: 'r1' },
    definition: { modelId: 'vendor/chat', revision: 'd1' },
    configuration: { revision: 'c1', values: {} },
  },
  origin: 'custom',
  providers: ['provider-a'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 32000,
  maxOutputTokens: 8192,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  registration: 'withdrawn',
  updatedAt: '2026-09-26T10:00:00Z',
}
const ref: ModelProfileRef = { origin: 'custom', routeName: 'vendor/chat', scope: alice }
console.log(refMatches(ref, profile, alice)) // true
console.log(refMatches(ref, profile, bob)) // false
```

## Failures and boundaries

`judgeModelProfileDocument` judges four document kinds: `ModelProfile`, `ModelProfileContent`, `ModelProfileRef` and `ModelRequestParameters`. It returns one `{ rejected }` in a fixed order, with malformed structure checked first. `validate` checks schema shape; cross-field checks such as `max_output_exceeds_profile` require the judge. `ModelProfileSnapshot` has a type and schema entry, but no document-judgment entry.

References compare exact origin, route name and, for custom profiles, supplied scope. Names are case-sensitive and are not Unicode-normalized. A mismatch is a boolean about the supplied row, not a directory lookup failure. Matching does not check registration or authorization.

Numeric fields accept `JsonNumber`, including `LosslessNumber`; judgments compare exact represented numbers. Missing request parameters are not filled in. The package does not store profiles, create snapshots, enforce name uniqueness, manage credentials or send OpenRouter requests; request routing and lifecycle belong to consumers.

The JSON Schema is available through `@omne-harness-lite/model-profile/schema`. See [source exports](src/index.ts), [tests](tests/) and [model response](../model-response/README.md).

The default entry and Schema use `data.model-profile/v5`. Current profiles must supply all required facts. The `./schema/v2` resource remains available solely for exact references in current specification dependencies; there is no `./v2` executable entry. An image-capable profile requires an explicit project `maxImageBytes` cap plus upstream `maxImageBytes` and `maxImages` facts, even for text-only calls. Project caps remain finite when an upstream fact is `unknown` or `unbounded`.

```ts
const imageProfile: ModelProfile = {
  ...profile,
  inputModalities: ['text', 'image'],
  inputConstraints: { maxImageBytes: 4_000_000, maxImages: 4 },
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
    maxImageBytes: { status: 'limited', value: 8_000_000 },
    maxImages: { status: 'unknown' },
  },
}
console.log(judgeModelProfileDocument('ModelProfile', imageProfile)) // { ok: true }
```

`validate` checks Schema shape. The full judge also compares each supplied project cap with any known finite upstream value, without rounding. The `ModelProfileSnapshot` type and Schema retain both input-limit objects; the request writer owns the actual copy and history. See the accepted design for the precise boundary.
