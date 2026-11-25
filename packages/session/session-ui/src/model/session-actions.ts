import { PART_ATTRIBUTE, type ActionItem, type ActionKey } from '@omne-harness/shell-contract'
import {
  sessionHeaderModel,
  sessionHeaderPermission,
  sessionListNew,
  sessionTranscriptReasoning,
  sessionTranscriptToolCall,
} from '../parts.ts'
import type { CallControls } from './call-controls.ts'
import type { ComposerHandles, SendWay } from './composer-handles.ts'
import { conversationItems, toolCallState } from './conversation.ts'
import type { SessionDriver } from './session-driver.ts'
import type { Open } from './session-machine.ts'

export type SessionActionDeps = Readonly<{
  scope: () => string | undefined
  driver: () => SessionDriver | undefined
  composer: ComposerHandles
  calls: CallControls
  show: (page: string) => void
  pages: Readonly<{ conversation: string; search: string }>
}>

const CONTROL = '这一轮'
const SENDING = '发送'
const MOVING = '会话'
const VIEW = '对话页'
const NO_SESSION = '没有打开的会话'

const partAt = (part: Readonly<{ name: string }>): string => `[${PART_ATTRIBUTE}="${part.name}"]`
const at = (layer: ActionKey['layer'], chord: string): readonly ActionKey[] => [{ chord, layer }]

/** The tool call the run waits on now: the last one with no result yet. */
export function workingCall(open: Open): string | undefined {
  const items = conversationItems(open.content, open.run.kind !== 'idle')
  const calls = items.flatMap(item =>
    item.kind === 'message' || item.kind === 'note'
      ? item.parts.flatMap(part =>
          part.kind === 'tool-call' && part.callId !== null && toolCallState(part) === 'working'
            ? [part.callId]
            : [],
        )
      : [],
  )
  return calls.at(-1)
}

/** Opens the control a person would press: a menu opens on Enter, a plain button on a click. */
function press(selector: string): true | string {
  const found = document.querySelector<HTMLElement>(selector)
  const control =
    found?.matches('button,[role="combobox"]') === true
      ? found
      : found?.querySelector<HTMLElement>('button,[role="combobox"]')
  if (control === null || control === undefined) return '对话页上现在没有这个控件'
  if (control.getAttribute('aria-haspopup') === null) {
    control.click()
    return true
  }
  control.focus()
  control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return true
}

const pressed = (selector: string) => (): void => {
  const done = press(selector)
  if (done !== true) throw new Error(done)
}

function runControls(deps: SessionActionDeps): readonly ActionItem[] {
  const open = (): Open | undefined => {
    const state = deps.driver()?.getState().session
    return state?.kind === 'open' ? state : undefined
  }
  const running = (): true | string => {
    const state = open()
    if (state === undefined) return NO_SESSION
    if (state.run.kind === 'idle') return '没有在做的一轮'
    return state.run.kind === 'cancelling' && !state.run.unknown ? '这一轮正在停止' : true
  }
  const call = (act: 'background' | 'stop') => async (): Promise<void> => {
    const state = open()
    const scope = deps.scope()
    const target = state === undefined ? undefined : workingCall(state)
    if (state === undefined || scope === undefined || target === undefined) return
    const why = await deps.calls[act](scope, state.session, target)
    if (why !== null) throw new Error(why)
  }
  const calling = (): true | string => {
    const state = open()
    if (state === undefined) return NO_SESSION
    return workingCall(state) === undefined ? '没有在等的调用' : true
  }
  const control = (id: string, title: string, order: number, rest: Partial<ActionItem>) =>
    ({ id, title, group: CONTROL, kind: 'control', order, ...rest }) as ActionItem
  return [
    control('session.stop', '停止这一轮', 0, {
      keys: at('global', 'Mod+.'),
      available: running,
      run: () => deps.driver()?.cancel(),
    }),
    control('session.force-stop', '强制停止这一轮', 1, {
      available: () => ((open()?.run.kind ?? 'idle') === 'idle' ? '没有在做的一轮' : true),
      run: () => deps.driver()?.cancel('force'),
    }),
    control('session.background', '把在等的调用转到后台', 2, {
      keys: at('global', 'Mod+Shift+B'),
      available: calling,
      run: call('background'),
    }),
    control('session.stop-call', '停掉在等的调用', 3, { available: calling, run: call('stop') }),
    control('session.retry', '重试失败的那一轮', 4, {
      available: () => {
        const fact = open()?.waiting
        return fact?.fact.kind === 'waiting' &&
          fact.fact.pending > 0 &&
          fact.retry.kind !== 'no-change'
          ? true
          : '没有可以重试的一轮'
      },
      run: () => deps.driver()?.retry(),
    }),
  ]
}

function sendWays(deps: SessionActionDeps): readonly ActionItem[] {
  const way = (id: string, title: string, order: number, how: SendWay, chord: string) =>
    ({
      id,
      title,
      group: SENDING,
      kind: 'control',
      order,
      keys: at('composer', chord),
      available: () => (deps.composer.current() === undefined ? '没有打开的输入框' : true),
      run: () => {
        const done = deps.composer.current()?.send(how) ?? '没有打开的输入框'
        if (done !== true) throw new Error(done)
      },
    }) as const satisfies ActionItem
  return [
    way('session.send', '发送', 10, 'send', 'Enter'),
    way('session.send-first', '插队：排到别的待处理之前', 11, 'first', 'Mod+Enter'),
    way('session.send-after', '等这一轮结束再发', 12, 'after', 'Alt+Enter'),
  ]
}

function moves(deps: SessionActionDeps): readonly ActionItem[] {
  const listed = (): readonly string[] => {
    const list = deps.driver()?.getState().list
    const page = list?.kind === 'read' ? list.page : list?.kind === 'reading' ? list.shown : null
    return page?.sessions.map(item => item.session) ?? []
  }
  const step = (by: 1 | -1) => (): void => {
    const driver = deps.driver()
    const sessions = listed()
    if (driver === undefined || sessions.length === 0) return
    const state = driver.getState().session
    const here = state.kind === 'open' ? sessions.indexOf(state.session) : -1
    const next = sessions[(here + by + sessions.length) % sessions.length]
    if (next === undefined) return
    driver.openSession(next)
    deps.show(deps.pages.conversation)
  }
  const some = (): true | string => (listed().length === 0 ? '会话列表是空的' : true)
  const toComposer =
    (then: (handle: NonNullable<ReturnType<ComposerHandles['current']>>) => void) => (): void => {
      deps.show(deps.pages.conversation)
      const handle = deps.composer.current()
      if (handle !== undefined) then(handle)
    }
  const ui = (id: string, title: string, group: string, order: number, rest: Partial<ActionItem>) =>
    ({ id, title, group, kind: 'ui', order, available: () => true, ...rest }) as ActionItem
  return [
    ui('session.new', '新建一段会话', MOVING, 20, {
      keys: at('global', 'Mod+N'),
      run: () => {
        deps.show(deps.pages.conversation)
        pressed(partAt(sessionListNew))()
      },
    }),
    ui('session.next', '下一段会话', MOVING, 21, {
      keys: at('global', 'Ctrl+Tab'),
      available: some,
      run: step(1),
    }),
    ui('session.previous', '上一段会话', MOVING, 22, {
      keys: at('global', 'Ctrl+Shift+Tab'),
      available: some,
      run: step(-1),
    }),
    ui('session.search', '搜索历史', MOVING, 23, {
      keys: at('global', 'Mod+Shift+F'),
      run: () => deps.show(deps.pages.search),
    }),
    ui('session.focus-composer', '回到输入框', VIEW, 30, {
      keys: at('global', 'Mod+L'),
      run: toComposer(handle => handle.focus()),
    }),
    ui('session.start-command', '回到输入框敲一条命令', VIEW, 31, {
      keys: at('page', '/'),
      available: () => (deps.composer.current() === undefined ? '没有打开的输入框' : true),
      run: toComposer(handle => {
        handle.focus()
        handle.insert('/')
      }),
    }),
    ui('session.details', '展开或收起过程细节', VIEW, 32, {
      keys: at('global', 'Mod+Shift+D'),
      run: toggleDetails,
    }),
    ui('session.pick-model', '选模型', VIEW, 33, {
      keys: at('global', 'Mod+Alt+/'),
      run: pressed(partAt(sessionHeaderModel)),
    }),
    ui('session.pick-permission', '选权限处理模式', VIEW, 34, {
      keys: at('global', 'Mod+Shift+P'),
      run: pressed(partAt(sessionHeaderPermission)),
    }),
    ui('session.side-panel', '展开或收起侧边区', VIEW, 35, {
      keys: at('global', 'Mod+Alt+B'),
      run: pressed('button.omne-session-figure[aria-controls]'),
    }),
  ]
}

const PROCESS = [sessionTranscriptToolCall, sessionTranscriptReasoning]
  .map(part => `${partAt(part)} [aria-expanded]:not([aria-haspopup])`)
  .join(',')

/** Opens every process line when one is shut, and shuts them all when all are open. */
function toggleDetails(): void {
  const lines = [...document.querySelectorAll<HTMLElement>(PROCESS)]
  const open = lines.some(line => line.getAttribute('aria-expanded') !== 'true')
  for (const line of lines)
    if ((line.getAttribute('aria-expanded') === 'true') !== open) line.click()
}

/** What the session module puts in the shell's action table. */
export function sessionActions(deps: SessionActionDeps): readonly ActionItem[] {
  return [...runControls(deps), ...sendWays(deps), ...moves(deps)]
}
