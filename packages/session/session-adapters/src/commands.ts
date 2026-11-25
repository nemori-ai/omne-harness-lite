import { fail, type Outcome, succeed } from '@omne-harness/operation-result'
import {
  type Asker,
  type CommandEntry,
  type EntrySource,
  type Naming,
  RESERVED_SPACE,
  type Taken,
} from '@omne-harness/slash-command-contract'

export const SESSION_COMMANDS = 'session-commands'

const SESSION = Object.freeze({ name: 'session', major: 1 })
const PERMISSION_MODES = ['never', 'auto_permission', 'bypass-permissions'] as const

export type SessionCommandPorts<P> = Readonly<{
  permissionRevision(asker: Asker<P>, signal: AbortSignal): Promise<Outcome<string, 'unavailable'>>
}>

const ENTRIES: readonly CommandEntry[] = Object.freeze([
  {
    space: RESERVED_SPACE,
    name: 'model',
    kind: 'system',
    title: '换这段会话用的模型',
    hint: '<模型名>',
    params: [{ name: '模型名' }],
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
  {
    space: RESERVED_SPACE,
    name: 'permission',
    kind: 'system',
    title: '改这段会话的权限处理模式',
    hint: '<never | auto_permission | bypass-permissions>',
    params: [{ name: '模式' }],
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
])

type Asking<P> = Readonly<{ asker: Asker<P>; naming: Naming; signal: AbortSignal }>
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
      const mode = PERMISSION_MODES.find(each => each === naming.args.trim())
      if (mode === undefined) return invalid(`name one mode: ${PERMISSION_MODES.join(', ')}`)
      const revision = await ports.permissionRevision(asker, signal)
      if (!('ok' in revision)) return revision
      return operation(asker, 'change-permission-mode', { mode, expectedRevision: revision.ok })
    },
    async archive({ asker, naming }) {
      if (naming.args.trim() !== '') return invalid('it takes no arguments')
      return operation(asker, 'archive-session', { controlId: controlOf(naming) })
    },
  }
}

/** The commands the session brings: each reads its arguments into the fields of the session operation it names. */
export function createSessionCommandSource<P>(ports: SessionCommandPorts<P>): EntrySource<P> {
  const take = takers(ports)
  return {
    name: SESSION_COMMANDS,
    space: RESERVED_SPACE,
    list: async () => succeed(ENTRIES),
    async take(asker, naming, signal) {
      const taker = Object.hasOwn(take, naming.name) ? take[naming.name] : undefined
      return taker === undefined ? fail('not-listed') : taker({ asker, naming, signal })
    },
  }
}
