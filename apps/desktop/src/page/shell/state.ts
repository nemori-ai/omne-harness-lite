import {
  createFigureStore,
  type Fallen,
  type FigureStore,
  type ItemOf,
  type LogoutResult,
  type Projection,
  type ScopeSource,
  type ShellLogin,
  type ShellSlots,
  type SlotConflict,
  type SlotName,
  type Toast,
  type ToastBoard,
} from '@omne-harness/shell-contract'
import type { SizeController, SizeTier } from '@omne-harness/ui-kit'
import type { TokenNow } from './changes-sheet.ts'
import type { Face, FacePreference } from './face.ts'
import type { Lack, LackSlot, PageLacks } from './lacks.ts'
import { paletteSwitch, type PaletteSwitch } from './palette.tsx'
import { phraseRelay, type PhraseRelay } from './phrase-relay.ts'
import { redrawRelay, type RedrawRelay } from './redraw.ts'

export const LOGIN_EXPIRED_TEXT = '登录已经失效，请重新登录。'
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

type Tokens = Readonly<Record<string, string>>

export type Watched<T> = {
  get(): T
  subscribe(listener: (value: T) => void): () => void
}

/** The object a page was brought up on, kept until another choice. */
export type PageFocus = Readonly<{ page: string; subject: string }>

export type PageChoice = Watched<string | undefined> & {
  readonly focus: Watched<PageFocus | undefined>
  choose(pageId: string, subject?: string): void
}

export type { Face } from './face.ts'

export type FacePerformer = (to: Face, swap: () => void) => void

export type FaceChoice = Watched<Face> & {
  readonly two: Watched<boolean>
  turn(): void
  perform(performer: FacePerformer): () => void
  told(said: boolean): void
}

/** The told note on show: the newest toast a module handed over while there was room to write it. */
export type Said = Readonly<{ key: string; owner: object; toast: Toast }>

/** Toasts as told notes, with no timer and no queue: without room a toast is dropped and the note put away. */
export type ToldBoard = ToastBoard & {
  said(): Said | undefined
  subscribe(listener: () => void): () => void
  dismiss(): void
  room(open: boolean): void
}

/** What the page reads the slots through: the shell on the tree stands behind it once it loaded. */
export type SlotRelay = ShellSlots & { bind(source: ShellSlots): () => void }

type SlotWatcher = { slot: SlotName; listener: () => void; stop: () => void }

const NOTHING: readonly never[] = Object.freeze([])
const idle = (): void => undefined

function slotRelay(): SlotRelay {
  let source: ShellSlots | undefined
  const watchers = new Set<SlotWatcher>()
  const follow = (next: ShellSlots | undefined): void => {
    source = next
    for (const watcher of Array.from(watchers)) {
      watcher.stop()
      watcher.stop = next?.subscribe(watcher.slot, watcher.listener) ?? idle
      watcher.listener()
    }
  }
  return {
    items: <K extends SlotName>(slot: K): readonly ItemOf<K>[] => source?.items(slot) ?? NOTHING,
    conflicts: (slot): readonly SlotConflict[] => source?.conflicts(slot) ?? NOTHING,
    subscribe(slot, listener) {
      const watcher = { slot, listener, stop: source?.subscribe(slot, listener) ?? idle }
      watchers.add(watcher)
      return () => {
        watcher.stop()
        watchers.delete(watcher)
      }
    },
    bind(next) {
      follow(next)
      return () => {
        if (source === next) follow(undefined)
      }
    },
  }
}

export type LackRelay = PageLacks & { bind(source: PageLacks): () => void }

function lackRelay(): LackRelay {
  let source: PageLacks | undefined
  const changed = listeners<undefined>()
  let stop = idle
  const follow = (next: PageLacks | undefined): void => {
    stop()
    source = next
    stop = next?.subscribe(() => changed.emit(undefined)) ?? idle
    changed.emit(undefined)
  }
  return {
    of: (slot: LackSlot, id: string): readonly Lack[] => source?.of(slot, id) ?? NOTHING,
    subscribe: listener => changed.add(() => listener()),
    bind(next) {
      follow(next)
      return () => {
        if (source === next) follow(undefined)
      }
    },
  }
}

export type Outside = Readonly<{
  warn(text: string): void
  navigate(pageId: string, subject?: string): void
}>

export type OutsideRelay = Outside & { bind(source: Outside): () => void }

function outsideRelay(): OutsideRelay {
  let source: Outside | undefined
  return {
    warn: text => source?.warn(text),
    navigate: (pageId, subject) => source?.navigate(pageId, subject),
    bind(next) {
      source = next
      return () => {
        if (source === next) source = undefined
      }
    },
  }
}

export type SizeRelay = Pick<SizeController, 'current' | 'set'> & {
  bind(source: Pick<SizeController, 'current' | 'set'>): () => void
}

const DEFAULT_SIZE: SizeTier = 'medium'

function sizeRelay(): SizeRelay {
  let source: Pick<SizeController, 'current' | 'set'> | undefined
  return {
    current: () => source?.current() ?? DEFAULT_SIZE,
    set: tier => source?.set(tier),
    bind(next) {
      source = next
      return () => {
        if (source === next) source = undefined
      }
    },
  }
}

export type ShellState = {
  readonly slots: SlotRelay
  readonly size: SizeRelay
  readonly palette: PaletteSwitch
  readonly lacks: LackRelay
  readonly redraw: RedrawRelay
  readonly phrases: PhraseRelay
  readonly told: ToldBoard
  readonly figure: FigureStore
  /** The modules that put each page, by page id. A page on show has one: that module is in front. */
  readonly pageOwners: Map<string, readonly object[]>
  readonly login: ShellLogin
  readonly scope: ScopeSource
  readonly page: PageChoice
  readonly face: FaceChoice
  readonly notice: Watched<string | undefined>
  readonly sheet: Watched<string> & { set(css: string): void }
  readonly projection: Watched<Projection | undefined> & { set(projection: Projection): void }
  readonly outside: OutsideRelay
  readonly fallen: Watched<readonly Fallen[]> & { set(fallen: readonly Fallen[]): void }
  readonly appTokens: Watched<Tokens> & { set(tokens: Tokens): void }
  readonly knowsToken: (name: string) => boolean
  readonly tokens: () => readonly TokenNow[]
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

function pageChoice(slots: ShellSlots): PageChoice & { dispose(): void } {
  const chosen = cell<string | undefined>(undefined)
  const shown = cell<string | undefined>(undefined)
  const focus = cell<PageFocus | undefined>(undefined)
  const pages = () => slots.items('pages')
  let grace: ReturnType<typeof setTimeout> | undefined
  const there = (id: string | undefined): boolean => pages().some(page => page.id === id)
  const giveUp = (): void => {
    grace = undefined
    if (there(chosen.get())) return
    chosen.set(undefined)
    settle()
  }
  const settle = (): void => {
    const current = chosen.get()
    if (current !== undefined && !there(current)) grace ??= setTimeout(giveUp, 0)
    shown.set(current ?? pages()[0]?.id)
    if (focus.get()?.page !== shown.get()) focus.set(undefined)
  }
  const unsubscribe = slots.subscribe('pages', settle)
  const stop = (): void => {
    unsubscribe()
    clearTimeout(grace)
  }
  settle()
  return {
    get: shown.get,
    subscribe: shown.subscribe,
    focus: { get: focus.get, subscribe: focus.subscribe },
    choose(pageId, subject) {
      if (!pages().some(page => page.id === pageId)) return
      chosen.set(pageId)
      focus.set(subject === undefined ? undefined : { page: pageId, subject })
      settle()
    },
    dispose: stop,
  }
}

function faceChoice(
  slots: ShellSlots,
  login: ShellLogin,
  preference: FacePreference,
): FaceChoice & { dispose(): void } {
  let kept = preference.read()
  const shown = cell<Face>(kept)
  const there = (): boolean => slots.items('back').length > 0 || slots.conflicts('back').length > 0
  const two = cell(there())
  let waiting = kept === 'back'
  let said = false
  let saying: ReturnType<typeof setTimeout> | undefined
  let performer: FacePerformer | undefined
  const settle = (): void => {
    two.set(there())
    if (two.get() || said) waiting = false
    if (!two.get() && !waiting) shown.set('front')
  }
  const stopSlots = slots.subscribe('back', settle)
  const stopLogin = login.subscribe(state => {
    if (state !== 'signed-in') return
    shown.set(kept)
    waiting = kept === 'back'
    settle()
  })
  return {
    get: shown.get,
    subscribe: shown.subscribe,
    two: { get: two.get, subscribe: two.subscribe },
    turn() {
      if (!two.get()) return
      const to: Face = shown.get() === 'front' ? 'back' : 'front'
      const swap = (): void => {
        shown.set(to)
        kept = to
        preference.write(to)
      }
      if (performer === undefined) swap()
      else performer(to, swap)
    },
    perform(next) {
      performer = next
      return () => {
        if (performer === next) performer = undefined
      }
    },
    told(next) {
      clearTimeout(saying)
      if (!next) {
        said = false
        return
      }
      saying = setTimeout(() => {
        said = true
        settle()
      }, 0)
    },
    dispose() {
      clearTimeout(saying)
      stopSlots()
      stopLogin()
    },
  }
}

const UNKEPT: FacePreference = { read: () => 'front', write: () => undefined }

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

export function createToldBoard(): ToldBoard {
  const said = cell<Said | undefined>(undefined)
  const serials = new WeakMap<object, number>()
  let owners = 0
  let open = false
  const keyOf = (owner: object, id: string): string => {
    let serial = serials.get(owner)
    if (serial === undefined) {
      owners += 1
      serial = owners
      serials.set(owner, serial)
    }
    return `${serial}:${id}`
  }
  return {
    show(owner, toast) {
      if (open) said.set({ key: keyOf(owner, toast.id), owner, toast })
    },
    withdraw(owner) {
      if (said.get()?.owner === owner) said.set(undefined)
    },
    said: said.get,
    subscribe: listener => said.subscribe(() => listener()),
    dismiss: () => said.set(undefined),
    room(next) {
      open = next
      if (!next) said.set(undefined)
    },
  }
}

export function createShellState(
  inner: ShellLogin,
  options: Readonly<{
    /** A line for the login gate from outside the shell, such as "the login expired". */
    notices?: (show: (text: string) => void) => () => void
    knowsToken?: (name: string) => boolean
    tokens?: () => readonly TokenNow[]
    faces?: FacePreference
  }> = {},
): ShellState {
  const slots = slotRelay()
  const told = createToldBoard()
  const scopeCell = cell<string | undefined>(undefined)
  const notice = cell<string | undefined>(undefined)
  const page = pageChoice(slots)
  const face = faceChoice(slots, inner, options.faces ?? UNKEPT)
  const stopNotices = options.notices?.(text => notice.set(text))
  const stopLogin = inner.subscribe(state => {
    if (state !== 'signed-in') scopeCell.set(undefined)
  })
  const stopTold = page.subscribe(shown => {
    if (shown !== undefined && told.said()?.toast.action?.page === shown) told.dismiss()
  })
  return {
    slots,
    lacks: lackRelay(),
    redraw: redrawRelay(),
    size: sizeRelay(),
    palette: paletteSwitch(),
    phrases: phraseRelay(),
    told,
    figure: createFigureStore(),
    pageOwners: new Map(),
    login: watchedLogin(inner, notice),
    scope: { get: scopeCell.get, set: scopeCell.set, subscribe: scopeCell.subscribe },
    page,
    face,
    notice: { get: notice.get, subscribe: notice.subscribe },
    sheet: cell(''),
    projection: cell<Projection | undefined>(undefined),
    outside: outsideRelay(),
    fallen: cell<readonly Fallen[]>([]),
    appTokens: cell<Tokens>({}),
    knowsToken: options.knowsToken ?? (() => false),
    tokens: options.tokens ?? (() => []),
    dispose() {
      stopLogin()
      stopNotices?.()
      stopTold()
      page.dispose()
      face.dispose()
    },
  }
}
