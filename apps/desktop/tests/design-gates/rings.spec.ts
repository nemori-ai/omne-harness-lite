// @module-tag source-text
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  type CssRule,
  cssRules,
  jsxElements,
  normalise,
  objectProperties,
  scriptStrings,
  scriptTree,
  stringsIn,
  valueOf,
} from './css-text.ts'
import { ratchet, tally } from './ratchet.ts'
import { FILES, KIT, isTokens, type ScannedFile } from './scope.ts'

/**
 * FE-I24, the ring room: a focus ring and every mark a control draws outside itself stay whole. The room is the
 * ring width plus the ring offset, registered as one length. A container clips only in the ways the visual
 * standard names (K1): a clip kept for motion leaves the room as its clip margin, a scroll container takes the
 * room as its scroll padding, and the workspace edge alone clips exactly at its edge. `overflow: hidden` cannot
 * leave a margin, so a hidden container counts unless it only hides an element visually or truncates its text.
 */

/**
 * The one clip the rule keeps on its edge (K1, M7): the workspace. A margin there widens what the document
 * scrolls, and a scrollbar flashes while the sidebar folds. The page's own margins leave the room inside it.
 */
const EXACT_EDGES = new Set(['apps/desktop/src/page/styles.css .shell-workspace'])
const DISCLOSURE = join(KIT, 'src', 'patterns', 'disclosure.tsx')
const MOTION_SHEET = join(KIT, 'src', 'styles', 'motion.css')
const BASE_SHEET = join(KIT, 'src', 'styles', 'base.css')
const ROOM_VALUE = 'var(--omne-ring-room)'

type Source = Pick<ScannedFile, 'path' | 'kind' | 'text'>

interface Ring {
  readonly width: number
  readonly offset: number
}

/** The ring width and offset tokens.css declares first, the standard size step, in px. */
export function ringOf(tokens: string): Ring {
  const first = (name: string): number => {
    for (const rule of cssRules(tokens)) {
      const value = valueOf(rule, name)
      const px = value === undefined ? null : /^(\d*\.?\d+)px$/.exec(value)
      if (px !== null && px !== undefined) return Number(px[1])
    }
    throw new Error(`tokens.css declares no ${name} in px.`)
  }
  return { width: first('--omne-ring-width'), offset: first('--omne-ring-offset') }
}

function px(value: string, ring: Ring): number | undefined {
  const literal = /^(-?\d*\.?\d+)px$/.exec(value)
  if (literal !== null) return Number(literal[1])
  if (value === '0') return 0
  const lengths: Readonly<Record<string, number>> = {
    '--omne-ring-width': ring.width,
    '--omne-ring-offset': ring.offset,
  }
  const token = /^var\((--omne-ring-(?:width|offset))\)$/.exec(value)
  if (token !== null) return lengths[token[1]!]
  const negated = /^calc\(-1 \* var\((--omne-ring-(?:width|offset))\)\)$/.exec(value)
  return negated === null ? undefined : -lengths[negated[1]!]!
}

/** How far past its border box a rule's outline or ring-like shadow reaches, in px. */
export function reach(rule: CssRule, ring: Ring): number {
  const outline = valueOf(rule, 'outline')
  const width =
    px(valueOf(rule, 'outline-width') ?? /^\S+/.exec(outline ?? '')?.[0] ?? '', ring) ?? ring.width
  const offset = valueOf(rule, 'outline-offset')
  const reaches: number[] = []
  if (offset !== undefined || (outline !== undefined && !/^(?:none|0)\b/.test(outline)))
    reaches.push(width + (px(offset ?? '0', ring) ?? 0))
  for (const shadow of (valueOf(rule, 'box-shadow') ?? '').split(/,(?![^(]*\))/)) {
    if (/\binset\b/.test(shadow)) continue
    const [x = 0, y = 0, blur = 0, spread = 0] = shadow
      .replace(/[a-z-]+\([^)]*\)/gi, ' ')
      .trim()
      .split(/\s+/)
      .filter(token => /^-?\d*\.?\d+(?:px)?$/.test(token))
      .map(Number.parseFloat)
    if (blur === 0) reaches.push(spread + Math.max(Math.abs(x), Math.abs(y)))
  }
  return Math.max(0, ...reaches)
}

const OVERFLOW = /^overflow(?:-[xy]|-inline|-block)?$/
const VISUALLY_HIDDEN = (rule: CssRule): boolean =>
  valueOf(rule, 'clip-path') === 'inset(50%)' || (valueOf(rule, 'clip') ?? '').startsWith('rect(')

/** Clips in one stylesheet that leave no ring room, and clip margins that are not the room. */
export function clipViolations(file: Source): string[] {
  const found: string[] = []
  for (const rule of cssRules(file.text)) {
    const clips = rule.declarations
      .filter(declaration => OVERFLOW.test(declaration.property))
      .flatMap(declaration => declaration.value.split(/\s+/))
    const margin = valueOf(rule, 'overflow-clip-margin')
    const where = `${file.path} ${rule.selector}`
    const exempt = VISUALLY_HIDDEN(rule) || TRUNCATES(rule)
    if (clips.includes('hidden') && !exempt) found.push(`${rule.selector} overflow: hidden`)
    else if (clips.includes('clip') && margin !== ROOM_VALUE && !EXACT_EDGES.has(where) && !exempt)
      found.push(`${rule.selector} overflow: clip without the room`)
    if (margin !== undefined && margin !== ROOM_VALUE)
      found.push(`${rule.selector} overflow-clip-margin: ${margin}`)
  }
  return found
}

const CLIP_UTILITY = /^overflow(?:-[xy])?-(?:hidden|clip)$/

/**
 * Truncation is not a clipping container (design session, 2026-11-20): a rule that ends its own text with an
 * ellipsis or clamps it to a number of lines clips only that text and holds no control, so no ring is cut. In a
 * script the same is said by `truncate`, `text-ellipsis` or `line-clamp-*` in the class list that clips.
 */
const TRUNCATES = (rule: CssRule): boolean =>
  valueOf(rule, 'text-overflow') === 'ellipsis' ||
  valueOf(rule, '-webkit-line-clamp') !== undefined ||
  valueOf(rule, 'line-clamp') !== undefined
const TRUNCATION_UTILITY = /^(?:truncate|text-ellipsis|line-clamp-[\w[\]().-]+)$/
const VARIANT = /^(?:[^:\s]*:)*!?/

/** Clipping utilities and inline styles in one script. */
export function scriptClipViolations(file: Source): string[] {
  const classes = scriptStrings(file).flatMap(text => {
    const utilities = text.split(/\s+/).map(token => token.replace(VARIANT, ''))
    if (utilities.some(utility => TRUNCATION_UTILITY.test(utility))) return []
    return utilities
      .filter(utility => CLIP_UTILITY.test(utility))
      .map(utility => `class ${utility}`)
  })
  const inline = objectProperties(scriptTree(file))
    .filter(({ name }) => /^overflow(?:X|Y)?$/.test(name))
    .flatMap(({ name, value }) =>
      stringsIn(value)
        .filter(text => /^(?:hidden|clip)$/.test(text))
        .map(text => `inline ${name}: ${text}`),
    )
  return [...classes, ...inline]
}

export function scanRings(files: readonly ScannedFile[], ring: Ring): string[] {
  const room = ring.width + ring.offset
  return files.flatMap(file => {
    const found =
      file.kind === 'css'
        ? [
            ...clipViolations(file),
            ...cssRules(file.text)
              .filter(rule => reach(rule, ring) > room)
              .map(rule => `${rule.selector} reaches ${reach(rule, ring)}px`),
          ]
        : file.kind === 'html'
          ? []
          : scriptClipViolations(file)
    return found.map(violation => `${file.path} | ${violation}`)
  })
}

const sheet = (path: string): ScannedFile => {
  const file = FILES.find(source => source.path === path)
  if (file === undefined) throw new Error(`${path} is not among the scanned files.`)
  return file
}

const TOKEN_TEXT = FILES.find(file => isTokens(file.path))?.text ?? ''
const RING = ringOf(TOKEN_TEXT)

describe('ring room gate', () => {
  it('derives the ring room from the ring as one registered length', () => {
    expect(RING.width + RING.offset).toBeGreaterThan(0)
    const rules = cssRules(TOKEN_TEXT)
    const registration = rules.find(rule => rule.selector === '@property --omne-ring-room')
    expect(registration && valueOf(registration, 'syntax')).toBe("'<length>'")
    const declared = rules.flatMap(rule => {
      const value = valueOf(rule, '--omne-ring-room')
      return value === undefined ? [] : [normalise(value)]
    })
    expect(declared).toEqual([normalise('calc(var(--omne-ring-width) + var(--omne-ring-offset))')])
  })

  it('keeps the ring room inside every clip but the workspace edge, and no mark reaches past it', () => {
    const report = ratchet('rings', tally(scanRings(FILES, RING)))
    expect(
      report.missing,
      'baselines/rings.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(
      report.added,
      `new clips without the room, or marks reaching past ${RING.width + RING.offset}px: use overflow: clip with overflow-clip-margin: ${ROOM_VALUE}`,
    ).toEqual([])
    expect(report.stale, 'fixed: shrink baselines/rings.json with DESIGN_GATES_SHRINK=1').toEqual(
      [],
    )
    for (const edge of EXACT_EDGES) {
      const [path, selector] = [edge.slice(0, edge.indexOf(' ')), edge.slice(edge.indexOf(' ') + 1)]
      const rule = cssRules(sheet(path).text).find(found => found.selector === selector)
      expect(rule && valueOf(rule, 'overflow'), `${edge} is the clip EXACT_EDGES keeps`).toBe(
        'clip',
      )
    }
  })

  it('clips a disclosure only through the motion sheet, with the room', () => {
    const fold = jsxElements(scriptTree(sheet(DISCLOSURE))).find(element =>
      element.attributes.has('data-expand-content'),
    )
    expect(fold, `${DISCLOSURE} draws the fold content`).toBeDefined()
    const classes = fold?.attributes.get('className')
    expect(
      classes ? stringsIn(classes).join(' ') : '',
      'the fold content carries no overflow utility',
    ).not.toMatch(/overflow-/)
    const folds = FILES.filter(file => file.kind === 'css').flatMap(file =>
      cssRules(file.text)
        .filter(rule => rule.selector.includes('[data-expand-content]'))
        .filter(rule => rule.declarations.some(found => OVERFLOW.test(found.property)))
        .map(rule => ({ file: file.path, rule })),
    )
    expect(folds.map(({ file, rule }) => `${file} ${rule.selector}`)).toEqual([
      `${MOTION_SHEET} [data-expand-content]`,
    ])
    expect(valueOf(folds[0]!.rule, 'overflow')).toBe('clip')
    expect(valueOf(folds[0]!.rule, 'overflow-clip-margin')).toBe(ROOM_VALUE)
  })

  it('gives every scroll container the ring room as scroll padding, and nothing takes it away', () => {
    const padding = FILES.filter(file => file.kind === 'css').flatMap(file =>
      cssRules(file.text)
        .filter(rule =>
          rule.declarations.some(found => found.property.startsWith('scroll-padding')),
        )
        .map(rule => `${file.path} ${rule.selector} ${valueOf(rule, 'scroll-padding') ?? ''}`),
    )
    expect(padding).toEqual([`${BASE_SHEET} * ${ROOM_VALUE}`])
    const overrides = FILES.filter(file => file.kind !== 'css' && file.kind !== 'html').flatMap(
      file => [
        ...scriptStrings(file)
          .flatMap(text => text.split(/\s+/))
          .filter(token => /^scroll-p[xytblrse]?-/.test(token.replace(VARIANT, '')))
          .map(token => `${file.path} ${token}`),
        ...objectProperties(scriptTree(file))
          .filter(({ name }) => name.startsWith('scrollPadding'))
          .map(({ name }) => `${file.path} ${name}`),
      ],
    )
    expect(overrides, 'a scroll padding written elsewhere overrides the ring room').toEqual([])
  })

  it('recognises each clip that leaves no room and each mark that reaches past it', () => {
    const ring: Ring = { width: 2, offset: 2 }
    const css: Source = {
      path: 'packages/x/x-ui/src/a.css',
      kind: 'css',
      text: [
        '.a { overflow: hidden; } .b { overflow-y: auto; } .c { overflow: clip; overflow-clip-margin: var(--omne-ring-room); }',
        '.d { overflow-x: clip; } .e { overflow: clip; overflow-clip-margin: 2px; }',
        '.label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }',
        '.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .clamp { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; }',
        '.f:focus-visible { outline: 2px solid red; outline-offset: 3px; } .g { box-shadow: 0 0 0 1px var(--omne-line), inset 0 0 0 9px red; }',
        '.h { box-shadow: 0 0 0 6px var(--omne-line-focus); } .i:focus-visible { outline-offset: calc(-1 * var(--omne-ring-width)); }',
        '.j { box-shadow: 0 8px 24px black; } .k { outline: var(--omne-ring-width) solid; outline-offset: var(--omne-ring-offset); }',
      ].join('\n'),
    }
    expect(scanRings([{ ...css, member: '@omne-harness/x-ui' }], ring)).toEqual([
      'packages/x/x-ui/src/a.css | .a overflow: hidden',
      'packages/x/x-ui/src/a.css | .d overflow: clip without the room',
      'packages/x/x-ui/src/a.css | .e overflow: clip without the room',
      'packages/x/x-ui/src/a.css | .e overflow-clip-margin: 2px',
      'packages/x/x-ui/src/a.css | .f:focus-visible reaches 5px',
      'packages/x/x-ui/src/a.css | .h reaches 6px',
    ])
    expect(
      scriptClipViolations({
        path: 'a.tsx',
        kind: 'tsx',
        text: [
          "const a = <div className=\"overflow-hidden md:overflow-y-clip overflow-y-auto\" style={{ overflowX: 'hidden', overflow: 'auto' }} />",
          'const b = <p className="overflow-hidden line-clamp-2" />',
          'const c = <span className="min-w-0 truncate" />',
        ].join('\n'),
      }),
    ).toEqual(['class overflow-hidden', 'class overflow-y-clip', 'inline overflowX: hidden'])
  })
})
