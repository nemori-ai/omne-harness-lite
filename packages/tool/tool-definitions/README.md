# @omne-harness/tool-definitions

[中文](README_ZH.md)

## Responsibility and status

Files and Shell authors execute through authorized facilities. The root entry supports independent Tool execution. Production Cordis binding and real backend verification remain with the parent delivery.

## Usage

Import createFilesAuthor or createShellAuthor. Pass explicit JsonValue construction. See [consumer use](docs/context.md) and the executable [test driver](tests/run-author.ts).

## Contracts

[Public source](src/index.ts) owns types. [SPEC](SPEC.md) owns behavior, failure and resource boundaries. [Public API](docs/public-api.md) lists exports.

## Design

One command table supplies declarations, validation and help. Files preflights edits before writes. Shell uses the exact injected command or terminal facility. See [architecture](docs/architecture.md).

## Configuration and operation

resultMaxBytes is required. Shell also requires executable, argsPrefix, cwd and env. Files accepts an optional absolute cwd: relative paths resolve against it before the facility call (R2-D290). The caller supplies current authorization and placement facts. Authors never read host defaults.

## Verification

Run the package build, typecheck and test scripts. [Tests](tests/README.md) use public authors with real Tool scopes and non-durable facilities. They do not prove real filesystem, PTY or production authorization behavior.

## Maintenance

Update the command table and behavior tests together. Coordinate environment facade changes with the host. Keep pending binding facts in [Cordis](docs/cordis.md).

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

## TodoItems

`createTodoItemsAuthor` and `todoItemsToolModule` provide help, add, remove, mark_complete and list through one wrapped declaration. Construction accepts only a positive safe integer `resultMaxBytes`. The environment is null.

The host calls `attachTodoItems` after `attachToolsCapability`. Both attachments use the final context. `finish` removes access before cleanup and returns the same Promise on repeated calls. [The port](src/todo-items-port.ts) accepts only bound business arguments.

Results preserve complete Session receipts, pages, cursors and failures as JSON. Unknown commits retain the original operation. Output over budget returns unavailable and asks for a smaller list limit. A 1 MiB deployment budget does not cover every valid page because JSON escapes can expand control characters. Tiny budgets can fail output validation.

[Author tests](tests/todo-items.spec.ts) cover real Tool decoding, execution and output with bound test providers. They do not prove SQL persistence, application delivery or automatic Context projection. See [SPEC](SPEC.md#todoitems-作者).

## Web

`createWebAuthor` and `webToolModule` provide help, search and fetch through one wrapped declaration. Construction accepts only the positive safe integers `resultMaxBytes` and `maxSearchResults`. The environment is null and the author declares no settings in this slice.

The host calls `attachWebAccess` after `attachToolsCapability` with a `WebAccess` implementation ([the port](src/web-port.ts)); the author never sees a key, a supplier or a tenant. search writes titles, urls, dates and excerpts; fetch writes the final url, the media type and the Markdown body. Web content sits between external data marks. Every failure is one `<kind> reason=` line from the closed `WebFailure` set; `unconfigured` names the Web setting `exa.apiKey`.

[Author tests](tests/web.spec.ts) use a scripted port; the network provider is `@omne-harness/tool-host-local/web`. See [SPEC](SPEC.md#web-作者).
