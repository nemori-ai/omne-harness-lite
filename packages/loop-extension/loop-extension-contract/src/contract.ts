import {
  POSITIONS,
  POWERS,
  type LoopExtensionDeclaration,
  type Position,
  type Power,
} from '@omne-harness/agent-contract'
import {
  digestBytes,
  isReadBody,
  readBodyText,
  refusal,
  type AssetSummary,
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
  creation:
    '一个目录，根下有 extension.json；命令型另带它运行的脚本。发布之后要打开「运行」才生效。',
  authoring: [
    'A loop extension is a directory with extension.json at its root, and for a command the script it runs. Whole and minimal:',
    'extension.json:',
    '{ "name": "watch", "position": "before_action", "power": "veto",',
    '  "implementation": { "kind": "command", "interpreter": "node", "entry": "watch.mjs", "timeout": "PT30S" } }',
    'watch.mjs:',
    "let text = ''",
    'for await (const chunk of process.stdin) text += chunk',
    'const request = JSON.parse(text)',
    "process.stdout.write(JSON.stringify({ kind: 'observed' }))",
    'name is the name it is published under. position is where in the loop it runs: execution_started, before_compaction, after_compaction, before_model_call, after_model_call, before_action, after_action, before_terminal, after_terminal.',
    'power is the most it may do there: observe, rewrite or veto. onError (optional) says what an error of the script means: ignore, record, or treat_as_veto for a veto.',
    'The script reads one JSON request from standard input: mode (fresh or replay) and input (position, subject, earlier). It writes one JSON output to standard output and exits 0: { "kind": "observed" }, or { "kind": "veto", "reason": "..." } where the power is veto. Anything else, a nonzero exit or a timeout is recorded as an error. It gets no way to call back into the system.',
    'Holding one does not run it: after it is published, turn its setting run on. It then runs from the next time the loop passes its position, in every session of the tenant; turning run off stops it the same way.',
  ].join('\n'),
})

const POSITION_TEXT: Readonly<Record<Position, string>> = {
  execution_started: '执行开始之后',
  before_compaction: '压缩之前',
  after_compaction: '压缩之后',
  before_model_call: '调模型之前',
  after_model_call: '调模型之后',
  before_action: '执行动作之前',
  after_action: '执行动作之后',
  before_terminal: '落终态之前',
  after_terminal: '落终态之后',
}
const POWER_TEXT: Readonly<Record<Power, string>> = {
  observe: '只观察',
  rewrite: '可以改写',
  veto: '可以否决',
}
const ERROR_TEXT: Readonly<Record<NonNullable<LoopExtensionDeclaration['onError']>, string>> = {
  ignore: '忽略，这一步照常',
  record: '记下，这一步照常',
  treat_as_veto: '当作否决',
}

function summaryOf(declaration: LoopExtensionDeclaration): AssetSummary {
  const { position, power, implementation, onError } = declaration
  const how =
    implementation.kind === 'builtin'
      ? `内建：${implementation.builtinName}`
      : `命令：${implementation.interpreter} ${implementation.entry}，时限 ${implementation.timeout}`
  return {
    title: declaration.name,
    description: `在「${POSITION_TEXT[position]}」运行，${POWER_TEXT[power]}这一步。`,
    facts: [
      { name: '位置', text: POSITION_TEXT[position] },
      { name: '干预力', text: POWER_TEXT[power] },
      { name: '实现', text: how },
      ...(onError === undefined ? [] : [{ name: '出错时', text: ERROR_TEXT[onError] }]),
    ],
  }
}

const PROVIDER = 'loop-extension'
const GROUP = 'loop-extension'
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

// Holding an extension does not run it: the tenant turns `run` on. The version of the definition comes
// from its content alone, so a new version of the extension keeps the value the tenant set.
function runSetting(name: string): SettingDefinitions {
  const content = runSettingContent(name)
  const version = digestBytes(new TextEncoder().encode(JSON.stringify(content)))
  return { ...content, version }
}

function runSettingContent(name: string): Omit<SettingDefinitions, 'version'> {
  return {
    providerId: PROVIDER,
    definitionId: settingsId(name),
    groups: [
      {
        id: GROUP,
        parentId: null,
        title: '运行',
        description: `拓展件 ${name} 运行不运行。`,
        order: 0,
      },
    ],
    items: [
      {
        id: RUN_SETTING,
        groupId: GROUP,
        category: 'preference',
        presentation: {
          title: '运行',
          description: `在它声明的位置上运行拓展件 ${name}。持有它不等于运行它。`,
          impact: '打开之后，它在这个租户的每个会话里观察、改写或否决 agent 的这一步。',
          clear: '回到缺省：不运行。',
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
    settings: (body, context) => runSetting(judged(body, context).name),
    summarize: (body, context) => summaryOf(judged(body, context)),
    references(body, context) {
      judged(body, context)
      return []
    },
  }
}
