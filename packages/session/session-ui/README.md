# @omne-harness/session-ui

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft module package.

## Responsibility and status

The session interface module: one React component, `SessionWorkspace`. It lists your sessions, opens one or creates a new one, sends messages, shows the streamed reply, and cancels a run. It acts only through the `session/v1` protocol client. It does not know the host or identity, and it imports no server member. The consumer is the assembly file of the `apps/desktop` page. [SPEC.md](SPEC.md) owns the behavior.

Implemented: the session list (a column on the left, a drop-down below 720px wide; archived sessions left out), conversation, streamed Markdown, reasoning and tool call cards, tool calls paired with results by call id, the Ask question card (shown only, not answered), confirmation of unknown results, reconnection after the observation ends. Not implemented: answering cards, stopping one call.

## Usage

```tsx
import { SessionWorkspace } from '@omne-harness/session-ui'
import '@omne-harness/session-ui/session-ui.css'

;<SessionWorkspace client={sessionClient} tenant={currentTenantText} />
```

`client` is a `ClientOf<SessionProtocol>`. `tenant` is the tenant text that `query-current-tenant` of `identity/v1` gives. The component starts its own driver when it mounts and aborts its observations and timers when it unmounts. Give it a container with a height. All styles apply under `.omne-session`. Light and dark follow the system, or `data-theme="light" | "dark"` on an ancestor.

Development demo: `pnpm --filter @omne-harness/session-ui run demo`, then open the printed address. A fake protocol client sends frames on a schedule. The demo is not published.

Adapted code: `src/model/composer.ts` from super-assistant `src/desktop/src/renderer/src/conversation/composer-action.ts`; `src/view/scroll.ts` from `scroll.ts` in the same directory (`isNearBottom`); the pairing rule of `tool-pairing.ts` there is implemented in `src/model/conversation.ts`. `src/model/user-message.ts` is equivalent to `userTextMessage` of `@omne-harness/sdk`, with WebCrypto.

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
