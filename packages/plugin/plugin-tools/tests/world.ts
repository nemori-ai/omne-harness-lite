import {
  declare,
  empty,
  install,
  type Contract,
  type Entry,
  type Registry,
  type Scope,
} from '@omne-harness/dynamis'
import { readJsonText } from '@omne-harness/json-text'
import {
  answerExtensionPoints,
  attachExtensionSight,
  createExtensionPointsAuthor,
  createRevisions,
  extensionPointsToolModule,
  type ClientTree,
  type ExtensionSight,
} from '@omne-harness/plugin-tools'
import { createIndependentToolScope } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { commandArguments, deriveDefinition } from '@omne-harness/tool-contract/provider'

export const json = (value: unknown) => {
  const read = readJsonText(JSON.stringify(value), {
    maxBytes: 262_144,
    maxDepth: 16,
    maxItems: 1024,
    maxMembers: 64,
    maxStringLength: 65_536,
    maxNumberLength: 32,
  })
  if (read.kind !== 'ok') throw new Error('json')
  return read.value
}

export const contract = (name: string, over: Partial<Contract> = {}): Contract => ({
  name,
  tree: 'server',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the name of an implementation',
  gives: 'nothing',
  item: { kind: 'data', fields: { label: 'string' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'the answer is unavailable',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: `the point ${name}`,
  ...over,
})

export const entry = (point: string, key: string, over: Partial<Entry> = {}): Entry => ({
  point,
  key,
  id: '',
  scope: [],
  rank: 0,
  digest: `${point}/${key}/${JSON.stringify(over.scope ?? [])}`,
  item: { label: key },
  ...over,
})

/** Installs what each fiber puts, generation 1, in the order given. */
export function registryOf(...byFiber: readonly (readonly [string, readonly Entry[]])[]): Registry {
  return byFiber.reduce((registry, [fiber, entries]) => {
    const outcome = install(registry, { fiber, generation: 1 }, entries)
    if (outcome.kind !== 'installed') throw new Error(`${outcome.reason} ${outcome.detail}`)
    return outcome.registry
  }, empty)
}

export const SKILLS = 'skill.skills'
export const TOOLS = 'tool.tools'

/** A small server tree: two points of two hosts, entries at the deployment and at two tenants. */
export const serverParts = (): (readonly [string, readonly Entry[]])[] => [
  [
    'skill',
    [
      declare(
        contract(SKILLS, {
          summary: 'The skills each layer holds.',
          key: 'the skill name',
          arity: 'keyed-one',
          resolve: 'most-specific',
          version: 1,
          revision: 2,
          gives: 'the directory of the skill',
          onError: 'the skill is not offered',
        }),
      ),
    ],
  ],
  ['tool', [declare(contract(TOOLS, { summary: 'The tools an agent can call.', arity: 'list' }))]],
  ['pdf', [entry(SKILLS, 'pdf-tools', { scope: ['t1'] })]],
  ['notes', [entry(SKILLS, 'meeting-notes', { scope: ['t2'] })]],
  ['shell', [entry(TOOLS, '', { id: 'Shell' })]],
]

export const desktop = (over: Partial<ClientTree> = {}): ClientTree => ({
  client: 'desktop',
  points: [
    { name: 'session.tool-call', summary: 'How one tool call is drawn in the conversation.' },
  ],
  parts: [
    {
      name: 'session.area',
      label: '对话',
      summary: '对话页。',
      depths: ['tokens'],
      within: null,
    },
    {
      name: 'session.composer',
      label: '输入区',
      summary: '对话页底部写消息的区域。',
      depths: ['tokens', 'style'],
      within: 'session.area',
    },
    {
      name: 'session.composer.send',
      label: '发送按钮',
      summary: '输入区右侧，发出当前输入。',
      depths: ['tokens', 'style', 'render'],
      within: 'session.composer',
    },
  ],
  plugins: [{ name: 'pill-send', version: 'sha256:5b1e', state: 'loaded', reason: null }],
  ...over,
})

function scope() {
  const created = createIndependentToolScope({
    signal: new AbortController().signal,
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    process: null,
    waits: null,
  })
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  return created.ok
}

export function author(maximum = 65_536) {
  const created = createExtensionPointsAuthor(json({ resultMaxBytes: maximum }))
  if ('failure' in created) throw new Error(JSON.stringify(created.failure))
  const read = readToolRegistration(created.ok)
  if (read?.kind !== 'commands') throw new Error('commands')
  const registration = read
  const definition = deriveDefinition(
    {
      asset: { name: 'OmneExtensionPoints', adoption: extensionPointsToolModule.executor },
      requiredCapabilities: [],
    },
    created.ok.facts,
  )
  /** Cuts the params of the named command out of a whole call and parses them, as the binding does. */
  function decode(command: string, params: unknown) {
    const operation = registration.operations.find(([name]) => name === command)?.[1]
    const text = JSON.stringify({ command, params })
    const cut = commandArguments(definition, command, {
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in cut) return cut
    if (operation === undefined || operation.author.kind !== 'ordinary') throw new Error('ordinary')
    return operation.author.parameters.parse(cut.ok)
  }
  return { definition, registration, decode }
}

const tool = author()

export type World = {
  server: Registry | 'unavailable'
  clients: readonly ClientTree[] | 'unavailable'
  scope: Scope
}

/** A sight over a world the test changes in place, with revisions the test records. */
export function sighted(world: World, process = '7c1f') {
  const revisions = createRevisions({ process })
  const sight: ExtensionSight = {
    scope: world.scope,
    server: () => world.server,
    clients: () => world.clients,
    revisions,
  }
  const execution = attachExtensionSight(scope(), sight)
  async function run(command: string, params: unknown = {}) {
    const parsed = tool.decode(command, params)
    if ('failure' in parsed) return { failure: parsed.failure }
    return answerExtensionPoints(parsed.ok as never, execution.context)
  }
  async function text(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
    return answer.ok
  }
  async function failure(command: string, params: unknown = {}) {
    const answer = await run(command, params)
    if (!('failure' in answer)) throw new Error(`expected a failure, got ${answer.ok}`)
    return answer.failure as { kind: string; reason: string; operation?: string }
  }
  return { revisions, run, text, failure }
}

export function unattached() {
  return { signal: scope().context.signal }
}
