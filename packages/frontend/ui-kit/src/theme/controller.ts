export type ThemeChoice = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export interface ColorSchemeQuery {
  readonly matches: boolean
  addEventListener(type: 'change', listener: () => void): void
  removeEventListener(type: 'change', listener: () => void): void
}

export interface ThemeRoot {
  readonly dataset: { theme?: string; themePreference?: string }
  readonly classList: { add(token: string): void; remove(token: string): void }
}

export const THEME_SWITCHING_CLASS = 'theme-switching'

export const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(preference: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (preference !== 'system') return preference
  return systemPrefersDark ? 'dark' : 'light'
}

export interface ThemeControllerInput {
  readonly read: () => ThemeChoice
  readonly write: (choice: ThemeChoice) => void
  readonly system: ColorSchemeQuery | undefined
  readonly root?: ThemeRoot
  readonly frame?: (callback: () => void) => void
}

export interface ThemeController {
  start(): ResolvedTheme
  select(choice: ThemeChoice): ResolvedTheme
  dispose(): void
}

class PageThemeController implements ThemeController {
  private readonly input: ThemeControllerInput
  private readonly root: ThemeRoot
  private readonly frame: (callback: () => void) => void
  private readonly onSystemChange = (): void => void this.paint()
  private preference: ThemeChoice = 'system'
  private following = false
  private frozen = false

  public constructor(input: ThemeControllerInput) {
    this.input = input
    this.root = input.root ?? document.documentElement
    this.frame = input.frame ?? (callback => void requestAnimationFrame(callback))
  }

  public start(): ResolvedTheme {
    return this.apply(this.input.read())
  }

  public select(choice: ThemeChoice): ResolvedTheme {
    this.input.write(choice)
    return this.apply(choice)
  }

  public dispose(): void {
    this.follow(false)
    this.thaw()
  }

  private apply(preference: ThemeChoice): ResolvedTheme {
    this.preference = preference
    this.follow(preference === 'system')
    return this.paint()
  }

  private paint(): ResolvedTheme {
    const resolved = resolveTheme(this.preference, this.input.system?.matches ?? true)
    if (this.root.dataset.theme !== resolved) this.freeze()
    this.root.dataset.theme = resolved
    this.root.dataset.themePreference = this.preference
    return resolved
  }

  private freeze(): void {
    this.root.classList.add(THEME_SWITCHING_CLASS)
    if (this.frozen) return
    this.frozen = true
    this.frame(() => this.frame(() => this.thaw()))
  }

  private thaw(): void {
    this.frozen = false
    this.root.classList.remove(THEME_SWITCHING_CLASS)
  }

  private follow(wanted: boolean): void {
    const query = this.input.system
    if (query === undefined || wanted === this.following) return
    if (wanted) query.addEventListener('change', this.onSystemChange)
    else query.removeEventListener('change', this.onSystemChange)
    this.following = wanted
  }
}

export function createThemeController(input: ThemeControllerInput): ThemeController {
  return new PageThemeController(input)
}

export function colorSchemeQuery(): ColorSchemeQuery | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(COLOR_SCHEME_QUERY) : undefined
}
