# @omne-harness-lite/skill-package

[中文](README_ZH.md)

Pure Skill package values, YAML/Markdown text reading, and package construction from caller-supplied directory entries. Preserve the full body, project settings and dependencies, and list resources without executing their content.

This package is an unpublished, private ESM workspace member. Use it from this repository with its declared Node and pnpm versions; see the [development guide](../../../docs/development.md). Each example below is self-contained and imports public entries.

| Public entry or API                                                                  | Use                                                        |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Root entry                                                                           | v3 normalized values, judgments, body contract and readers |
| `readSkillMd`, `readSkillPackage`                                                    | Read full text or supplied package entries                 |
| `judgeSkillPackage`, `validate`                                                      | Judge package semantics or check schema shape              |
| `skillAttributeDeclarations`, `skillReferences`, `skillDependencies`, `skillScripts` | Project package facts                                      |
| `skillBodyContract`                                                                  | Supply the default v3 body rules                           |
| `@omne-harness-lite/skill-package/v2`                                                | Retained v2 normalized-value APIs and body rules           |

The `/v2` entry has no text/entry reader or `SkillReadUndetermined` API. JSON Schema entries are `@omne-harness-lite/skill-package/schema` (v3) and `/schema/v2` (complete retained v2).

## Read text and supplied directory entries

Ordinary unknown keys are ignored with visible diagnostics. Directory reading consumes supplied observations and does no filesystem I/O.

```ts
import {
  readSkillMd,
  readSkillPackage,
  type SkillPackageEntry,
} from '@omne-harness-lite/skill-package'

const body = '\nKeep $ARGUMENTS literal.\r\n'
const text =
  [
    '---',
    'name: review',
    'description: Review code',
    'user-invocable: false',
    'vendor-note: arbitrary',
    '---',
  ].join('\n') +
  '\n' +
  body
const markdown = readSkillMd(text)
if (!('ok' in markdown)) throw new Error(JSON.stringify(markdown))
console.log(markdown.ok.body === body) // true
console.log(markdown.ok.unknownKeys.map(entry => [entry.key, entry.category]))
// [['user-invocable', 'external_attribute'], ['vendor-note', 'unknown']]
const entries: readonly SkillPackageEntry[] = [
  { kind: 'file', path: 'SKILL.md', text },
  { kind: 'directory', path: '.omne' },
  {
    kind: 'file',
    path: '.omne/skill.json',
    text: '{"format":1,"tools":[{"category":"tool","name":"repo:read"}]}',
  },
  { kind: 'directory', path: 'references' },
  { kind: 'file', path: 'references/checklist.md', mediaType: 'text/markdown' },
]
const read = readSkillPackage(entries, { capabilityName: 'review' })
if (!('ok' in read)) throw new Error(JSON.stringify(read))
console.log(read.ok.package.resources.map(resource => resource.path)) // ['references/checklist.md']
console.log(
  readSkillMd(
    [
      '---',
      'name: review',
      'description: Review code',
      '!opaque a: first',
      '!opaque b: second',
      '---',
      'body',
    ].join('\n'),
  ),
) // { rejected: 'malformed', malformed: 'M16' }
```

## Judge a package and project its declarations

Only definition-record settings contribute declarations. A scripts path identifies a resource; it does not grant permission to run it.

```ts
import {
  judgeSkillPackage,
  skillAttributeDeclarations,
  skillReferences,
  skillDependencies,
  skillScripts,
  skillBodyContract,
  type SkillPackage,
} from '@omne-harness-lite/skill-package'

const pkg: SkillPackage = {
  manifest: { name: 'review', description: 'Review code', 'allowed-tools': 'Bash Read' },
  body: 'Review every change. Keep $0 literal.',
  definition: {
    format: 1,
    tools: [{ category: 'tool', name: 'repo:read' }],
    dependencies: ['repository-index'],
    settings: [
      {
        item: 'variant',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: { type: 'string', enum: ['brief', 'full'] } },
        default: 'brief',
      },
    ],
    environmentRequirement: { bindingLayer: 'stateless_sandbox', facilities: ['python'] },
  },
  resources: [
    { path: 'references/checklist.md' },
    { path: 'scripts/review.py', mediaType: 'text/x-python' },
  ],
}
console.log(judgeSkillPackage(pkg, { capabilityName: 'review' })) // { ok: true }
console.log(skillAttributeDeclarations(pkg).map(entry => entry.item)) // ['variant']
console.log(skillReferences(pkg)) // [{ category: 'tool', name: 'repo:read' }]
console.log(skillDependencies(pkg).map(entry => entry.kind))
// ['tool', 'external_service', 'execution_environment']
console.log(skillScripts(pkg).map(entry => entry.path)) // ['scripts/review.py']
console.log(skillBodyContract.category) // skill
```

## Choose the retained v2 body contract explicitly

The v2 entry admits normalized values and supplies its own body contract. Validate a value with that entry before giving it to a v2 consumer. Author-defined schema references are version-sensitive.

```ts
import { schemaId, judgeSkillPackage, type SkillPackage } from '@omne-harness-lite/skill-package'
import {
  judgeSkillPackage as judgeV2,
  skillBodyContract as bodyV2,
} from '@omne-harness-lite/skill-package/v2'

const pkg: SkillPackage = {
  manifest: { name: 'review', description: 'Review code' },
  body: 'Review code.',
  resources: [],
}
const judgment = judgeV2(pkg)
if ('rejected' in judgment) throw new Error(judgment.rejected)
console.log(bodyV2.judge(pkg, { capabilityName: 'review' })) // { ok: true }
const withV3Reference: SkillPackage = {
  ...pkg,
  definition: {
    format: 1,
    settings: [
      {
        item: 'variant',
        kind: 'setting',
        category: 'preference',
        domain: { kind: 'open', schema: { $ref: `${schemaId}#/$defs/SkillName` } },
        default: 'review',
      },
    ],
  },
}
console.log(judgeSkillPackage(withV3Reference)) // { ok: true }
console.log(judgeV2(withV3Reference)) // { rejected: 'malformed', malformed: 'M12' }
```

## Failures and boundaries

Judgments and v3 readers return success or `{ rejected }`; they do not return an undetermined result. A rejection may include a malformed `M` diagnostic. Ordinary unknown frontmatter keys are ignored and reported in `unknownKeys`; external attribute keys do not grant permissions. `allowed-tools` remains manifest data without execution effect.

Before ignoring fields, the reader validates YAML 1.2 structure and key uniqueness throughout the mapping graph, including nested ignored values, complex keys and aliases. If key uniqueness depends on unavailable canonical equality for an unknown scalar tag, the whole text read returns `malformed` with `M16`. An unknown tag alone is not a reason to reject when keys can already be distinguished. Duplicate keys and invalid core-field types remain errors.

The first and closing delimiter lines must each be exactly `---`. The body is every character after the closing line terminator, including whitespace and LF/CRLF spelling. There is no interpolation, command substitution or truncation. Optional extensions live in `.omne/skill.json`; that file is excluded from resources. A normalized package records resource paths, not resource bytes.

`readSkillPackage` performs no filesystem observation or UTF-8 decoding. The caller supplies complete entries, link-resolution facts and decoded control-file text, and owns filesystem confinement and version consistency. Resource paths, scripts membership and executable flags do not establish availability, execution permission or authorization. This module performs no tool/model calls, script execution or persistence.

A value accepted by v3 is not automatically accepted by v2. Give it to the retained v2 judge before passing it to a v2 consumer: author-defined references to the v3 schema can produce `malformed` `M12` there. Asset Model, Asset Evaluation and Slash Command retain their explicit v2 body integration; using a new default entry does not upgrade those consumers.

See [source exports](src/index.ts), [tests](tests/), [asset model](../asset-model/README.md) and [slash command](../slash-command/README.md).

See [behavior](SPEC.md) and [verification duties](verification/README.md).
