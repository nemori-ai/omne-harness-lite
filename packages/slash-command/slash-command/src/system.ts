import { fail, succeed } from '@omne-harness/operation-result'
import {
  type CommandEntry,
  type EntrySource,
  RESERVED_SPACE,
  type Taken,
} from '@omne-harness/slash-command-contract'

const PERMISSION_MODES = ['never', 'auto_permission', 'bypass-permissions'] as const

/** What each system command asks of the session protocol, with the arguments read into the operation's fields. */
const ASKED: Readonly<Record<string, (args: string) => Taken>> = Object.freeze({
  model: args =>
    args === '' || /\s/u.test(args)
      ? { kind: 'invalid', reason: 'name one model' }
      : {
          kind: 'operation',
          protocol: 'session',
          operation: 'select-model',
          fields: { model: args },
        },
  permission: args => {
    const mode = PERMISSION_MODES.find(each => each === args)
    return mode === undefined
      ? { kind: 'invalid', reason: `name one mode: ${PERMISSION_MODES.join(', ')}` }
      : {
          kind: 'operation',
          protocol: 'session',
          operation: 'change-permission-mode',
          fields: { mode },
        }
  },
  archive: args =>
    args === ''
      ? { kind: 'operation', protocol: 'session', operation: 'archive-session', fields: {} }
      : { kind: 'invalid', reason: 'it takes no arguments' },
})

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

/** The official source of the system commands: each is a request for one operation the session already has. */
export function createSystemCommandSource<P>(): EntrySource<P> {
  return {
    name: 'system-commands',
    space: RESERVED_SPACE,
    list: async () => succeed(ENTRIES),
    async take(_asker, { name, args }) {
      const ask = Object.hasOwn(ASKED, name) ? ASKED[name] : undefined
      return ask === undefined ? fail('not-listed') : succeed(ask(args.trim()))
    },
  }
}
