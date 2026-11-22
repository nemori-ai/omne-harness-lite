// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { callsIn, cssRules, normalise, stripCssComments } from './css-text.ts'
import {
  callsNamed,
  moduleOf,
  objectProperties,
  scriptStrings,
  stringArgument,
} from './script-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, isKit, isTokens, type ScannedFile } from './scope.ts'

/**
 * FE-I20: a style reads only `--omne-*` names that exist; outside the kit nothing reads `--kami-*` or declares a
 * custom property; outside tokens.css there is no colour literal and no Tailwind palette class. A name nobody
 * declares does not fail loudly: `var()` falls back to the inherited value, so a row silently loses its hover.
 */

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

interface Read {
  readonly name: string
  readonly fallback: boolean
}

/** Every Tailwind palette name, not only the ones a page happens to use today (from the source's palette guard). */
const PALETTES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
  'white',
  'black',
] as const

/** Every utility that takes a colour; `border` and `divide` also spell sides (`border-t-red-500`). */
const UTILITIES = [
  'bg',
  'text',
  'border',
  'divide',
  'ring',
  'outline',
  'shadow',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'accent',
  'caret',
  'decoration',
  'placeholder',
] as const

const PALETTE_CLASS = new RegExp(
  String.raw`(?<![\w-])(?:${UTILITIES.join('|')})(?:-[xytrbles]{1,2})?-(?:${PALETTES.join('|')})(?:-(?:50|[1-9]50|[1-9]00))?(?![\w-])(?:/\d+)?`,
  'g',
)

const HEX = /(?<![\w&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g
const COLOUR_FUNCTION = /rgba?|hsla?|oklch|oklab|color/

/** The texts of a file that carry values: declaration values of a stylesheet, strings of a script, all of a page. */
function valueTexts(file: Source): string[] {
  if (file.kind === 'css')
    return cssRules(file.text).flatMap(rule => rule.declarations.map(found => found.value))
  if (file.kind === 'html') return [file.text]
  return scriptStrings(file)
}

/** Custom properties read: `var(--x)`, Tailwind's `(--x)` shorthand and `getPropertyValue('--x')`. */
export function reads(file: Source): Read[] {
  const found: Read[] = []
  for (const text of valueTexts(file)) {
    for (const match of text.matchAll(/var\(\s*(--[\w-]+)(?![\w$-])\s*(,)?/g))
      found.push({ name: match[1]!, fallback: match[2] !== undefined })
    for (const match of text.matchAll(/(?<=[\w\]]-)\((?:[a-z-]+:)?(--[\w-]+)\)/g))
      found.push({ name: match[1]!, fallback: false })
  }
  if (file.kind === 'ts' || file.kind === 'tsx' || file.kind === 'js') {
    for (const call of callsNamed(moduleOf(file), 'getPropertyValue')) {
      const name = stringArgument(call)
      if (name?.startsWith('--') === true) found.push({ name, fallback: false })
    }
  }
  return found
}

/** Custom properties declared: stylesheet declarations and `@property`, style-object keys and `setProperty`. */
export function declarations(file: Source): string[] {
  if (file.kind === 'css') {
    return cssRules(file.text).flatMap(rule => [
      ...(/^@property (--[\w-]+)$/.exec(rule.selector)?.slice(1) ?? []),
      ...rule.declarations
        .filter(found => found.property.startsWith('--'))
        .map(found => found.property),
    ])
  }
  if (file.kind === 'html') return []
  const tree = moduleOf(file)
  return [
    ...objectProperties(tree)
      .map(property => property.name)
      .filter(name => name.startsWith('--')),
    ...callsNamed(tree, 'setProperty').flatMap(call => {
      const name = stringArgument(call)
      return name?.startsWith('--') === true ? [name] : []
    }),
  ]
}

/** Colour literals in a file's values, as written apart from whitespace. */
export function colours(file: Source): string[] {
  return valueTexts(file).flatMap(text => [
    ...[...text.matchAll(HEX)].map(match => match[0]),
    ...callsIn(text, COLOUR_FUNCTION).map(normalise),
  ])
}

/** Tailwind palette classes anywhere in a file but its comments. */
export function paletteClasses(file: Source): string[] {
  const text = file.kind === 'css' ? stripCssComments(file.text) : valueTexts(file).join('\n')
  return [...text.matchAll(PALETTE_CLASS)].map(match => match[0])
}

/** The custom properties the kit declares: its stylesheets, `@property` registrations and inline declarations. */
export function kitDeclarations(files: readonly ScannedFile[]): ReadonlySet<string> {
  return new Set(files.filter(file => isKit(file.path)).flatMap(declarations))
}

export function scanTokens(files: readonly ScannedFile[]): string[] {
  const declared = kitDeclarations(files)
  return files.flatMap(file => {
    const found: string[] = []
    const kit = isKit(file.path)
    for (const read of reads(file)) {
      if (read.name.startsWith('--omne-') && !read.fallback && !declared.has(read.name))
        found.push(`undefined ${read.name}`)
      if (!kit && read.name.startsWith('--kami-')) found.push(`reads ${read.name}`)
    }
    if (!kit) for (const name of declarations(file)) found.push(`declares ${name}`)
    if (!isTokens(file.path)) {
      for (const colour of colours(file)) found.push(`colour ${colour}`)
      for (const name of paletteClasses(file)) found.push(`palette ${name}`)
    }
    return found.map(violation => `${file.path} | ${violation}`)
  })
}

const sample = (path: string, kind: ScannedFile['kind'], text: string): ScannedFile => ({
  path,
  kind,
  text,
  member: path.startsWith('packages/frontend/ui-kit/')
    ? '@omne-harness/ui-kit'
    : '@omne-harness/x-ui',
})

describe('token gate', () => {
  it('reads only custom properties that exist and writes no colour outside the tokens', () => {
    const report = ratchet('tokens', tally(scanTokens(FILES)))
    expect(
      report.missing,
      'baselines/tokens.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(
      report.added,
      'new violations: read an existing --omne-* role, declare nothing outside the kit',
    ).toEqual([])
    expect(
      report.stale,
      'fixed violations: shrink baselines/tokens.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('finds the kit declarations it resolves names against, @property registrations included', () => {
    const declared = kitDeclarations(FILES)
    expect(declared.has('--omne-ring-room')).toBe(true)
    expect(declared.has('--omne-surface-page')).toBe(true)
    expect(declared.has('--omne-font-ui')).toBe(true)
  })

  it('recognises each way a name is read and declared, and each colour literal', () => {
    const css = sample(
      'packages/x/x-ui/src/a.css',
      'css',
      '.a { color: var(--omne-ink); background: var(--omne-hover, red); --omne-x: var(--kami-page); } .b { width: var(--tw-x); fill: #fff; stroke: #A1B2C3; color: rgb(0 0 0 / 50%); outline-color: oklch(0.5 0.1 200); border-color: transparent; background: color-mix(in oklch, var(--omne-a) 20%, transparent); } @property --omne-y { syntax: "<length>"; }',
    )
    expect(reads(css)).toEqual([
      { name: '--omne-ink', fallback: false },
      { name: '--omne-hover', fallback: true },
      { name: '--kami-page', fallback: false },
      { name: '--tw-x', fallback: false },
      { name: '--omne-a', fallback: false },
    ])
    expect(declarations(css)).toEqual(['--omne-x', '--omne-y'])
    expect(colours(css)).toEqual(['#fff', '#A1B2C3', 'rgb(0 0 0/50%)', 'oklch(0.5 0.1 200)'])
    const script = sample(
      'packages/x/x-ui/src/a.tsx',
      'tsx',
      `// var(--omne-commented)\nconst a = <i className="h-(--omne-control-height) bg-(color:--omne-hover) text-neutral-100 hover:bg-white border-t-sky-700 bg-red-950/40" style={{ '--omne-b': 0, color: '#0f0' }} />\nnode.style.setProperty('--omne-c', '1'); style.getPropertyValue('--omne-motion-state'); const s = \`var(--omne-\${x})\``,
    )
    expect(reads(script)).toEqual([
      { name: '--omne-control-height', fallback: false },
      { name: '--omne-hover', fallback: false },
      { name: '--omne-motion-state', fallback: false },
    ])
    expect(declarations(script)).toEqual(['--omne-b', '--omne-c'])
    expect(colours(script)).toEqual(['#0f0'])
    expect(paletteClasses(script)).toEqual([
      'text-neutral-100',
      'bg-white',
      'border-t-sky-700',
      'bg-red-950/40',
    ])
    expect(
      paletteClasses(sample('a.html', 'html', '<body class="bg-neutral-950 text-ink-primary">')),
    ).toEqual(['bg-neutral-950'])
  })

  it('counts undefined names everywhere and declarations only outside the kit', () => {
    const kit = sample(
      'packages/frontend/ui-kit/src/a.css',
      'css',
      ':root { --omne-ink: #000; } .k { color: var(--kami-ink); }',
    )
    const member = sample(
      'packages/x/x-ui/src/b.css',
      'css',
      '.m { color: var(--omne-ink); background: var(--omne-gone); --omne-own: 1; border-color: var(--kami-line); }',
    )
    expect(scanTokens([kit, member])).toEqual([
      'packages/frontend/ui-kit/src/a.css | colour #000',
      'packages/x/x-ui/src/b.css | undefined --omne-gone',
      'packages/x/x-ui/src/b.css | reads --kami-line',
      'packages/x/x-ui/src/b.css | declares --omne-own',
    ])
  })
})
