import { POSITIONS, POWERS, type LoopExtensionDeclaration } from '@omne-harness/agent-contract'
import {
  isReadBody,
  readBodyText,
  refusal,
  type BodyContract,
  type CategoryDisplay,
  type JsonValue,
  type Judgment,
} from '@omne-harness/assets'
import type { SettingDefinitions } from '@omne-harness/settings'
import { loopExtensionLayout } from './package.ts'

export const LOOP_EXTENSION_CATEGORY = 'loop-extension'
export const RUN_SETTING = 'run'

export const loopExtensionCategoryDisplay: CategoryDisplay = Object.freeze({
  title: '拓展件',
  summary: '挂在 agent 循环某一处位置上的一段判断：观察、改写或否决这一步。',
  creation: '一个目录，根下有 extension.json；命令型另带它运行的脚本。',
})

const PROVIDER = 'loop-extension'
const GROUP = 'loop-extension'
const UNPINNED = 'unpinned'
const ID_LITERAL = /^[a-zA-Z0-9.:/-]$/u

const schemaRead = readBodyText(
  JSON.stringify({
    kind: 'loop-extension-body',
    properties: { declaration: { name: 'string', position: 'string', power: 'string' } },
  }),
  {
    maxBytes: 1000,
    maxDepth: 8,
    maxItems: 16,
    maxMembers: 16,
    maxStringLength: 200,
    maxNumberLength: 20,
  },
)
if (schemaRead.kind !== 'ok') throw new TypeError('loop extension schema text is not a document')
const schema: JsonValue = schemaRead.value

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null

// A version body is a tagged JSON tree. It is read by shape: a body that came back from storage is no longer the snapshot the inspection made.
function plain(value: unknown): unknown {
  const node = record(value)
  const { items, entries } = node ?? {}
  switch (node?.['kind']) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return node['value']
    case 'number':
      return Number(node['lexeme'])
    case 'array':
      return Array.isArray(items) ? items.map(plain) : undefined
    case 'object':
      return Array.isArray(entries)
        ? Object.fromEntries(
            entries.map(entry => [record(entry)?.['key'], plain(record(entry)?.['value'])]),
          )
        : undefined
    default:
      return undefined
  }
}

const oneOf = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value)

/** The declaration a version body holds, or null when the tree is not such a body. */
export function declarationOf(body: unknown): LoopExtensionDeclaration | null {
  const declaration = record(record(plain(body))?.['declaration'])
  const kind = record(declaration?.['implementation'])?.['kind']
  if (declaration === null || typeof declaration['name'] !== 'string') return null
  if (!oneOf(POSITIONS, declaration['position']) || !oneOf(POWERS, declaration['power']))
    return null
  return oneOf(['builtin', 'command'], kind) ? (declaration as LoopExtensionDeclaration) : null
}

function judge(body: unknown, context?: { capabilityName?: string }): Judgment {
  if (!isReadBody(body)) return refusal('incomplete-reference')
  const declaration = declarationOf(body)
  if (declaration === null) return refusal('not-a-declaration')
  if (context?.capabilityName !== undefined && declaration.name !== context.capabilityName)
    return refusal('name-mismatch')
  return { ok: true }
}

function judged(body: unknown, context?: { capabilityName?: string }): LoopExtensionDeclaration {
  const decision = judge(body, context)
  const declaration = declarationOf(body)
  if (!decision.ok || declaration === null)
    throw new TypeError(
      `loop extension body failed judgment: ${decision.ok ? '' : decision.rejected}`,
    )
  return declaration
}

function settingsId(text: string): string {
  let out = ''
  for (const character of text)
    out += ID_LITERAL.test(character) ? character : `_${character.codePointAt(0)!.toString(16)}_`
  return out
}

// Holding an extension does not run it: the tenant turns `run` on, and an organization may lock it either way.
function runSetting(name: string, version: string | undefined): SettingDefinitions {
  return {
    providerId: PROVIDER,
    definitionId: settingsId(name),
    version: settingsId(version ?? UNPINNED),
    groups: [
      {
        id: GROUP,
        parentId: null,
        title: 'Loop extension',
        description: `Whether the loop extension ${name} runs.`,
        order: 0,
      },
    ],
    items: [
      {
        id: RUN_SETTING,
        groupId: GROUP,
        category: 'preference',
        presentation: {
          title: 'Run',
          description: `Run the loop extension ${name} at the position it declares.`,
          impact: 'When on, the extension observes, rewrites or vetoes steps of the agent.',
          clear: 'Clearing the value turns the extension off.',
          adoption: 'next-read',
        },
        valueSchema: { type: 'boolean' },
        default: { kind: 'value', value: false },
        merge: 'override',
        sensitivity: 'ordinary',
      },
    ],
  }
}

export function loopExtensionBodyContract(): BodyContract {
  return {
    category: LOOP_EXTENSION_CATEGORY,
    schema,
    layout: loopExtensionLayout,
    judge,
    deriveDeclarations(body, context) {
      const { position, power, implementation } = judged(body, context)
      return {
        entries: [
          `position:${position}`,
          `power:${power}`,
          `implementation:${implementation.kind}`,
        ],
      }
    },
    settings: (body, context) => runSetting(judged(body, context).name, context?.definition),
    references(body, context) {
      judged(body, context)
      return []
    },
  }
}
