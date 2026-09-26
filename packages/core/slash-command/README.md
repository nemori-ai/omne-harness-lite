# @omne-harness-lite/slash-command

[中文](README_ZH.md)

Recognize delivery-surface slash commands, parse arguments against an explicit session command set, and expand prompt or selected skill content. Results describe what a consumer should do; the package performs no delivery or service dispatch.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Imports below use the public package entry. Each example is self-contained.

| Public API                                                       | Use                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| `recognize`                                                      | Distinguish text, literal slash text and invocation attempts |
| `parseInvocation`                                                | Parse against the supplied session command set               |
| `expandPrompt`, `expandSkill`                                    | Project prompt text or selected skill blocks                 |
| `judgeSlashCommand`, `judgeInvocation`, `judgeSlashCommandValue` | Validate definitions and exchange values                     |
| `slashCommandBodyContract`, declaration/reference helpers        | Integrate definitions with asset evaluation                  |

## Recognize and parse a prompt command

Only a slash in the first code point starts an invocation. `//` sends literal slash text; an unknown invocation stays a failure.

```ts
import {
  recognize,
  parseInvocation,
  type SlashCommandDefinition,
} from '@omne-harness-lite/slash-command'

const definition: SlashCommandDefinition = {
  description: 'Summarize text',
  binding: { kind: 'prompt', template: 'Summarize: $ARGUMENTS' },
}
console.log(recognize('//summarize text')) // { kind: 'literal', text: '/summarize text' }
console.log(recognize(' /summarize text').kind) // text
const recognized = recognize('/summarize a short note')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
console.log(parseInvocation(recognized.invocation, { summarize: definition }))
// { kind: 'expanded', text: 'Summarize: a short note' }
console.log(parseInvocation(recognized.invocation, {}))
// { kind: 'failed', reason: 'unknown_command', at: { start: 0, end: 10 },
//   explanation: 'This session has no command with this name.' }
```

## Parse typed service arguments

Service commands use the official reserved namespace. Parsing produces data; it does not resolve or invoke the service.

```ts
import {
  judgeSlashCommand,
  recognize,
  parseInvocation,
  type SlashCommandDefinition,
} from '@omne-harness-lite/slash-command'

const name = 'omne-official:reload'
const definition: SlashCommandDefinition = {
  description: 'Reload an asset',
  binding: { kind: 'command', service: 'registry.reload' },
  parameters: [{ name: 'version', kind: 'integer', required: true, positional: true }],
}
console.log(judgeSlashCommand(definition, { capabilityName: name, origin: 'official' })) // { ok: true }
const recognized = recognize('/omne-official:reload 7')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
console.log(parseInvocation(recognized.invocation, { [name]: definition }))
// { kind: 'command', service: 'registry.reload', arguments: { version: 7 } }
console.log(judgeSlashCommand(definition, { capabilityName: name, origin: 'customized' }))
// { rejected: 'name_reserved' }
```

## Expand an explicitly selected skill

The caller has already selected the effective, authorized skill. The body remains literal; arguments become a separate annotated block.

```ts
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { recognize, parseInvocation, expandSkill } from '@omne-harness-lite/slash-command'

const recognized = recognize('/review focus on errors')
if (recognized.kind !== 'invocation') throw new Error('Invocation required')
const parsed = parseInvocation(recognized.invocation, {
  review: {
    description: 'Review code',
    binding: {
      kind: 'skill',
      skill: { category: 'skill', name: 'review' },
    },
  },
})
if (parsed.kind !== 'skill') throw new Error('Skill binding required')
const skill = {
  manifest: { name: 'review', description: 'Review code' },
  body: 'Review the code. Keep $0 literal.',
  resources: [],
}
const blocks = expandSkill(recognized.invocation, parsed.skill.name, skill, [
  {
    id: unwrap(parseOpaqueIdentifier('skill_body', 'BlockId')),
    visibility: { toHuman: true, toModel: true },
  },
  {
    id: unwrap(parseOpaqueIdentifier('skill_arguments', 'BlockId')),
    visibility: { toHuman: true, toModel: true },
  },
])
console.log(blocks.map(block => block.text))
// ['Review the code. Keep $0 literal.', 'focus on errors']
console.log(blocks.map(block => block.origin?.kind)) // ['skill_body', 'slash_command_args']
```

## Failures and boundaries

Representation judgments return `{ ok: true }` or `{ rejected }`. Parsing returns `expanded`, `skill`, `command` or `failed`; a failure contains a reason, explanation and, where applicable, a Unicode code-point span. Missing and unauthorized commands look identical because parsing sees only the supplied set. A failure must not be silently converted to text delivery.

`recognize` is for human input arriving through a delivery surface. Callers must keep model output and connector, scheduled or peer-session text out of this grammar. Matching is case-sensitive. Quoted arguments, typed positional/named parameters and enum values are parsed only when the definition supplies `parameters`; without declarations, the argument text remains free text.

`expandSkill` takes the already selected SkillPackage and one caller-supplied block annotation per output block. It does not fetch, choose or authorize skills. Auxiliary inputs that violate helper preconditions throw `TypeError`, distinct from parse failure. The package does not log, send content, execute commands or resolve service names; those effects belong to the caller.

The JSON Schema is available through `@omne-harness-lite/slash-command/schema`. See [source exports](src/index.ts), [tests](tests/) and [skill package](../skill-package/README.md).
