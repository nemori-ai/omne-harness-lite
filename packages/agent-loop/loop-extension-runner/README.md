# `@omne-harness-lite/loop-extension-runner`

Public, host-independent execution of one loop-extension pass, plus the pure `runner/5` conclusion building blocks. `runPass` executes an ordered chain, commits each conclusion before advancing, resumes a durable ask through an explicitly controlled waiting source, and returns the complete conclusion history and effective result. The package also derives pass keys, reads effective retry conclusions, and reconstructs effects.

This package is a public function layer, not a Cordis plugin or runner service. The host supplies authenticated scope, the actual Run when needed, the complete log prefix, ordered definitions, contributor execution, waiting/card facts, and capability judgments through typed ports. `runPass` does not create a Run or decide whether a model retry may be sent. `readRunnerRetryConclusions` checks supplied entries and dense positions but cannot prove that the caller had permission to read them.

The adopted scope is [D-106](../../../.meta_harness/design/record/decisions/runner-current-pure-provider-adoption/decision.md), using [Runner5](../../../.meta_harness/design/spec/capabilities/loop-extension-runner/v5/contract.md), [LC6](../../../.meta_harness/design/spec/data/loop-extension/v6/contract.md), and the [v6 realization](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v6-run-pass-design.md) over [v5](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v5-current-design.md). [Verification obligations](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/verification.md) distinguish this function layer from the pending production host integration.

## Public API

- `runPass(pass, chain, ports, signal)` returns `{ conclusions, effect }` or a named failure. The history retains old asks after a final; only effective finals and the current ask determine the result. `noRun` is legal only for eligible user/system `before_persist_message` input. A pending ask does not invoke again; a ready ask requires an owner-provided replay binding and a deviation latch independent of contributor errors.
- `createRunnerLogAdapter({ log, binding, owner, subjectForCandidate })` connects conclusion reads and writes to an SL3 `SessionLog`. The invocation host binds `subjectForCandidate` to the current original subject for each proposed conclusion; the adapter validates it and retains it for legal-winner recovery. `createRunnerTaskOwner(binding)` registers read/write work before provider calls, retains unknown append outcomes, and exposes `closeAdmission`, `reconcileStoppedLog`, and `drain`. The real log host must close the old physical writer and admit recovered reads before reconciliation; a new empty read alone is not proof of absence.
- `createRunnerReminderLogAdapter({ log, binding, owner, readMessagePrefix })` uses the model runtime's `mrr/3` MessageId key and full message value. The callback must supply a complete, authorized prefix at that operation. A same-ID different message is a conflict, not an already-recorded success. The host supplies the nested chain separately.
- `passKeys(input)` returns the pass, all-domain, and optional final, ask, and model-call keys, or `{ invalidInput: true }`. Key components use a fixed JSON array; ask ordinals retain their exact positive integer value.
- `prepareRunnerConclusion(input)` validates the complete LC6 conclusion, occurrence, tenant and execution shell, reminder association, and keys. It returns an owned `LogEntryInput` without writing it.
- `inspectRunnerConclusion(input)` returns a copied conclusion and its association, `{ unrelated: true }` for a genuinely foreign entry, or `{ invalid: true }` when any runner marker is inconsistent.
- `readRunnerRetryConclusions(input)` reads one supplied full, dense, same-session prefix in log order. It keeps identical retry values at distinct log positions and returns `{ unavailable: true }` if the prefix or a runner entry cannot be trusted.
- `composeEffect(initial, conclusions)` validates each conclusion against the current subject and returns the five Runner5 effect shapes or `{ invalidInput: true }`. Supply the **original** `PositionedSubject`; the function applies the ordered rewrites and model selections itself.

Run the complete public-function example from this package directory after a build:

```sh
pnpm run build
node examples/public-pass.mjs
```

It prints `fresh: asked`, `pending: asked`, `replay: proceed`, `final: proceed`, `unavailable: unavailable`, and `calls: 2`. Its in-memory waiting and log ports are controlled examples; production sources must provide their own durable facts. The package tests exercise the actual SL3 JSONL provider, including close/reopen and unknown-write recovery.

The next example exercises only the pure functions. Its synthetic position stands in for a log provider's returned entry; production code must use the actual persisted entry.

```js
import {
  composeEffect,
  inspectRunnerConclusion,
  prepareRunnerConclusion,
} from '@omne-harness-lite/loop-extension-runner'

const session = 'session-example'
const tenant = { organization: 'org-example', account: 'account-example' }
const at = '2026-09-28T10:00:00Z'
const originalPositionedSubject = {
  position: 'before_persist_message',
  subject: {
    message: { id: 'message-example', type: 'user', blocks: [], createdAt: at },
    producer: 'user',
  },
}
const conclusion = {
  extension: 'example-extension',
  position: 'before_persist_message',
  power: 'observe',
  at,
  output: { kind: 'observed' },
}
const prepared = prepareRunnerConclusion({
  session,
  tenant,
  execution: { kind: 'noRun' }, // legal only for before_persist_message
  anchor: 'message-example',
  occurrence: { kind: 'final' },
  value: conclusion,
  reminders: [],
})
if ('invalidInput' in prepared) throw new Error('invalid conclusion')

const persistedEntry = { ...prepared.entry, session, position: 1 }
const found = inspectRunnerConclusion({ session, tenant, entry: persistedEntry })
if ('invalid' in found || 'unrelated' in found) throw new Error('unexpected log entry')
const result = composeEffect(originalPositionedSubject, [found.conclusion])
if ('invalidInput' in result) throw new Error('inconsistent conclusion')
console.log(result.effect.kind) // proceed
```

For every position other than `before_persist_message`, the caller must provide an actual `{ kind: 'withRun', run, attempt }` shell when preparing a durable conclusion. `before_persist_message` may inherit a real outer fence while its extension input omits Run fields. `composeEffect` uses the core pure subject and conclusion judgments; it needs no Run or handle and proves no execution occurred. Reminder message IDs use the same `mrr/3` message key as model runtime; the stored conclusion includes the full reminder copy for later exact comparison. For `producer: system`, only the runner's private reminder nesting inherits that fence; a public `runPass` with a system message and `withRun` remains invalid. Cancellation observed after waiting-source, presence, or handle acquisition prevents the next invocation and releases any acquired replay binding or handles.

The pure functions are synchronous and use no network, clock, random source, or hidden storage. `runPass` is asynchronous and uses only its explicit ports. A successful function result does not certify that the host implemented authentic waiting/card ownership, same-prefix failure verification, physical writer-stop recovery, or actual Run provenance; those remain host integration obligations.
