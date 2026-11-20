// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Window } from 'happy-dom'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ICONS, MOTIONS, type Icon } from '@omne-harness/ui-kit'

import {
  callsNamed,
  importSources,
  jsxElements,
  stringArgument,
  stripCssComments,
  scriptTree,
} from './css-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, KIT, REPOSITORY, isKit, isTokens, type ScannedFile } from './scope.ts'

/**
 * FE-I26: the interface draws only the kit's icon set. Outside the kit nothing imports an icon library or writes
 * an `<svg>` of its own; every glyph of the set sits on the 24 grid inside the live area, paints only in
 * `currentColor` and has at most the strokes the visual standard allows (rules I1 to I4); a glyph moves only by
 * transitions on motion tokens, and not at all under reduced motion (I8). The standard has no table of glyph
 * amplitudes, so the amplitudes tokens.css declares are not compared with anything here.
 */

const RULES = join(
  REPOSITORY,
  '.meta_harness/agents/skills/visual-standard/canonical/references/rules-index.md',
)
const ICON_DIRECTORY = join(KIT, 'src', 'icons')
const ICON_MODULE = join(ICON_DIRECTORY, 'index.ts')
const ICON_SHEET = join(KIT, 'src', 'styles', 'icons.css')
const ICON_LIBRARY =
  /^(?:lucide-react|lucide|@radix-ui\/react-icons|@heroicons\/|react-icons|@tabler\/icons|@phosphor-icons\/|react-feather|@mui\/icons-material|@fortawesome\/|@iconify\/)/
const NUMERALS: Readonly<Record<string, number>> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 }

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

const document = new Window().document

/** The stroke limit (I2) and the live area (I4) as the visual standard writes them. */
export function iconRule(rules: string): {
  readonly maxStrokes: number
  readonly live: readonly [number, number]
} {
  const strokes = /\| I2 \|[^\n]*?最多(.)笔/.exec(rules)?.[1]
  const live = /\| I4 \|[^\n]*?有效区 (\d+) 到 (\d+)/.exec(rules)
  if (strokes === undefined || NUMERALS[strokes] === undefined || live === null)
    throw new Error('rules-index.md I2 and I4 name the stroke limit and the live area.')
  return { maxStrokes: NUMERALS[strokes], live: [Number(live[1]), Number(live[2])] }
}

/** Icon libraries a file imports, and `<svg>` elements it draws itself outside the kit. */
export function drawingViolations(file: Source): string[] {
  if (file.kind === 'css' || file.kind === 'html') return []
  const tree = scriptTree(file)
  const found = importSources(tree)
    .filter(source => ICON_LIBRARY.test(source))
    .map(source => `imports ${source}`)
  if (isKit(file.path)) return found
  const elements = jsxElements(tree).filter(element => element.name === 'svg').length
  const created = [...callsNamed(tree, 'createElement'), ...callsNamed(tree, 'h')].filter(
    call => stringArgument(call) === 'svg',
  ).length
  for (let index = 0; index < elements + created; index += 1) found.push('draws <svg>')
  return found
}

/** The extremes of the ink a path draws, round ends included; commands are the brush's M, Q, L, A and Z. */
export function inkBounds(d: string): readonly [number, number, number, number] {
  const tokens = d.match(/[MQLAZ]|-?\d*\.?\d+/g) ?? []
  const xs: number[] = []
  const ys: number[] = []
  let pen: readonly [number, number] = [0, 0]
  for (let i = 0; i < tokens.length;) {
    const command = tokens[i++]!
    if (command === 'Z') continue
    const count = command === 'A' ? 7 : command === 'Q' ? 4 : 2
    const values = tokens.slice(i, i + count).map(Number)
    i += count
    const end = [values[count - 2]!, values[count - 1]!] as const
    if (command === 'A') {
      const radius = values[0]!
      const centre = [(pen[0] + end[0]) / 2, (pen[1] + end[1]) / 2] as const
      xs.push(centre[0] - radius, centre[0] + radius)
      ys.push(centre[1] - radius, centre[1] + radius)
    } else {
      for (let j = 0; j < count; j += 2) {
        xs.push(values[j]!)
        ys.push(values[j + 1]!)
      }
    }
    pen = end
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function parsed(markup: string): Element | null {
  const host = document.createElement('div')
  host.innerHTML = markup
  return host.firstElementChild as unknown as Element | null
}

/** Everything one rendered glyph does against I2 to I4 and the known movements. */
export function glyphViolations(
  name: string,
  svg: Element | null,
  maxStrokes: number,
  live: readonly [number, number],
): string[] {
  if (svg === null || svg.tagName.toLowerCase() !== 'svg') return [`${name}: renders no svg`]
  const found: string[] = []
  if (svg.getAttribute('viewBox') !== '0 0 24 24')
    found.push(`${name}: viewBox ${svg.getAttribute('viewBox')}`)
  if (svg.getAttribute('fill') !== 'currentColor')
    found.push(`${name}: root fill ${svg.getAttribute('fill')}`)
  const ink = [...svg.querySelectorAll('path')].filter(path => path.closest('mask') === null)
  if (ink.length === 0 || ink.length > maxStrokes) found.push(`${name}: ${ink.length} strokes`)
  for (const path of ink) {
    for (const attribute of ['fill', 'stroke', 'stroke-width', 'style', 'filter'])
      if (path.hasAttribute(attribute)) found.push(`${name}: ink path sets ${attribute}`)
    const bounds = inkBounds(path.getAttribute('d') ?? '')
    if (bounds.some(edge => edge < live[0] || edge > live[1]))
      found.push(
        `${name}: ink reaches ${bounds.map(edge => edge.toFixed(1)).join(' ')}, outside ${live[0]} to ${live[1]}`,
      )
  }
  for (const element of svg.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase()
    if (!['path', 'g', 'mask'].includes(tag)) found.push(`${name}: draws a ${tag}`)
    const inMask = element.closest('mask') !== null
    for (const attribute of ['fill', 'stroke']) {
      const paint = element.getAttribute(attribute)
      if (
        paint !== null &&
        !(paint === 'none' || paint === 'currentColor' || (inMask && paint === 'white'))
      )
        found.push(`${name}: paints ${attribute}=${paint}`)
    }
    const motion = element.getAttribute('data-icon-motion')
    if (motion !== null && !(MOTIONS as readonly string[]).includes(motion))
      found.push(`${name}: unknown movement ${motion}`)
  }
  return found
}

const rendered = (icon: Icon): Element | null => parsed(renderToStaticMarkup(createElement(icon)))

interface SheetRule {
  readonly selector: string
  readonly body: string
  readonly guarded: boolean
}

/** The icon sheet's rules, each marked when it sits inside a `prefers-reduced-motion: no-preference` query. */
export function sheetRules(css: string): SheetRule[] {
  const text = stripCssComments(css)
  const rules: SheetRule[] = []
  const walkBlock = (block: string, guarded: boolean): void => {
    let index = 0
    while (index < block.length) {
      const open = block.indexOf('{', index)
      if (open === -1) return
      const prelude = block.slice(index, open).trim()
      let depth = 1
      let close = open + 1
      for (; close < block.length && depth > 0; close += 1)
        depth += block[close] === '{' ? 1 : block[close] === '}' ? -1 : 0
      const body = block.slice(open + 1, close - 1)
      if (prelude.startsWith('@media'))
        walkBlock(body, guarded || /\(prefers-reduced-motion:\s*no-preference\)/.test(prelude))
      else rules.push({ selector: prelude.replace(/\s+/g, ' '), body, guarded })
      index = close
    }
  }
  walkBlock(text, false)
  return rules
}

/** How the icon sheet moves a glyph other than by a transition on motion tokens, or poses it unguarded. */
export function sheetViolations(css: string): string[] {
  const found: string[] = []
  for (const { selector, body, guarded } of sheetRules(css)) {
    if (/:hover|:focus-visible/.test(selector) && !guarded)
      found.push(`pose outside the reduced-motion guard: ${selector}`)
    for (const [, property, value] of body.matchAll(
      /(?:^|;)\s*(transition[\w-]*)\s*:\s*([^;]+)/g,
    )) {
      for (const duration of value!.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/g))
        if (Number(duration[1]) !== 0) found.push(`${property}: raw duration ${duration[0]}`)
      for (const curve of value!.matchAll(
        /cubic-bezier\([^)]*\)|steps\([^)]*\)|(?<![\w-])(?:ease-in-out|ease-in|ease-out|ease|linear)(?![\w(-])/g,
      ))
        found.push(`${property}: raw curve ${curve[0]}`)
      for (const variable of value!.matchAll(/var\((--[\w-]+)/g))
        if (!variable[1]!.startsWith('--omne-motion-'))
          found.push(`${property}: ${variable[1]} is not a motion token`)
      if (property === 'transition' || property === 'transition-property') {
        for (const part of value!.split(',')) {
          const moved = part.trim().split(/\s+/)[0]!
          if (!['transform', 'opacity', 'stroke-dashoffset', 'none'].includes(moved))
            found.push(`${property}: moves ${moved}`)
        }
      }
    }
    if (/(?:^|;)\s*animation[\w-]*\s*:/.test(body)) found.push(`keyframe animation on ${selector}`)
  }
  return found
}

/** Custom properties the icon sheet reads that neither it nor tokens.css declares. */
export function undeclaredProperties(css: string, tokens: string): string[] {
  const declared = new Set(
    [...`${stripCssComments(css)}\n${stripCssComments(tokens)}`.matchAll(/(--[\w-]+)\s*:/g)].map(
      match => match[1]!,
    ),
  )
  return [
    ...new Set([...stripCssComments(css).matchAll(/var\((--[\w-]+)/g)].map(match => match[1]!)),
  ].filter(property => !declared.has(property))
}

export function scanIcons(files: readonly ScannedFile[]): string[] {
  const { maxStrokes, live } = iconRule(readFileSync(RULES, 'utf8'))
  const glyphs = Object.entries(ICONS).flatMap(([name, icon]) =>
    glyphViolations(name, rendered(icon), maxStrokes, live).map(found => `glyph ${found}`),
  )
  return [
    ...files.flatMap(file => drawingViolations(file).map(found => `${file.path} | ${found}`)),
    ...glyphs.map(found => `${ICON_MODULE} | ${found}`),
  ]
}

const fileAt = (path: string): ScannedFile => {
  const file = FILES.find(source => source.path === path)
  if (file === undefined) throw new Error(`${path} is not among the scanned files.`)
  return file
}

describe('icon gate', () => {
  it('draws only the set: no icon library, no hand-written svg outside the kit, every glyph on the rule', () => {
    expect(Object.keys(ICONS).length).toBeGreaterThan(10)
    const report = ratchet('icons', tally(scanIcons(FILES)))
    expect(
      report.missing,
      'baselines/icons.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(
      report.added,
      'new icons outside the set, or glyphs off the rule: draw it in the kit icon set',
    ).toEqual([])
    expect(report.stale, 'fixed: shrink baselines/icons.json with DESIGN_GATES_SHRINK=1').toEqual(
      [],
    )
  })

  it('moves glyphs only by transitions on motion tokens, with no pose under reduced motion', () => {
    const sheet = fileAt(ICON_SHEET).text
    const tokens = FILES.find(file => isTokens(file.path))?.text ?? ''
    expect(
      sheetRules(sheet).some(rule => rule.guarded),
      'icons.css has its reduced-motion guard',
    ).toBe(true)
    expect(sheetViolations(sheet)).toEqual([])
    expect(
      undeclaredProperties(sheet, tokens),
      'custom properties icons.css reads but nothing declares',
    ).toEqual([])
    for (const motion of MOTIONS)
      expect(sheet.includes(`[data-icon-motion='${motion}']`), `icons.css defines ${motion}`).toBe(
        true,
      )
    const timed = FILES.filter(
      file => file.path.startsWith(`${ICON_DIRECTORY}/`) && file.kind !== 'css',
    )
      .filter(file => /\b(?:transition|animation)\w*\s*:/.test(file.text))
      .map(file => file.path)
    expect(timed, 'timing written in the icon module').toEqual([])
  })

  it('recognises each way an icon, a glyph or its motion breaks the rule', () => {
    expect(
      iconRule(
        '| I2 | 最多三笔（一个点也算一笔） | — |\n| I4 | 24 格的画布，有效区 2 到 22，墨 | — |',
      ),
    ).toEqual({
      maxStrokes: 3,
      live: [2, 22],
    })
    expect(
      drawingViolations({
        path: 'packages/x/x-ui/src/a.tsx',
        kind: 'tsx',
        text: "import { Check } from 'lucide-react'\nimport { CloseIcon } from '@omne-harness/ui-kit'\n// <svg> in a comment\nconst a = <svg viewBox=\"0 0 24 24\"><path d=\"M1 1\" /></svg>\nconst b = createElement('svg', {})\nconst c = <CloseIcon />",
      }),
    ).toEqual(['imports lucide-react', 'draws <svg>', 'draws <svg>'])
    expect(
      drawingViolations({
        path: `${KIT}/src/charts/a.tsx`,
        kind: 'tsx',
        text: 'const a = <svg viewBox="0 0 10 10" />',
      }),
    ).toEqual([])
    expect(
      glyphViolations(
        'a',
        parsed(
          '<svg viewBox="0 0 20 20" fill="none"><path d="M12 12" stroke="#000" stroke-width="2"/><circle r="1"/><g data-icon-motion="spin"><path d="M1 1"/><path d="M 3 12 L 21 12 A 1.5 1.5 0 0 0 21 13 Z"/><path d="M3 3"/></g></svg>',
        ),
        3,
        [2, 22],
      ),
    ).toEqual([
      'a: viewBox 0 0 20 20',
      'a: root fill none',
      'a: 4 strokes',
      'a: ink path sets stroke',
      'a: ink path sets stroke-width',
      'a: ink reaches 1.0 1.0 1.0 1.0, outside 2 to 22',
      'a: ink reaches 3.0 11.0 22.5 14.0, outside 2 to 22',
      'a: paints stroke=#000',
      'a: draws a circle',
      'a: unknown movement spin',
    ])
    expect(
      sheetViolations(
        [
          '.omne-icon [data-icon-motion] { transition: transform 200ms ease-out, width var(--omne-motion-layout) var(--omne-glyph-ease); }',
          'a:hover > .omne-icon [data-icon-motion] { transform: rotate(9deg); }',
          '@media (prefers-reduced-motion: no-preference) { a:hover > .omne-icon [data-icon-motion] { animation: wiggle var(--omne-motion-layout); } }',
        ].join('\n'),
      ),
    ).toEqual([
      'transition: raw duration 200ms',
      'transition: raw curve ease-out',
      'transition: --omne-glyph-ease is not a motion token',
      'transition: moves width',
      'pose outside the reduced-motion guard: a:hover > .omne-icon [data-icon-motion]',
      'keyframe animation on a:hover > .omne-icon [data-icon-motion]',
    ])
    expect(
      undeclaredProperties(
        '.a { --x: 1; transform: translate(var(--x), var(--omne-glyph-dirft)); opacity: var(--omne-k); }',
        ':root { --omne-k: 1; }',
      ),
    ).toEqual(['--omne-glyph-dirft'])
  })
})
