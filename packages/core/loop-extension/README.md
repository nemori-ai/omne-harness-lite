# @omne-harness-lite/loop-extension

[中文](README_ZH.md)

Data and judgments for extensions at eleven agent-loop positions. Define an extension's declared power and implementation, admit invocation input, and check a recorded conclusion against that exact input.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                                                         | Use                                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `judgeDefinition`, `judgeInput`, `judgeOutput`                     | Admit protocol values and obtain typed copies                     |
| `judgeConclusion(value, inputs)`                                   | Check conclusion shape, allowed combinations and immutable fields |
| `judgePositionedSubject`, `judgeConclusionForSubject`              | Check a pure subject and conclusion without execution handles     |
| `POSITIONS`, `POWERS`, `POWER_CONCLUSIONS`, `POSITION_CONCLUSIONS` | Inspect legal positions and output combinations                   |
| `loopExtensionBodyContract`                                        | Supply definition rules to the asset model                        |
| `validate`, `judgeValue`                                           | Use the schema and generic judgment surfaces                      |

The root entry adopts `data.loop-extension/v6`. A failed model-call input includes its complete, ordered `retryConclusions` and every recorded conclusion at that position carries the matching `modelCallId`. Existing `/schema/v3` and `/schema/v2` paths publish exact resources required by current schema references; they are not executable older APIs.

## Admit a definition

A declaration describes a builtin implementation; admission does not load or invoke that implementation.

```ts
import {
  judgeDefinition,
  POWER_CONCLUSIONS,
  POSITION_CONCLUSIONS,
  type LoopExtensionDefinition,
} from '@omne-harness-lite/loop-extension'

const definition: LoopExtensionDefinition = {
  name: 'review-before-action',
  position: 'before_action',
  power: 'veto',
  onError: 'record',
  unavailability: 'veto',
  needs: ['audit-log'],
  implementation: { kind: 'builtin', builtinName: 'action-review' },
}
console.log('ok' in judgeDefinition(definition)) // true
console.log(POWER_CONCLUSIONS.observe) // ['observed']
console.log(POSITION_CONCLUSIONS.after_terminal) // ['observed']
```

## Compare a rewrite with its actual input

Changing parsed arguments is representable here; changing call identity is rejected. The input judge establishes the opaque handle and content-block types.

```ts
import { judgeInput, judgeConclusion } from '@omne-harness-lite/loop-extension'

const input = judgeInput({
  position: 'before_action',
  run: 'run_1',
  attempt: 1,
  subject: {
    call: {
      id: 'block_call',
      kind: 'tool_call',
      complete: true,
      callId: 'call_1',
      tool: 'repo__read',
      arguments: { path: 'README.md' },
      visibility: { toHuman: true, toModel: true },
    },
    definition: { name: 'repo__read' },
    batch: ['call_1'],
  },
  earlier: [],
  log: 'log_1',
  environment: 'environment_1',
})
if ('rejected' in input || input.ok.position !== 'before_action')
  throw new Error('Action input required')
const subject = input.ok.subject
const context = { input: input.ok, extensionName: 'review-before-action' }
const conclusion = {
  extension: context.extensionName,
  position: 'before_action',
  power: 'rewrite',
  callId: 'call_1',
  at: '2026-09-26T10:00:00Z',
  output: {
    kind: 'rewrite',
    subject: {
      ...subject,
      call: { ...subject.call, arguments: { path: 'CONTRIBUTING.md' } },
    },
  },
}
console.log('ok' in judgeConclusion(conclusion, context)) // true
console.log(
  judgeConclusion(
    {
      ...conclusion,
      output: {
        kind: 'rewrite',
        subject: {
          ...subject,
          call: { ...subject.call, tool: 'other' },
        },
      },
    },
    context,
  ),
) // { rejected: 'rewrite_touches_immutable' }
```

## Failures and boundaries

A pure composition can check a subject and a conclusion without claiming a Run or log exists:

```ts
import { judgePositionedSubject, judgeConclusionForSubject } from '@omne-harness-lite/loop-extension'

const subject = judgePositionedSubject({ position: 'attempt_started', subject: { attempt: 1 } })
if ('rejected' in subject) throw new Error(subject.rejected)
const conclusion = judgeConclusionForSubject(
  {
    extension: 'audit',
    position: 'attempt_started',
    power: 'observe',
    output: { kind: 'observed' },
    at: '2026-09-28T10:00:00Z',
  },
  { positionedSubject: subject.ok, extensionName: 'audit' },
)
if ('rejected' in conclusion) throw new Error(conclusion.rejected)
console.log(conclusion.ok.output) // { kind: 'observed' }
```

The pure subject accepts only `position`, its required `dimension`, and `subject`. A valid pure result checks representation and pairing; it does not prove an actual invocation, dispatch, or complete history. Consumers performing real execution still use `judgeInput` and `judgeConclusion` with actual handles and Run facts.

Judgments return a typed `{ ok }` copy or `{ rejected }`. `judgeConclusion` needs an admitted `ExtensionInput` and the actual extension name, paired to the same position, dimension and action identity. Missing or invalid auxiliary configuration throws `TypeError`; protocol rejection remains a separate result. Schema-only guards and `validate` cannot compare a rewrite against the actual invocation.

A valid conclusion is not dispatch authorization. The caller supplies the effective power, checks model/provider eligibility, performs admission, records conclusions, and applies them in loop order. `select_model`, `retry`, `ask` and `veto` are values here; no model selection, retry, waiting, veto effect or command execution happens in this package. Log and environment handles are opaque.

Rewrites preserve the immutable members for their position. An unparseable tool call cannot be repaired into parsed arguments by an extension. Injected reminders must name the actual extension as their source. Dependencies, policy execution, persistence and recovery belong to consumers.

Public JSON Schema entries are `@omne-harness-lite/loop-extension/schema` (v6), `/schema/v3` and `/schema/v2`. See [source exports](src/index.ts), [tests](tests/) and [tool definition](../tool-definition/README.md).

## Admit a recorded retry

The retry history contains full recorded conclusions, including their call identity, author, time and plan. `judgeInput` validates the complete failure subject and checks that every dispatch and retry belongs to its one model call; the runtime must still obtain the complete log prefix.

```ts
import { judgeValue } from '@omne-harness-lite/loop-extension'

const result = judgeValue('ModelRetryConclusion', {
  extension: 'default-retry',
  position: 'after_model_call',
  dimension: { ending: 'failure' },
  modelCallId: 'mc_01',
  power: 'rewrite',
  output: { kind: 'retry', plan: { provider: 'provider-b', after: 'PT2S' } },
  at: '2026-09-28T10:00:00Z',
})
console.log('ok' in result) // true
```
