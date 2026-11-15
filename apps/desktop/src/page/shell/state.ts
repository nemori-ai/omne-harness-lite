import {
  createSlotStore,
  type LogoutResult,
  type ScopeSource,
  type ShellLogin,
  type SlotStore,
} from '@omne-harness/shell-contract'

export const LOGOUT_UNKNOWN_TEXT = '本机已经退出。服务端是否已注销这次登录，没有得到确认。'

type Listeners<T> = {
  add(listener: (value: T) => void): () => void
  emit(value: T): void
}

function listeners<T>(): Listeners<T> {
  const set = new Set<(value: T) => void>()
  return {
    add(listener) {
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    emit(value) {
      for (const listener of Array.from(set)) listener(value)
    },
  }
}

export type Watched<T> = {
  get(): T
  subscribe(listener: (value: T) => void): () => void
}

export type PageChoice = Watched<string | undefined> & {
  choose(pageId: string): void
}

export type ShellState = {
  readonly slots: SlotStore
  readonly login: ShellLogin
  readonly scope: ScopeSource
  readonly page: PageChoice
  readonly notice: Watched<string | undefined>
  dispose(): void
}

function cell<T>(initial: T): Watched<T> & { set(value: T): void } {
  let value = initial
  const changed = listeners<T>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(value, next)) return
      value = next
      changed.emit(next)
    },
    subscribe: changed.add,
  }
}

function pageChoice(slots: SlotStore): PageChoice & { dispose(): void } {
  const chosen = cell<string | undefined>(undefined)
  const shown = cell<string | undefined>(undefined)
  const pages = () => slots.items('pages')
  const settle = (): void => {
    const ids = pages().map(page => page.id)
    const current = chosen.get()
    if (current !== undefined && !ids.includes(current)) chosen.set(undefined)
    shown.set(chosen.get() ?? ids[0])
  }
  const stop = slots.subscribe('pages', settle)
  settle()
  return {
    get: shown.get,
    subscribe: shown.subscribe,
    choose(pageId) {
      if (!pages().some(page => page.id === pageId)) return
      chosen.set(pageId)
      settle()
    },
    dispose: stop,
  }
}

function watchedLogin(inner: ShellLogin, notice: { set(text: string | undefined): void }) {
  const login: ShellLogin = {
    state: () => inner.state(),
    subscribe: listener => inner.subscribe(listener),
    login: credentials => inner.login(credentials),
    async logout(): Promise<LogoutResult> {
      notice.set(undefined)
      const result = await inner.logout()
      if (result === 'unknown') notice.set(LOGOUT_UNKNOWN_TEXT)
      return result
    },
  }
  return login
}

export function createShellState(inner: ShellLogin): ShellState {
  const slots = createSlotStore()
  const scopeCell = cell<string | undefined>(undefined)
  const notice = cell<string | undefined>(undefined)
  const page = pageChoice(slots)
  const stopLogin = inner.subscribe(state => {
    if (state !== 'signed-in') scopeCell.set(undefined)
  })
  return {
    slots,
    login: watchedLogin(inner, notice),
    scope: { get: scopeCell.get, set: scopeCell.set, subscribe: scopeCell.subscribe },
    page,
    notice: { get: notice.get, subscribe: notice.subscribe },
    dispose() {
      stopLogin()
      page.dispose()
    },
  }
}
