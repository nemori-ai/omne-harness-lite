# `@omne-harness-lite/loop-extension-runner`

Pure building blocks for runner conclusions. The package constructs and inspects complete `runner/5` conclusion entries, derives pass keys, reads effective retry conclusions from one complete session-log prefix, and reconstructs an effect from the original subject and an ordered conclusion list.

This release has no Cordis plugin or runner service. It does not dispatch extensions, authenticate callers, obtain a complete log prefix, own a Run, append a conclusion, or decide whether a retry may be sent. The caller supplies those facts through the appropriate services. In particular, `readRunnerRetryConclusions` checks the supplied entries and dense positions but cannot prove that its caller had permission to read them or that the array came from a full read.

The accepted scope is [D-106](../../../.meta_harness/design/record/decisions/runner-current-pure-provider-adoption/decision.md), using [Runner5](../../../.meta_harness/design/spec/capabilities/loop-extension-runner/v5/contract.md), [LC6](../../../.meta_harness/design/spec/data/loop-extension/v6/contract.md), and the [current realization](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/v5-current-design.md). The [verification obligations](../../../.meta_harness/design/realization/packages/agent-loop/loop-extension-runner/verification.md) describe the service work that remains.

## Public API

- `passKeys(input)` returns the pass, all-domain, and optional final, ask, and model-call keys, or `{ invalidInput: true }`. Key components use a fixed JSON array; ask ordinals retain their exact positive integer value.
- `prepareRunnerConclusion(input)` validates the complete LC6 conclusion, occurrence, tenant and execution shell, reminder association, and keys. It returns an owned `LogEntryInput` without writing it.
- `inspectRunnerConclusion(input)` returns a copied conclusion and its association, `{ unrelated: true }` for a genuinely foreign entry, or `{ invalid: true }` when any runner marker is inconsistent.
- `readRunnerRetryConclusions(input)` reads one supplied full, dense, same-session prefix in log order. It keeps identical retry values at distinct log positions and returns `{ unavailable: true }` if the prefix or a runner entry cannot be trusted.
- `composeEffect(initial, conclusions)` validates each conclusion against the current subject and returns the five Runner5 effect shapes or `{ invalidInput: true }`. Supply the **original** `PositionedSubject`; the function applies the ordered rewrites and model selections itself.

This runnable example exercises only the pure functions. The synthetic position stands in for a log provider's returned entry; production code must use the actual persisted entry.

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

For every position other than `before_persist_message`, the caller must provide an actual `{ kind: 'withRun', run, attempt }` shell. `before_persist_message` may inherit a real outer fence while its extension input omits Run fields. `composeEffect` currently uses local validation placeholders to call the core LC6 judgment; that implementation detail is under integration review and does not supply a production Run. Reminder message IDs use the same `mrr/3` message key as model runtime; the stored conclusion includes the full reminder copy for later exact comparison.

All functions are synchronous and use no network, clock, random source, or hidden storage. Their returned values do not themselves certify a successful append or a complete authorized read.
