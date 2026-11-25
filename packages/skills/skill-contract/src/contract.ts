import {
  capabilityId,
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type CategoryDisplay,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'

export const skillCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '技能',
  summary: '一份说明加配套文件，代理需要时读取。',
  creation: '一个目录，根下有 SKILL.md，配套文件放在它旁边。',
  authoring: [
    'A Skill is a folder: SKILL.md at its root, a frontmatter of name and description, then the body; references/ and scripts/ sit beside it.',
    'name: lower-case letters and digits in words joined by single hyphens, 1 to 64 characters, the same as the name it is published under.',
    'description: what the Skill does and when to use it, in the words of a user; keep it under 1024 characters.',
    'Limits: at most 200 files, 1 MiB in one file, 8 MiB in all.',
    'The tools it uses go in .omne/skill.json: {"formatVersion":1,"dependencies":[{"category":"tool","name":"Shell"}]}.',
    'Scripts go in scripts/ and run with Shell from the directory that Skills read gives.',
    'Ask impact with dir before publish. A refusal says code: detail; a name the deployment holds and does not let be replaced is refused.',
    'The whole guide is the skill skill-authoring (Skills read).',
  ].join('\n'),
})
import { isPackageDigest } from './digest.ts'
import { skillLayout } from './layout.ts'
import { isSkillName } from './names.ts'
import {
  DESCRIPTION_LIMIT,
  fieldsOf,
  firstFinding,
  isSkillDescription,
  unknownKeys,
  type Finding,
} from './parse/shape.ts'

const schemaRead = readBodyText(
  JSON.stringify({
    kind: 'skill-body',
    properties: {
      name: 'string',
      description: 'string',
      tools: { category: 'tool', name: 'string' },
      package: { digest: 'string' },
    },
  }),
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 64,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('skill schema text is not a document')
const schema: JsonValue = schemaRead.value

export function skillBodyContract(): BodyContract {
  return {
    category: 'skill',
    schema,
    layout: skillLayout,
    judge,
    deriveDeclarations(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`skill body failed judgment: ${decision.rejected}`)
      return { entries: [] }
    },
    references(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`skill body failed judgment: ${decision.rejected}`)
      const refs = toolRefs(body)
      if (refs === undefined)
        throw new TypeError('skill body failed judgment: incomplete-reference')
      return refs.map(ref => {
        const id = capabilityId(ref.category, ref.name)
        if (!id.ok) throw new TypeError('skill body failed judgment: incomplete-reference')
        return id.id
      })
    },
    summarize(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`skill body failed judgment: ${decision.rejected}`)
      const tools = toolRefs(body) ?? []
      return {
        title: stringField(body, 'name') ?? '',
        description: stringField(body, 'description') ?? '',
        facts: [
          { name: '文件', text: `${fileCount(body)} 个` },
          {
            name: '依赖',
            text: tools.length === 0 ? '无' : tools.map(tool => tool.name).join('、'),
          },
        ],
      }
    },
  }
}

function fileCount(body: JsonValue): number {
  const entries = field(field(body, 'manifest'), 'entries')
  return entries?.kind === 'array' ? entries.items.length : 0
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName)
    return refusal('name-mismatch')
  if (!isSkillName(name)) return refusal('name-invalid')
  if (toolRefs(body) === undefined) return refusal('incomplete-reference')
  const first = firstFinding(extensionOf(body))
  return first === undefined ? { ok: true } : refusal(first.code)
}

function extensionOf(body: unknown): readonly Finding[] {
  const findings: Finding[] = []
  const description = field(body, 'description')
  if (
    description !== undefined &&
    (description.kind !== 'string' || !isSkillDescription(description.value))
  )
    findings.push({
      code: 'malformed',
      detail: `description is not text of 1 to ${DESCRIPTION_LIMIT} characters`,
    })
  const pack = field(body, 'package')
  if (pack !== undefined) {
    const fields = fieldsOf(pack)
    findings.push(...unknownKeys(fields, ['digest'], 'package'))
    const digest = fields?.get('digest')
    if (digest?.kind !== 'string' || !isPackageDigest(digest.value))
      findings.push({ code: 'malformed', detail: 'package.digest is not a package digest' })
  }
  return findings
}

function toolRefs(body: unknown): readonly { category: string; name: string }[] | undefined {
  const tools = field(body, 'tools')
  if (tools === undefined) return isObject(body) ? [] : undefined
  if (!isReadBody(tools) || tools.kind !== 'array' || !Array.isArray(tools.items)) return undefined
  const refs: { category: string; name: string }[] = []
  for (let index = 0; index < tools.items.length; index += 1) {
    const item = tools.items[index]
    if (!isObject(item)) return undefined
    const category = stringField(item, 'category')
    const name = stringField(item, 'name')
    if (category !== 'tool' || name === undefined || name === '') return undefined
    refs.push({ category, name })
  }
  return refs
}

function stringField(body: unknown, key: string): string | undefined {
  const value = field(body, key)
  if (value === undefined || value.kind !== 'string' || typeof value.value !== 'string')
    return undefined
  return value.value
}

function field(body: unknown, key: string): JsonValue | undefined {
  const document = readSnapshot(body)
  if (document === undefined || document.kind !== 'object' || !Array.isArray(document.entries))
    return undefined
  for (let index = 0; index < document.entries.length; index += 1) {
    const entry = document.entries[index]
    if (entry === undefined || entry.key !== key) continue
    return entry.value
  }
  return undefined
}

function isObject(body: unknown): boolean {
  const document = readSnapshot(body)
  return document !== undefined && document.kind === 'object' && Array.isArray(document.entries)
}
