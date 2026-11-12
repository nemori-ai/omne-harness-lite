# @omne-harness/session-observation

[中文](README_ZH.md)

Session observation: what a logged-in person sees in one session right now. Template variant: `cordis-module`.

## Responsibility and status

This package answers the question "what is this session doing now". It reads the session log and the public Model stream. It gives one sequence of frames: whether a run started, whether the log has new committed content, and what reply is being generated. Reading history gives the committed content. History is the authority. Observation is only a projection of work in progress.

This package is the integration member of the Session group that knows both the Session contract and the Model contract. It writes nothing. It makes no authorization decision. It does not cancel Model calls. The owners of the two sides decide whether access is allowed. This package only passes on a refusal.

Consumers: the `session-observation` row of the server application publishes the Service `sessionObservation`. A later plugin of the access group connects it as the frame source of `observe-session`.

Status: `draft`. [SPEC](SPEC.md) is a candidate specification.

- Implemented: the domain face `open`; the locate (reads the log, finds the revision, the current run and the newest main call); the refresh budget; wake-up by commit notices; teardown on abort; the Cordis binding in `./cordis`.
- Not implemented (block 2): asking the Model for the current stream, the stream subscription, and the `snapshot`, `delta` and `gap` frames. Current limit: the locate does not ask the Model, so `phase` and `target` stay `null`.
- Not verified: formal model 3 is still in the access group and was not rerun here. Delivery of commit notices across rows was tested on one local tree only.

## Usage

The caller holds the observer's own principal, the tenant, the session, and an `AbortSignal`:

```ts
const opened = await sessionObservation.open({ access, signal })
if (opened.kind === 'opened') {
  for await (const frame of opened.frames) {
    // frame.kind is 'state', 'refreshing', and so on
  }
}
```

- `open` has three results: `opened`, `denied` and `unavailable`. A refusal, a session that does not exist and an invalid identifier all give `denied`. The caller cannot tell them apart.
- When the frames end, the reason is the return value of the generator. An aborted observation returns `undefined`.
- To stop an observation, abort the `signal` or call `return` on the generator. The package then releases its own subscriptions and timers.

Independent use: import `createSessionObservation` from the root entry `@omne-harness/session-observation` and supply `SessionObservationPorts`. The root entry does not import Cordis.

Cordis integration: load `createSessionObservationPlugin({ historyKinds })` from `@omne-harness/session-observation/cordis`. It publishes the Service `sessionObservation`. See [docs/cordis.md](docs/cordis.md).

## Contracts

- Public types and exports: [src/index.ts](src/index.ts) and [src/cordis.ts](src/cordis.ts). For navigation, see [docs/public-api.md](docs/public-api.md).
- Sole owner of the behavior beyond types: [SPEC.md](SPEC.md). It covers the domain face, the five objects, the table of cells against test cases, how the locate reads, the refresh budget, notices, abort and the current limit.
- Error, lifecycle and resource duties: see the ownership and failure section of the SPEC.

## Design

Five objects each have one reason to change: the observation (the exit of frames), the locate (reads the log), the refresh budget (policy), the frame translation (outward form) and the stream subscription (block 2, not implemented). The logic works only against the port type `SessionObservationPorts`. The Cordis subscription and filter are in the thin adapter in `./cordis`. For the full design, see [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The assembly supplies the configuration. The input of the plugin factory has only `historyKinds`. The rest is the row configuration `SessionObservationConfig`. The plugin receives it as the second argument of `apply`. A value that is not given takes the default of this member:

- `historyKinds` (input of the plugin factory, required): the entry kinds that reading history gives. With the three fixed kinds, they decide which commit notices count as new content.
- `policy` (row configuration, optional): some or all fields of the refresh policy `ObservationRefreshPolicy`. Each field that is given replaces its default. The default seeds are `interval` 1000 ms, `backoff` 1.5, `maxAttempts` 60, `deadline` 30 minutes and `currentTimeout` 5000 ms. An `interval` below 100 ms is raised to 100 ms and a diagnostic is recorded.
- `locatePages` (row configuration, optional): the number of pages that one backward read can read at most. Default: 4.

At run time the package needs the session Service (injected as the `reader` caller class), the event `session-cordis-contract/committed`, and the two public Model stream faces. The caller must pass the observer's own principal and must abort when it no longer needs the observation. The package releases its own reads, subscriptions and timers.

## Verification

Run this command in the member directory:

```sh
pnpm exec vitest run --mode fast
```

The tests use fake ports and a fake `wait`. They cover the domain face, the locate axis, no lost wake-up, abort, the refresh budget and the exports of both entries. Formal model 3 is in [packages/access/server-entry/verification/models](../../access/server-entry/verification/models/SessionObservation.tla). It stays there until it moves.

Not covered: all stream behavior (block 2, not implemented). The link between code and model rests on contract tests and the refinement mapping only. The composition and verification section of the SPEC lists the claims that this package cannot make.

## Maintenance

- To change a port, the policy or a frame shape: update the public definitions in `src/`, the SPEC, `docs/public-api.md`, `tests/`, and the consumers (the `session-observation` row of the server application and its demo script).
- To change how the log or a call registration is read: the Session contract owns `readCallRegistration` and the test for a run in progress. Change its SPEC first.
- When the stream side is added: remove the current limit from the SPEC, complete the cells marked "block 2, not implemented" and their test cases, and move formal model 3 here.

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
