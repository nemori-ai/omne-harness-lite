# @omne-harness/assets-ui

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft module package.

## Responsibility and status

The settings interface module: one React component, `SettingsPanel`. It lists every setting of the current tenant's layer. For each setting it shows the description, the effective value, the layer the value comes from, and whether this layer can change it (and why not). It changes a permission item's pick and clears an item. It acts only through the `assets/v1` protocol client. It does not know the host or identity, and it imports no server member. The consumer is the assembly file of the `apps/desktop` page. [SPEC.md](SPEC.md) owns the behavior.

Implemented: the list with all its pages, the permission pick with one radio per choice, clear for every kind, rereading an item after a write or a revision conflict, confirmation of unknown write results with the same operation. Not implemented: input controls for ordinary values and secrets (RFC-0015 gives none; they are shown read-only).

## Usage

```tsx
import { SettingsPanel } from '@omne-harness/assets-ui'
import '@omne-harness/assets-ui/assets-ui.css'

;<SettingsPanel client={assetsClient} tenant={currentTenantText} />
```

`client` is a `ClientOf<AssetsProtocol>`. `tenant` is the tenant text that `query-current-tenant` of `identity/v1` gives. The component starts its own driver and reads the list when it mounts; after it unmounts, late answers change nothing. All styles apply under `.omne-settings`. Light and dark follow the system, or `data-theme="light" | "dark"` on an ancestor.

## Contracts

<!-- documentation:placeholder -->

Link public types, necessary validation, and the sole behavior owner. SPEC.md owns behavior beyond types, and docs/public-api.md indexes the public definitions. Identify error, lifecycle, and resource responsibilities without copying signatures or state machines.

## Design

<!-- documentation:placeholder -->

Summarize internal modules and invariant owners. The full design belongs in docs/architecture.md, docs/flows.md, and docs/object-model.md.

## Configuration and operation

<!-- documentation:placeholder -->

Describe configuration owners, defaults, environment requirements, and explicit dependencies. State the caller and package responsibilities during operation.

## Verification

<!-- documentation:placeholder -->

List repeatable commands, properties, assumptions, and uncovered behavior. Add tests with actual assertions. Passing structure checks does not establish business behavior.

## Maintenance

<!-- documentation:placeholder -->

Identify consumers and checks that must change with public contracts, resources, or dependencies. Explain inapplicable information. Record named gaps for unknown information.

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
