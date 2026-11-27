import type { OmneDesktopBridge, VisualBootstrap } from '../shared/desktop-bridge.ts'
import {
  createVisualRecordKernel,
  VISUAL_DEFAULTS,
  type visualRecordKernel,
} from '../shared/visual-record.ts'
import { VISUAL_KEY } from './shell/visual.ts'

type BootHost = Pick<Window, 'localStorage' | 'matchMedia'> & {
  omneDesktop?: Partial<OmneDesktopBridge> | undefined
  omneVisualBootstrap?: VisualBootstrap | undefined
}
type BootRoot = { dataset: DOMStringMap; style: Pick<CSSStyleDeclaration, 'setProperty'> }

/** The first frame's theme and size: the mirror's seed when valid, else local storage, painted the way the
 two controllers paint it, and handed over to the visual manager. It writes no store. */
export function bootVisual(
  records: typeof visualRecordKernel,
  host: BootHost,
  root: BootRoot,
  storageKey: string,
): void {
  function optional<T>(read: () => T): T | undefined {
    try {
      return read()
    } catch {
      return undefined
    }
  }
  const record = records.atStart({
    native: optional(() => records.decode(host.omneDesktop?.visual?.seed?.record ?? null).record),
    get local() {
      return optional(() => records.decode(host.localStorage.getItem(storageKey)).record)
    },
  })
  host.omneVisualBootstrap = { storageKey, record }
  const { theme, size } = records.effective(record)
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof host.matchMedia === 'function' &&
      host.matchMedia('(prefers-color-scheme: dark)').matches)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.themePreference = theme
  if (size === 'medium') delete root.dataset.size
  else root.dataset.size = size
}

/** The face the device stays on, and the tokens the whole app was last tinted with, until the changes'
 sheet takes over. */
export function bootLocal(host: Pick<Window, 'localStorage'>, root: BootRoot): void {
  function read(key: string): string | null {
    try {
      return host.localStorage.getItem(key)
    } catch {
      return null
    }
  }
  root.dataset.face = read('omne.face') === 'back' ? 'back' : 'front'
  let tokens: unknown = null
  try {
    tokens = JSON.parse(read('omne.tokens') ?? 'null')
  } catch {}
  if (tokens === null || typeof tokens !== 'object' || Array.isArray(tokens)) return
  const written: string[] = []
  for (const [name, value] of Object.entries(tokens)) {
    if (!/^--omne-[a-z0-9-]+$/.test(name)) continue
    if (typeof value !== 'string' || !/^[A-Za-z0-9 #%.,()+*/_-]+$/.test(value)) continue
    if (/(^|[^a-z-])url\(/i.test(value)) continue
    root.style.setProperty(name, value)
    written.push(name)
  }
  if (written.length > 0) root.dataset.bootTokens = written.join(' ')
}

/** theme-boot.js: the same kernel and the same functions as the page, as text. */
export function themeBootScript(
  record: { create: typeof createVisualRecordKernel; defaults: typeof VISUAL_DEFAULTS } = {
    create: createVisualRecordKernel,
    defaults: VISUAL_DEFAULTS,
  },
): string {
  const kernel = `(${record.create.toString()})(${JSON.stringify(record.defaults)})`
  const root = 'document.documentElement'
  return [
    `;(${bootVisual.toString()})(${kernel},window,${root},${JSON.stringify(VISUAL_KEY)})`,
    `;(${bootLocal.toString()})(window,${root})`,
    '',
  ].join('\n')
}
