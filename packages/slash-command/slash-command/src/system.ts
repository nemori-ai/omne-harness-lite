import { fail, succeed } from '@omne-harness/operation-result'
import {
  type CommandEntry,
  type EntrySource,
  RESERVED_SPACE,
} from '@omne-harness/slash-command-contract'

/** The operation of the session protocol each system command asks for; the command does nothing of its own. */
export const SYSTEM_OPERATIONS = Object.freeze({
  model: 'select-model',
  permission: 'change-permission-mode',
  archive: 'archive-session',
} as const)

export type SystemOperation = (typeof SYSTEM_OPERATIONS)[keyof typeof SYSTEM_OPERATIONS]

const ENTRIES: readonly CommandEntry[] = Object.freeze([
  {
    space: RESERVED_SPACE,
    name: 'model',
    kind: 'system',
    title: '换这段会话用的模型',
    hint: '<模型名>',
    whileRunning: 'now',
    takesEffect: 'next-request',
  },
  {
    space: RESERVED_SPACE,
    name: 'permission',
    kind: 'system',
    title: '改这段会话的权限处理模式',
    hint: '<never | auto_permission | bypass-permissions>',
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
    async take(_asker, name) {
      if (!Object.hasOwn(SYSTEM_OPERATIONS, name)) return fail('not-listed')
      const operation = SYSTEM_OPERATIONS[name as keyof typeof SYSTEM_OPERATIONS]
      return succeed({ kind: 'operation', operation, args: '' })
    },
  }
}
