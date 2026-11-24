import type { ShellState } from './state.ts'

/** The sheet of the changes, adopted by the page after its own sheets: its text is what the shell reads. */
export function adoptChanges(page: Document, text: ShellState['sheet']): () => void {
  const adopted = new CSSStyleSheet()
  const write = (css: string): void => adopted.replaceSync(css)
  write(text.get())
  page.adoptedStyleSheets = [...page.adoptedStyleSheets, adopted]
  const stop = text.subscribe(write)
  return () => {
    stop()
    page.adoptedStyleSheets = page.adoptedStyleSheets.filter(sheet => sheet !== adopted)
  }
}

const PREFIX = '--omne-'

export type TokenNow = Readonly<{ name: string; now: string | null }>

type Rules = Readonly<{ length: number; [index: number]: CSSRule }>

function rulesOf(sheet: CSSStyleSheet): Rules {
  try {
    return sheet.cssRules
  } catch {
    return []
  }
}

function namesIn(rules: Rules, names: Set<string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule && rule.selectorText.includes(':root'))
      for (const name of Array.from(rule.style)) if (name.startsWith(PREFIX)) names.add(name)
    if ('cssRules' in rule) namesIn(rule.cssRules as Rules, names)
  }
}

/** The tokens of the interface: the names under `--omne-` that the sheets of the page set at `:root`, each with its value at the root now. */
export const tokensOf = (page: Document) => (): readonly TokenNow[] => {
  const names = new Set<string>()
  for (const sheet of Array.from(page.styleSheets)) namesIn(rulesOf(sheet), names)
  const root = getComputedStyle(page.documentElement)
  return Array.from(names)
    .sort()
    .map(name => ({ name, now: root.getPropertyValue(name).trim() || null }))
}

/** A token of the interface is a name under `--omne-` that the page gives a value at its root, or that its sheets set there. */
export const tokenOf = (page: Document) => {
  const listed = tokensOf(page)
  return (name: string): boolean =>
    name.startsWith(PREFIX) &&
    (getComputedStyle(page.documentElement).getPropertyValue(name).trim() !== '' ||
      listed().some(token => token.name === name))
}
