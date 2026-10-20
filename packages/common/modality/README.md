# @omne-harness/modality

[中文](README_ZH.md)

Module package for modalities. It gives capability contracts one list of the four modalities and one rule that reads the modality from a media type. The behavior contract is [SPEC.md](SPEC.md).

## Responsibility and status

This member owns the type `Modality`, the list `MODALITIES`, and five functions: `judgeModality`, `judgeModalities`, `judgeMediaType`, `isCanonicalMediaType`, and `missingModalities`. It has no runtime dependency. It imports no other member and it does not import Cordis.

The named consumers are Model and Tool. Model uses the modalities for profile inputs and outputs, for converter keys, and to read the modality of a content block from its media type. Tool uses them for the parameter modalities and the result modalities of a tool definition. Later, session, agent, and infrastructure members can use the same entry. The current track has no production call site. The Model trunk session confirmed on 2026-10-19 that the meaning is the same as in the Model contract. PanQiWei accepts the media type table with issue #397.

This member says which modalities exist. It does not say which modalities a consumer supports. It does not map block kinds to modalities. It does not hold the history projection, the converter selection, or the initial text rule. [SPEC.md](SPEC.md) lists what is out of scope.

## Usage

Import the public entry by package name. The package has no Cordis entry. [docs/context.md](docs/context.md) lists the consumers and the install closure.

```ts
import { judgeMediaType, judgeModalities, missingModalities } from '@omne-harness/modality'

judgeMediaType('Audio/WAV; rate=8000') // { ok: { mediaType: 'audio/wav', modality: 'voice' } }
judgeMediaType('application/pdf') // { ok: { mediaType: 'application/pdf', modality: null } }
judgeMediaType('image/') // { rejected: 'media-type' }

judgeModalities(['text', 'image', 'text']) // { rejected: 'duplicate', index: 2 }
missingModalities(['image', 'voice'], ['text', 'image']) // ['voice']
```

## Contracts

[SPEC.md](SPEC.md) owns the behavior. [docs/public-api.md](docs/public-api.md) indexes the exports in [src/index.ts](src/index.ts).

`Modality` is one of `text`, `image`, `voice`, `video`. Every `audio/*` media type reads as `voice`. A media type with another top-level type, for example `application/pdf`, belongs to no modality, and its modality is `null`. A judgment does not throw for a plain value. It returns `{ ok }` or `{ rejected }`. An error from a getter or a Proxy on the input, or an engine resource limit (see [SPEC](SPEC.md#所有权失败与生命周期)), passes through unchanged. `judgeModalities` allows an empty list. A consumer that needs a non-empty list checks it itself.

## Design

`src/index.ts` is the only module. It holds the types, the list, and the functions. It has no state, no import, and no configuration. The media type rule follows the grammar of RFC 9110 section 8.3.1, with the parameter grammar of section 5.6.6. An empty parameter slot such as `image/png;` is valid. [docs/architecture.md](docs/architecture.md) gives the mechanism and the reasons. [docs/object-model.md](docs/object-model.md) explains the values. [docs/flows.md](docs/flows.md) and [docs/cordis.md](docs/cordis.md) state why flows and Cordis do not apply.

## Configuration and operation

This package reads no environment variable and starts no process. Installing it installs no other package at run time.

## Verification

Applicable tests are unit tests, contract tests from the public entry, and a type test. The tests import the package by name. That name resolves to `dist/index.js`, so the tests also check independent consumption of the build. Integration tests and end-to-end journey tests do not apply. This package has no storage, service, or user journey.

| File | Covers |
| --- | --- |
| `tests/modality.spec.ts` | `MODALITIES`, `judgeModality`, `judgeModalities`, and `missingModalities` |
| `tests/media-type.spec.ts` | `judgeMediaType` and `isCanonicalMediaType`: the table, the grammar, and the rejections |
| `tests/modality-types.spec-d.ts` | The exact type of `Modality` and the rejection reasons of each judgment |
| `tests/public-entry.spec.ts` | The exact runtime exports, empty `dependencies`, the single `.` export, and artifacts without imports |

turbo builds `dist` and the dependencies first, then runs the tests: `pnpm turbo run test --filter=@omne-harness/modality`. `pnpm test` in this directory runs Vitest only and does not build. Run `pnpm typecheck` to check the tests against the source types.

## Maintenance

A change to the modality list, to the media type table, or to a rejection reason changes the public contract. Update SPEC.md first, then both READMEs, then synchronize the consumers. A new dependency, and any new entry, need a new adoption decision. Model and Tool adopt this member in their own deliveries. Until then they keep their own copies, and each of them removes its copy when it adopts this member.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Key business flows and data flows
├── object-model.md       Internal object model
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Cordis applicability and integration
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths. A docs topic can grow into a directory of the same name with README.md and index.md. Keep this map current when a topic moves.
