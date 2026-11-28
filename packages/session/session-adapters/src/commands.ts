import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import {
  type Asker,
  type Candidate,
  type CommandEntry,
  type EntrySource,
  type Naming,
  RESERVED_SPACE,
  type Taken,
} from '@omne-harness/slash-command-contract'

export const SESSION_COMMANDS = 'session-commands'

const SESSION = Object.freeze({ name: 'session', major: 1 })

/** A model the session could be pointed at, as its owner lists it for the asker now. */
export type ModelChoice = Readonly<{
  name: string
  unavailable?: string
  note?: string
  reasoningEfforts?: readonly string[]
  defaultReasoningEffort?: string
}>

export type SelectedModel = Readonly<{ model: string; reasoningEffort?: string }>

export type SessionCommandPorts<P> = Readonly<{
  permissionRevision(asker: Asker<P>, signal: AbortSignal): Promise<Outcome<string, 'unavailable'>>
  models(
    asker: Asker<P>,
    signal: AbortSignal,
  ): Promise<Outcome<readonly ModelChoice[], 'unavailable'>>
  selectedModel(
    asker: Asker<P>,
    signal: AbortSignal,
  ): Promise<Outcome<SelectedModel, 'unavailable'>>
}>

const MODES: readonly Candidate[] = Object.freeze([
  { value: 'never', title: '需要询问时拒绝' },
  { value: 'auto_permission', title: '需要询问时问人' },
  { value: 'bypass-permissions', title: '跳过询问；明确禁止的仍然不能做' },
])

const ENTRIES: readonly CommandEntry[] = Object.freeze([
  {
    space: RESERVED_SPACE,
    name: 'model',
    kind: 'system',
    title: '换这段会话用的模型',
    hint: '<模型名>',
    params: [{ name: '模型名', candidates: true }],
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
  {
    space: RESERVED_SPACE,
    name: 'permission',
    kind: 'system',
    title: '改这段会话的权限处理模式',
    hint: '<never | auto_permission | bypass-permissions>',
    params: [{ name: '模式', candidates: true }],
    whileRunning: 'now',
    takesEffect: 'now',
  },
  {
    space: RESERVED_SPACE,
    name: 'archive',
    kind: 'system',
    title: '归档这段会话；在跑的一轮随之取消',
    whileRunning: 'now',
    takesEffect: 'now',
  },
  {
    space: RESERVED_SPACE,
    name: 'reload',
    kind: 'system',
    title: '用上这段会话的定义此刻的版本',
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
  {
    space: RESERVED_SPACE,
    name: 'effort',
    kind: 'system',
    title: '换这段会话用的推理档位；模型不变',
    hint: '<档位>',
    params: [{ name: '档位', candidates: true }],
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
])

const EFFORTS: readonly string[] = Object.freeze(['low', 'medium', 'high', 'xhigh'])
const NO_EFFORTS = '这个型号不能调推理档位'

type Asking<P> = Readonly<{ asker: Asker<P>; naming: Naming; signal: AbortSignal }>

type InUse = SelectedModel & Readonly<{ choice: ModelChoice | undefined }>

async function inUse<P>(
  ports: SessionCommandPorts<P>,
  asker: Asker<P>,
  signal: AbortSignal,
): Promise<Outcome<InUse, 'unavailable'>> {
  const [models, selected] = await Promise.all([
    ports.models(asker, signal),
    ports.selectedModel(asker, signal),
  ])
  if (!('ok' in models)) return models
  if (!('ok' in selected)) return selected
  return succeed({
    ...selected.ok,
    choice: models.ok.find(choice => choice.name === selected.ok.model),
  })
}
type Take<P> = (asking: Asking<P>) => Promise<Outcome<Taken, 'unavailable'>>

const invalid = (reason: string) => succeed({ kind: 'invalid', reason } as const)

function operation<P>(
  asker: Asker<P>,
  name: string,
  fields: Readonly<Record<string, unknown>>,
): Outcome<Taken, never> {
  const target = { tenant: asker.tenant, session: asker.session }
  return succeed({
    kind: 'operation',
    protocol: SESSION,
    operation: name,
    fields: { ...target, ...fields },
  })
}

/** The control identity of the operation a command asks for: the same accepted input asks it again, and is recalled. */
const controlOf = (naming: Naming): string => `command:${naming.request}`

function takers<P>(ports: SessionCommandPorts<P>): Readonly<Record<string, Take<P>>> {
  return {
    async model({ asker, naming }) {
      const model = naming.args.trim()
      if (model === '' || /\s/u.test(model)) return invalid('name one model')
      return operation(asker, 'select-model', { controlId: controlOf(naming), model })
    },
    async permission({ asker, naming, signal }) {
      const mode = MODES.find(each => each.value === naming.args.trim())?.value
      if (mode === undefined)
        return invalid(`name one mode: ${MODES.map(each => each.value).join(', ')}`)
      const revision = await ports.permissionRevision(asker, signal)
      if (!('ok' in revision)) return revision
      return operation(asker, 'change-permission-mode', { mode, expectedRevision: revision.ok })
    },
    async archive({ asker, naming }) {
      if (naming.args.trim() !== '') return invalid('it takes no arguments')
      return operation(asker, 'archive-session', { controlId: controlOf(naming) })
    },
    async reload({ asker, naming }) {
      if (naming.args.trim() !== '') return invalid('it takes no arguments')
      return operation(asker, 'reload-session', { controlId: controlOf(naming) })
    },
    async effort({ asker, naming, signal }) {
      const effort = naming.args.trim()
      if (effort === '' || /\s/u.test(effort)) return invalid('name one effort')
      const found = await inUse(ports, asker, signal)
      if (!('ok' in found)) return found
      const { model, choice } = found.ok
      const offered = choice?.reasoningEfforts ?? []
      if (offered.length === 0)
        return invalid(`the model in use, ${model}, has no reasoning efforts`)
      if (!offered.includes(effort))
        return invalid(`name one effort ${model} offers: ${offered.join(', ')}`)
      return operation(asker, 'select-model', {
        controlId: controlOf(naming),
        model,
        reasoningEffort: effort,
      })
    },
  }
}

type Offer<P> = (
  asker: Asker<P>,
  signal: AbortSignal,
) => Promise<Outcome<readonly Candidate[], 'unavailable'>>

/** The models the asker can point the session at now; the one in use is marked when it can be read. */
function offers<P>(ports: SessionCommandPorts<P>): Readonly<Record<string, Offer<P>>> {
  return {
    async model(asker, signal) {
      const [models, selected] = await Promise.all([
        ports.models(asker, signal),
        ports.selectedModel(asker, signal),
      ])
      if (!('ok' in models)) return models
      const current = 'ok' in selected ? selected.ok.model : undefined
      return succeed(
        models.ok.map(({ name, unavailable, note }) => ({
          value: name,
          ...(note === undefined ? {} : { title: note }),
          ...(name === current ? { current: true as const } : {}),
          ...(unavailable === undefined ? {} : { unavailable }),
        })),
      )
    },
    permission: async () => succeed(MODES),
    async effort(asker, signal) {
      const found = await inUse(ports, asker, signal)
      if (!('ok' in found)) return found
      const { choice, reasoningEffort } = found.ok
      const offered = choice?.reasoningEfforts ?? []
      if (offered.length === 0)
        return succeed(EFFORTS.map(value => ({ value, unavailable: NO_EFFORTS })))
      const current = reasoningEffort ?? choice?.defaultReasoningEffort
      return succeed(
        offered.map(value => (value === current ? { value, current: true as const } : { value })),
      )
    },
  }
}

/** The commands the session brings: each reads its arguments into the fields of the session operation it names. */
export function createSessionCommandSource<P>(ports: SessionCommandPorts<P>): EntrySource<P> {
  const take = takers(ports)
  const offer = offers(ports)
  return {
    name: SESSION_COMMANDS,
    space: RESERVED_SPACE,
    list: async () => succeed(ENTRIES),
    async take(asker, naming, signal) {
      const taker = Object.hasOwn(take, naming.name) ? take[naming.name] : undefined
      return taker === undefined ? fail('not-listed') : taker({ asker, naming, signal })
    },
    async candidates(asker, name, param, signal) {
      const offered = Object.hasOwn(offer, name) && param === 0 ? offer[name] : undefined
      return offered === undefined ? fail('not-listed') : offered(asker, signal)
    },
  }
}
