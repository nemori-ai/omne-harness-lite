// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { cssRules } from './css-text.ts'
import { jsxElements, moduleOf, scriptStrings, stringsIn } from './script-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, isKit, isTokens, type ScannedFile } from './scope.ts'

/**
 * FE-I21, one scale: outside tokens.css there is no px length above 1px and no rem length; type size, line height
 * and radius take only a token; an icon takes only the icon scale. Every length a token holds is multiplied by
 * the size step, so a literal anywhere else stays put while the interface around it grows. An em length follows
 * the font size, which already moves with the size step, so it is never counted. The widths in a media query
 * belong to the breakpoint gate and are not counted here. The kit's stylesheets hold no px or rem at all; what
 * R1 left in its scripts (Tailwind arbitrary values, px in strings) and a unitless line height are in the baseline.
 */

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

const LENGTH = /(?<![\w.#$-])(-?\d*\.?\d+)(px|rem)(?![\w-])/g
const EM = /^-?\d*\.?\d+em$/
const TYPE_PROPERTY = /^(?:font-size|line-height|border(?:-[a-z]+)*-radius)$/
const KEYWORD = /^(?:inherit|initial|unset|revert|normal|none|0)$/
const TOKEN = /^var\(--omne-[\w-]+\)$/

/** Names tokens.css declares, its Tailwind theme aliases (`--radius-card`, `--text-sm`) included. */
const TOKEN_NAMES: ReadonlySet<string> = new Set(
  cssRules(FILES.find(file => isTokens(file.path))?.text ?? '').flatMap(rule =>
    rule.declarations.map(found => found.property),
  ),
)
const isToken = (part: string): boolean =>
  TOKEN.test(part) || TOKEN_NAMES.has(/^var\((--[\w-]+)\)$/.exec(part)?.[1] ?? '')

/** Lengths in one value that are off the scale: px above 1, any non-zero rem. */
export function offScaleLengths(value: string): string[] {
  return [...value.matchAll(LENGTH)]
    .filter(match => {
      const size = Math.abs(Number(match[1]))
      return match[2] === 'px' ? size > 1 : size !== 0
    })
    .map(match => match[0])
}

export function cssViolations(file: Source): string[] {
  const found: string[] = []
  for (const rule of cssRules(file.text)) {
    for (const { property, value } of rule.declarations) {
      const lengths = offScaleLengths(value)
      for (const length of lengths) found.push(`css ${property} ${length}`)
      if (lengths.length > 0 || !TYPE_PROPERTY.test(property)) continue
      if (!value.split(/\s+/).every(part => isToken(part) || KEYWORD.test(part) || EM.test(part)))
        found.push(`css ${property}: ${value}`)
    }
  }
  return found
}

const VARIANTS = /^(?:[^:\s]*:)*!?/
const BRACKET_SIZE =
  /^-?(?:text|leading|tracking|rounded(?:-[trblse]{1,2})?|font|h|w|size|min-h|min-w|max-h|max-w)-\[(.+)\]$/
const LEADING = /^leading-(?!(?:ui|wrapped|reading|title|none)$)[\w.-]+$/
const OFF_SCALE =
  /^(?:rounded(?:-[trblse]{1,2})?(?:-(?:2xl|3xl|4xl))?|text-(?:[4-9]xl)|font-(?:thin|extralight|light|extrabold|black))$/
const MEDIA_WIDTH = /\(\s*(?:min-|max-)?width\s*:\s*[\d.]+px\s*\)/g

/** Off-scale values in one string a script writes: Tailwind classes and bare lengths. */
export function stringViolations(text: string): string[] {
  const found: string[] = []
  for (const token of text.replace(MEDIA_WIDTH, ' ').split(/\s+/)) {
    const utility = token.replace(VARIANTS, '').replace(/!$/, '')
    const bracket = BRACKET_SIZE.exec(utility)
    if (bracket !== null) {
      if (/\d/.test(bracket[1]!) && !TOKEN.test(bracket[1]!) && !EM.test(bracket[1]!))
        found.push(`class ${utility}`)
    } else if (LEADING.test(utility) || OFF_SCALE.test(utility)) found.push(`class ${utility}`)
    else {
      // Tailwind writes a space inside an arbitrary value as `_`.
      const lengths = offScaleLengths(token.replace(/_/g, ' '))
      if (lengths.length > 0 && /-\[.*\]$/.test(utility)) found.push(`class ${utility}`)
      else for (const length of lengths) found.push(`script ${length}`)
    }
  }
  return found
}

/** The icon scale: the three steps of rule I5 in Tailwind spacing, or an icon token. */
const ICON_STEPS = new Set(['3.5', '4', '4.5'])
const ICON_TOKEN = /^var\(--omne-icon-(?:compact|label|face|micro)\)$/

/** Icon sizes off the icon scale, on any JSX element whose name ends in `Icon`. */
export function iconViolations(file: Source): string[] {
  const found: string[] = []
  for (const element of jsxElements(moduleOf(file))) {
    if (!/^(?:[A-Z]\w*)?Icon$/.test(element.name)) continue
    const size = element.attributes.get('size')
    if (size !== undefined) {
      const text = file.text.slice(size.start, size.end)
      const strings = stringsIn(size)
      if (!(strings.length === 1 && ICON_TOKEN.test(strings[0]!) && size.type === 'Literal'))
        found.push(`icon size=${text}`)
    }
    const classes = element.attributes.get('className')
    for (const text of classes === undefined ? [] : stringsIn(classes))
      for (const step of text.matchAll(/(?<![\w-])(?:size|h|w)-([\d.]+)(?![\w.])/g))
        if (!ICON_STEPS.has(step[1]!)) found.push(`icon ${step[0]}`)
  }
  return found
}

export function scaleViolations(file: Source): string[] {
  if (isTokens(file.path) || file.kind === 'html') return []
  if (file.kind === 'css') return cssViolations(file)
  return [
    ...scriptStrings(file).flatMap(stringViolations),
    ...(file.kind === 'tsx' ? iconViolations(file) : []),
  ]
}

export const scanScale = (files: readonly ScannedFile[]): string[] =>
  files.flatMap(file => scaleViolations(file).map(violation => `${file.path} | ${violation}`))

describe('scale gate', () => {
  it('keeps px and rem out of the kit stylesheets, where they never go into the baseline', () => {
    const lengths = FILES.filter(
      file => isKit(file.path) && file.kind === 'css' && !isTokens(file.path),
    )
      .flatMap(file => cssViolations(file).map(violation => `${file.path} | ${violation}`))
      .filter(violation => /(?:px|rem)$/.test(violation))
    expect(lengths, 'the kit holds the scale: move the length into tokens.css').toEqual([])
  })

  it('adds no length, type size, line height, radius or icon size outside the tokens', () => {
    const report = ratchet('scale', tally(scanScale(FILES)))
    expect(
      report.missing,
      'baselines/scale.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(report.added, 'new off-scale values: use a token from tokens.css').toEqual([])
    expect(
      report.stale,
      'fixed values: shrink baselines/scale.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('recognises each shape of an off-scale value', () => {
    expect(
      cssViolations({
        path: 'a.css',
        kind: 'css',
        text: '.a { padding: 0 12px; border-bottom: 1px solid; margin: 0.5px; gap: 0.5rem; width: 1.2em; font-size: 13px; line-height: 1.5; border-radius: 0 var(--omne-radius-card); } .b { font-size: var(--omne-text-ui); line-height: var(--omne-leading-wrapped); border-radius: var(--radius-card); border-top-left-radius: 50%; letter-spacing: 0em; font-size: 0.88em; } .em { padding: 0.15em 0.6em; line-height: 1; } @media (min-width: 1024px) { .c { inset: 0; } }',
      }),
    ).toEqual([
      'css padding 12px',
      'css gap 0.5rem',
      'css font-size 13px',
      'css line-height: 1.5',
      'css border-top-left-radius: 50%',
      'css line-height: 1',
    ])
    expect(
      stringViolations(
        'text-[12px] hover:leading-[1.55] font-[550] h-[26px] h-[var(--radix-x)] text-[CanvasText] rounded rounded-chip leading-relaxed leading-wrapped size-4.5 text-sm ml-[5px] translate-y-[calc(-50%_-_2px)] text-[0.9em] 0 4px 1px',
      ),
    ).toEqual([
      'class text-[12px]',
      'class leading-[1.55]',
      'class font-[550]',
      'class h-[26px]',
      'class rounded',
      'class leading-relaxed',
      'class ml-[5px]',
      'class translate-y-[calc(-50%_-_2px)]',
      'script 4px',
    ])
    expect(stringViolations('(max-width: 767px)')).toEqual([])
    expect(
      iconViolations({
        path: 'a.tsx',
        kind: 'tsx',
        text: 'const a = <><CloseIcon className="size-3" /><AddIcon className="size-3.5 shrink-0" /><CloseIcon size={12} /><AddIcon size="var(--omne-icon-label)" /><SearchIcon className="h-5 w-5" /><SearchIcon className="size-4" /><IconButton size="icon" /></>',
      }),
    ).toEqual(['icon size-3', 'icon size={12}', 'icon h-5', 'icon w-5'])
  })
})
