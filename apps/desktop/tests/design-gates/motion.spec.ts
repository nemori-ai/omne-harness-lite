// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  type AstNode,
  callsNamed,
  child,
  children,
  cssRules,
  initialiserOf,
  normalise,
  objectProperties,
  scriptStrings,
  scriptTree,
  stringsIn,
  stripCssComments,
} from './css-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, REPOSITORY, TOKENS, isTokens, type ScannedFile } from './scope.ts'

/**
 * FE-I22, one clock: every duration and easing in a transition, an animation, a style object or the options of
 * the Web Animations API is a motion token. The motion tokens tokens.css declares are, row for row, the clock
 * table of the visual standard (references/timing.md, section 1), and the keyframes the scanned stylesheets
 * declare are exactly the ones that section publishes. Durations of zero and `none` are not motion.
 */

const TIMING = join(
  REPOSITORY,
  '.meta_harness/agents/skills/visual-standard/canonical/references/timing.md',
)
const CLOCK_SECTION = '## 1. 界面的一只钟'
const KEYFRAME_TABLE = '公布的关键帧'

/**
 * Names under the motion prefix that are not a duration or a curve. The arrival's travel is a distance: it is
 * declared once per size step and the scale gate owns lengths, so the clock table does not list it.
 */
const DISTANCES: Readonly<Record<string, string>> = {
  '--omne-motion-travel': 'the distance an arrival rises, a length per size step',
}

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

/** The text of the clock section, from its heading to the next second-level heading. */
export function clockSection(markdown: string): string {
  const start = markdown.indexOf(`${CLOCK_SECTION}\n`)
  if (start === -1) throw new Error(`timing.md has no "${CLOCK_SECTION}" section.`)
  const end = markdown.indexOf('\n## ', start + CLOCK_SECTION.length)
  return markdown.slice(start, end === -1 ? undefined : end)
}

/** The clock table's rows as `[token, value]`, in the table's order. */
export function tabulatedTokens(section: string): (readonly [string, string])[] {
  return [...section.matchAll(/^\| `(--omne-motion-[\w-]+)` \| ([^|]+?) \|/gm)].map(
    match => [match[1]!, normalise(match[2]!)] as const,
  )
}

/** Every backticked name in the first cell of the published keyframes table. */
export function publishedKeyframes(section: string): string[] {
  const start = section.indexOf(KEYFRAME_TABLE)
  if (start === -1) throw new Error(`timing.md section 1 has no "${KEYFRAME_TABLE}" table.`)
  const rows = section
    .slice(start)
    .split('\n')
    .slice(1)
    .filter(line => line.startsWith('|'))
  return rows
    .flatMap(row => [...(row.split('|')[1] ?? '').matchAll(/`([\w-]+)`/g)].map(match => match[1]!))
    .sort()
}

/** The `--omne-motion-*` declarations of tokens.css as `[token, value]`, distances aside, first declaration each. */
export function declaredTokens(tokens: string): (readonly [string, string])[] {
  const found = new Map<string, string>()
  for (const rule of cssRules(tokens))
    for (const { property, value } of rule.declarations)
      if (property.startsWith('--omne-motion-') && !(property in DISTANCES) && !found.has(property))
        found.set(property, normalise(value))
  return [...found]
}

const MARKDOWN = readFileSync(TIMING, 'utf8')
const SECTION = clockSection(MARKDOWN)
const MOTION_TOKENS: ReadonlySet<string> = new Set(tabulatedTokens(SECTION).map(([name]) => name))

const DURATION = /(?<![\w.#-])(\d*\.?\d+)(ms|s)(?![\w-])/g
const EASING =
  /cubic-bezier\([^)]*\)|steps\([^)]*\)|linear\([^)]*\)|(?<![\w-])(?:ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)(?![\w(-])/g
const VARIABLE = /var\((--[\w-]+)/g

/** Every non-token duration, easing or variable inside one motion value. */
export function motionLiterals(
  value: string,
  tokens: ReadonlySet<string> = MOTION_TOKENS,
): string[] {
  const found: string[] = []
  for (const match of value.matchAll(DURATION)) if (Number(match[1]) !== 0) found.push(match[0])
  for (const match of value.matchAll(EASING)) found.push(normalise(match[0]))
  for (const match of value.matchAll(VARIABLE))
    if (!tokens.has(match[1]!)) found.push(`var(${match[1]})`)
  return found
}

const MOTION_PROPERTY = /^(?:transition|animation)(?:-(?:duration|timing-function|delay))?$/

/** The Tailwind theme as the kit declares it: `--animate-*`, `--ease-*` and the default transition timing. */
export interface Theme {
  readonly animations: ReadonlyMap<string, string>
  readonly eases: ReadonlySet<string>
  readonly defaultDuration: boolean
  readonly defaultEase: boolean
}

export function readTheme(stylesheets: readonly Source[]): Theme {
  const animations = new Map<string, string>()
  const eases = new Set<string>()
  let defaultDuration = false
  let defaultEase = false
  for (const sheet of stylesheets) {
    for (const rule of cssRules(sheet.text)) {
      for (const { property, value } of rule.declarations) {
        const clean = motionLiterals(value).length === 0
        if (property.startsWith('--animate-'))
          animations.set(property.slice('--animate-'.length), value)
        if (property.startsWith('--ease-') && clean) eases.add(property.slice(2))
        if (property === '--default-transition-duration') defaultDuration = clean
        if (property === '--default-transition-timing-function') defaultEase = clean
      }
    }
  }
  return { animations, eases, defaultDuration, defaultEase }
}

export function cssViolations(file: Source): string[] {
  const found: string[] = []
  const tokenSheet = isTokens(file.path)
  for (const rule of cssRules(file.text)) {
    for (const { property, value } of rule.declarations) {
      if (MOTION_PROPERTY.test(property)) {
        for (const literal of motionLiterals(value)) found.push(`css ${property}: ${literal}`)
      } else if (property.startsWith('--') && !(tokenSheet && MOTION_TOKENS.has(property))) {
        // A custom property that carries timing feeds a transition somewhere else.
        const timing = [...value.matchAll(DURATION)]
          .filter(match => Number(match[1]) !== 0)
          .map(match => match[0])
        const curves = [...value.matchAll(/cubic-bezier\([^)]*\)|steps\([^)]*\)/g)].map(match =>
          normalise(match[0]),
        )
        for (const literal of [...timing, ...curves])
          found.push(`custom-property ${property}: ${literal}`)
      }
    }
  }
  return found
}

const VARIANT = /^(?:[\w-]+(?:-\[[^\]]*\])?:|\[[^\]]*\]:|[\w-]+\/[\w-]+:)*/
const TOKEN_UTILITY =
  /^(?:duration|ease)-(?:\(--omne-motion-[\w-]+\)|\[var\(--omne-motion-[\w-]+\)\])$/
const TAILWIND_BUILTIN_ANIMATIONS = new Set(['spin', 'ping', 'pulse', 'bounce'])

/** Off-token motion utilities in one string of class names. */
export function classViolations(classList: string, theme: Theme): string[] {
  const utilities = classList
    .split(/\s+/)
    .map(token => token.replace(VARIANT, '').replace(/^!|!$/g, ''))
    .filter(Boolean)
  if (!utilities.some(utility => /^(?:transition|duration-|ease-|animate-)/.test(utility)))
    return []
  const isTokenEase = (utility: string): boolean =>
    TOKEN_UTILITY.test(utility) || theme.eases.has(utility)
  const tokenDuration = utilities.some(
    utility => utility.startsWith('duration-') && TOKEN_UTILITY.test(utility),
  )
  const tokenEase = utilities.some(utility => utility.startsWith('ease-') && isTokenEase(utility))
  const found: string[] = []
  for (const utility of utilities) {
    if (utility.startsWith('duration-') && !TOKEN_UTILITY.test(utility) && utility !== 'duration-0')
      found.push(`tw ${utility}`)
    else if (utility.startsWith('ease-') && !isTokenEase(utility)) found.push(`tw ${utility}`)
    else if (
      /^transition(?:-(?:all|colors|opacity|shadow|transform|discrete|\[[^\]]+\]|\([^)]+\)))?$/.test(
        utility,
      )
    ) {
      const missing = [
        !(tokenDuration || theme.defaultDuration) && 'default duration',
        !(tokenEase || theme.defaultEase) && 'default ease',
      ].filter(Boolean)
      if (missing.length > 0) found.push(`tw ${utility} (${missing.join(', ')})`)
    } else if (/^animate-(?:in|out)$/.test(utility)) {
      if (!tokenDuration || !tokenEase) found.push(`tw ${utility} (vendor default timing)`)
    } else if (/^animate-[\w-]+$/.test(utility) && utility !== 'animate-none') {
      const name = utility.slice('animate-'.length)
      const definition = theme.animations.get(name)
      if (definition === undefined || TAILWIND_BUILTIN_ANIMATIONS.has(name))
        found.push(`tw ${utility} (built-in timing)`)
      else if (motionLiterals(definition).length > 0)
        found.push(`tw ${utility} (${motionLiterals(definition).join(' ')})`)
    }
  }
  return found
}

const INLINE = /^(?:transition|animation)(?:Duration|TimingFunction|Delay)?$/
const ANIMATION_OPTIONS = /^(?:duration|easing|delay|endDelay)$/

/** An identifier stands for the initialiser of the variable it names in the same file. */
const resolved = (tree: AstNode, node: AstNode): AstNode =>
  node.type === 'Identifier' ? (initialiserOf(tree, node['name'] as string) ?? node) : node

/** A number written as the value or as the fallback after `||` or `??`. */
function numericFallback(node: AstNode): number | undefined {
  if (node.type === 'Literal' && typeof node['value'] === 'number') return node['value']
  if (node.type === 'LogicalExpression') {
    const right = child(node, 'right')
    return right === undefined ? undefined : numericFallback(right)
  }
  return undefined
}

/** Off-token motion in one script: class strings, style objects and Web Animations options. */
export function scriptViolations(file: Source, theme: Theme): string[] {
  const tree = scriptTree(file)
  const found: string[] = []
  for (const text of scriptStrings(file)) found.push(...classViolations(text, theme))
  for (const { name, value } of objectProperties(tree)) {
    if (!INLINE.test(name)) continue
    for (const text of stringsIn(value)) {
      for (const literal of motionLiterals(text)) found.push(`inline ${name}: ${literal}`)
      if (/\$\{…\}m?s\b/.test(text)) found.push(`inline ${name}: computed duration`)
    }
  }
  for (const call of callsNamed(tree, 'animate')) {
    const argument = children(call, 'arguments')[1]
    if (argument === undefined) continue
    const options = resolved(tree, argument)
    if (options.type !== 'ObjectExpression') continue
    for (const property of children(options, 'properties')) {
      const key = child(property, 'key')
      const name = key?.type === 'Identifier' ? (key['name'] as string) : undefined
      const value = child(property, 'value')
      if (name === undefined || value === undefined || !ANIMATION_OPTIONS.test(name)) continue
      const expression = resolved(tree, value)
      for (const text of stringsIn(expression))
        for (const literal of motionLiterals(text)) found.push(`waapi ${name}: ${literal}`)
      const number = name === 'easing' ? undefined : numericFallback(expression)
      if (number !== undefined && number !== 0) found.push(`waapi ${name}: ${number}`)
    }
  }
  return found
}

export function scanMotion(files: readonly ScannedFile[]): string[] {
  const theme = readTheme(files.filter(file => file.kind === 'css'))
  return files.flatMap(file => {
    const found =
      file.kind === 'css'
        ? cssViolations(file)
        : file.kind === 'html'
          ? []
          : scriptViolations(file, theme)
    return found.map(violation => `${file.path} | ${violation}`)
  })
}

/** Keyframe names each scanned stylesheet declares, with the file that declares each. */
export function declaredKeyframes(files: readonly Source[]): Map<string, string> {
  const declared = new Map<string, string>()
  for (const file of files.filter(source => source.kind === 'css'))
    for (const match of stripCssComments(file.text).matchAll(/@keyframes\s+([\w-]+)/g))
      declared.set(match[1]!, file.path)
  return declared
}

const tokenSheet = (): string => {
  const sheet = FILES.find(file => isTokens(file.path))
  if (sheet === undefined) throw new Error(`${TOKENS} is not among the scanned files.`)
  return sheet.text
}

describe('motion gate', () => {
  it('adds no duration or easing outside the motion tokens', () => {
    const report = ratchet('motion', tally(scanMotion(FILES)))
    expect(
      report.missing,
      'baselines/motion.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(report.added, 'new motion values outside the tokens').toEqual([])
    expect(
      report.stale,
      'fixed violations: shrink baselines/motion.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('declares in tokens.css, row for row, the motion tokens the clock table of the visual standard lists', () => {
    const table = tabulatedTokens(SECTION)
    expect(table.length).toBeGreaterThan(10)
    expect(declaredTokens(tokenSheet())).toEqual(table)
    for (const name of Object.keys(DISTANCES))
      expect(tokenSheet().includes(`${name}:`), `${name} is gone: delete it from DISTANCES`).toBe(
        true,
      )
  })

  it('declares exactly the keyframes the visual standard publishes', () => {
    const declared = declaredKeyframes(FILES)
    const published = publishedKeyframes(SECTION)
    expect(published.length).toBeGreaterThan(0)
    expect(
      [...declared.keys()].sort(),
      [...declared].map(([name, file]) => `${name} (${file})`).join(', '),
    ).toEqual(published)
  })

  it('recognises each shape of off-token motion', () => {
    const css: Source = {
      path: 'a.css',
      kind: 'css',
      text: '.a { transition: color 150ms ease-out, opacity var(--omne-motion-feedback) var(--omne-motion-ease); animation: spin 1.2s linear infinite; transition-duration: 0ms; transition-delay: 0s; animation-delay: calc(var(--omne-motion-activity) * -1); --x: var(--omne-motion-state); --slide: 200ms cubic-bezier(0.2, 0, 0, 1); transition-property: opacity; } .b { animation: none; transition: transform var(--omne-sidebar-width); }',
    }
    expect(cssViolations(css)).toEqual([
      'css transition: 150ms',
      'css transition: ease-out',
      'css animation: 1.2s',
      'css animation: linear',
      'custom-property --slide: 200ms',
      'custom-property --slide: cubic-bezier(0.2,0,0,1)',
      'css transition: var(--omne-sidebar-width)',
    ])
    const theme: Theme = {
      animations: new Map([
        ['fade-up', 'omne-fade-up 320ms ease-out both'],
        ['arrive', 'omne-fade-up var(--omne-motion-enter) var(--omne-motion-ease-enter) both'],
      ]),
      eases: new Set(['ease-enter']),
      defaultDuration: false,
      defaultEase: true,
    }
    const script: Source = {
      path: 'a.tsx',
      kind: 'tsx',
      text: [
        '// transition: 999ms in a comment',
        'const a = <div className="hover:bg-hover transition-colors duration-150 ease-out" />',
        'const b = <i className="animate-fade-up animate-arrive animate-spin motion-reduce:animate-none" />',
        'const c = <b className="transition-opacity duration-(--omne-motion-feedback) ease-enter" />',
        "const d = <p style={{ transition: 'opacity 200ms ease', transitionDuration: open ? 'var(--omne-motion-layout)' : `${ms}ms` }} />",
        "const easing = style.getPropertyValue('--omne-motion-ease-enter') || 'cubic-bezier(.16, 1, .3, 1)'",
        "const duration = Number.parseFloat(token) * (token.endsWith('ms') ? 1 : 1000) || 240",
        'node.animate(frames, { duration, easing })',
        "node.animate(frames, { duration: 0, easing: 'var(--omne-motion-ease)', delay: read(cue.fallback) })",
      ].join('\n'),
    }
    expect(scriptViolations(script, theme)).toEqual([
      'tw transition-colors (default duration)',
      'tw duration-150',
      'tw ease-out',
      'tw animate-fade-up (320ms ease-out)',
      'tw animate-spin (built-in timing)',
      'inline transition: 200ms',
      'inline transition: ease',
      'inline transitionDuration: computed duration',
      'waapi duration: 240',
      'waapi easing: cubic-bezier(.16,1,.3,1)',
    ])
  })

  it('reads the clock table and the published keyframes the way the visual standard writes them', () => {
    const section = clockSection(
      [
        '# 时长',
        CLOCK_SECTION,
        '| token | 值 | 用在哪 |',
        '| --- | --- | --- |',
        '| `--omne-motion-feedback` | 120ms | 悬停 |',
        '| `--omne-motion-ease` | cubic-bezier(0.2, 0.8, 0.2, 1) | 状态 |',
        '',
        '公布的关键帧只有这几个（M12）：',
        '',
        '| 关键帧 | 用在哪 |',
        '| --- | --- |',
        '| `omne-fade-up` | 到达 |',
        '| `omne-presence-enter`、`omne-presence-exit` | 浮层 |',
        '',
        '## 2. 形',
        '| `--omne-motion-later` | 1s | 不在这一节 |',
      ].join('\n'),
    )
    expect(tabulatedTokens(section)).toEqual([
      ['--omne-motion-feedback', '120ms'],
      ['--omne-motion-ease', 'cubic-bezier(0.2,0.8,0.2,1)'],
    ])
    expect(publishedKeyframes(section)).toEqual([
      'omne-fade-up',
      'omne-presence-enter',
      'omne-presence-exit',
    ])
    expect(
      declaredTokens(
        ':root { --omne-motion-feedback: 120ms; --omne-motion-travel: 4px; } :root[data-size="large"] { --omne-motion-feedback: 9ms; }',
      ),
    ).toEqual([['--omne-motion-feedback', '120ms']])
  })
})
