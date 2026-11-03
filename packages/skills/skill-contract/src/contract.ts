import {
  capabilityId,
  isReadBody,
  readBodyText,
  readSnapshot,
  refusal,
  type BodyContract,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'
import { toPackageDigest } from './digest.ts'
import {
  fieldsOf,
  firstFinding,
  onlyKeys,
  readScripts,
  readSettings,
  type Findings,
} from './parse/shape.ts'
import type { SettingDeclaration } from './values.ts'

const schemaRead = readBodyText(
  JSON.stringify({
    kind: 'skill-body',
    properties: {
      name: 'string',
      description: 'string',
      tools: { category: 'tool', name: 'string' },
      scripts: { entry: 'string', runKind: 'string', facilities: 'string[]', parameters: 'json' },
      settings: { name: 'string', category: 'preference|binding|placement-identity|governance' },
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
    judge,
    deriveDeclarations(body, context) {
      const decision = judge(body, context)
      if (!decision.ok) throw new TypeError(`skill body failed judgment: ${decision.rejected}`)
      return {
        entries: extensionOf(body).settings.map(
          setting => `setting:${setting.category}:${setting.name}`,
        ),
      }
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
  }
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const name = stringField(body, 'name')
  if (name === undefined || name === '') return refusal('incomplete-reference')
  if (context?.capabilityName !== undefined && name !== context.capabilityName)
    return refusal('name-mismatch')
  if (toolRefs(body) === undefined) return refusal('incomplete-reference')
  const first = firstFinding(extensionOf(body).findings)
  return first === undefined ? { ok: true } : refusal(first.code)
}

const DESCRIPTION_MAX = 1024

/**
 * Reads the additive fields: `description`, `scripts`, `settings` and `package.digest`. Each one
 * may be absent. They follow the same shape rules as `.omne/skill.json`.
 */
function extensionOf(body: unknown): {
  findings: Findings
  settings: readonly SettingDeclaration[]
} {
  const findings: Findings = []
  const description = field(body, 'description')
  if (description !== undefined) {
    const text = description.kind === 'string' ? description.value : undefined
    const length = text === undefined ? 0 : [...text].length
    if (length < 1 || length > DESCRIPTION_MAX)
      findings.push({
        code: 'malformed',
        detail: 'description is not text of 1 to 1024 characters',
      })
  }
  readScripts(field(body, 'scripts'), findings)
  const settings = readSettings(field(body, 'settings'), findings)
  const pack = field(body, 'package')
  if (pack !== undefined) {
    const fields = fieldsOf(pack)
    if (fields !== undefined) onlyKeys(fields, ['digest'], 'package', findings)
    const digest = fields?.get('digest')
    if (digest?.kind !== 'string' || !('ok' in toPackageDigest(digest.value)))
      findings.push({ code: 'malformed', detail: 'package.digest is not a package digest' })
  }
  return { findings, settings }
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
