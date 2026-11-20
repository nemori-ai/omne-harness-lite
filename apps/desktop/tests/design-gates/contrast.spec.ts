// @module-tag source-text
import { describe, expect, it } from 'vitest'

import { ratchet, tally } from './ratchet.ts'
import { FILES, TOKENS, isTokens } from './scope.ts'

/**
 * FE-I27: in both themes, active text and state words reach 4.5:1 on the surface they sit on, field boundaries
 * and the focus ring 3:1; hover, selected and the accent hover stay visibly apart. The pairs are where each role
 * is drawn, taken from the source's contrast gate with the names of this repository. Decorative hairlines, tonal
 * surface steps and disabled controls are not held to a ratio. Colours are read from tokens.css: each role
 * follows `var()` aliases to a `light-dark(#hex, #hex)` pair, and the ratio is WCAG's relative luminance.
 */

const THEMES = ['light', 'dark'] as const
type Pair = readonly [light: string, dark: string]

const READING_SURFACES = [
  '--omne-surface-page',
  '--omne-surface-panel',
  '--omne-surface-panel-soft',
  '--omne-surface-field',
]
const ROW_SURFACES = ['--omne-hover', '--omne-press', '--omne-selected']

/** [role, surfaces it is drawn on, minimum ratio] */
const PAIRS: readonly (readonly [string, readonly string[], number])[] = [
  [
    '--omne-ink-primary',
    [...READING_SURFACES, ...ROW_SURFACES, '--omne-info-fill', '--omne-bubble-assistant'],
    4.5,
  ],
  [
    '--omne-ink-muted',
    [
      ...READING_SURFACES,
      ...ROW_SURFACES,
      '--omne-info-fill',
      '--omne-caution-fill',
      '--omne-danger-fill',
      '--omne-good-fill',
    ],
    4.5,
  ],
  ['--omne-ink-faint', READING_SURFACES, 4.5],
  ['--omne-accent', READING_SURFACES, 4.5],
  ['--omne-info-ink', [...READING_SURFACES, '--omne-hover', '--omne-info-fill'], 4.5],
  ['--omne-bubble-ink', ['--omne-bubble-user'], 4.5],
  ['--omne-accent-ink', ['--omne-accent', '--omne-accent-hover', '--omne-accent-press'], 4.5],
  ['--omne-danger-foreground', ['--omne-danger-ink'], 4.5],
  ['--omne-good-ink', ['--omne-good-fill', '--omne-surface-page', '--omne-surface-panel'], 4.5],
  [
    '--omne-caution-ink',
    [
      '--omne-caution-fill',
      '--omne-surface-page',
      '--omne-surface-panel',
      '--omne-surface-panel-soft',
    ],
    4.5,
  ],
  [
    '--omne-danger-ink',
    ['--omne-danger-fill', '--omne-surface-page', '--omne-surface-panel', '--omne-surface-field'],
    4.5,
  ],
  ['--omne-tooltip-ink', ['--omne-tooltip'], 4.5],
  [
    '--omne-line-focus',
    [
      ...READING_SURFACES,
      '--omne-hover',
      '--omne-selected',
      '--omne-info-fill',
      '--omne-bubble-user',
    ],
    3,
  ],
  ['--omne-line', ['--omne-surface-page', '--omne-surface-panel', '--omne-surface-field'], 3],
  ['--omne-danger-line', ['--omne-surface-field', '--omne-surface-panel'], 3],
  [
    '--omne-ink-faint',
    ['--omne-surface-page', '--omne-surface-panel', '--omne-surface-panel-soft'],
    3,
  ],
]

/** Roles whose two values must differ, so the state they name is visible. */
const DISTINCT: readonly (readonly [string, string])[] = [['--omne-accent-hover', '--omne-accent']]

/**
 * Fills that must stand a visible step apart in both themes, so a row under the pointer never reads as the
 * current row (the glide highlight against the `selected` fill). The floor is the source's approved light step.
 */
const STEPS: readonly (readonly [string, string, number])[] = [
  ['--omne-selected', '--omne-hover', 1.1],
]

/** Custom properties of the plain `:root` blocks (the size steps stand apart), name to raw value. */
export function rootProperties(css: string): Map<string, string> {
  const roots = [
    ...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\n):root\s*\{([\s\S]*?)\n\}/g),
  ]
  if (roots.length === 0) throw new Error('tokens.css has no :root block.')
  return new Map(
    roots.flatMap(root =>
      [...root[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match): [string, string] => [
        match[1]!,
        match[2]!.trim(),
      ]),
    ),
  )
}

/** A role's light and dark sRGB value, following `var()` to a `light-dark()` pair. */
export function resolve(properties: ReadonlyMap<string, string>, role: string): Pair {
  const value = properties.get(role)
  if (value === undefined) throw new Error(`tokens.css does not define ${role}.`)
  const pair = /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(value)
  if (pair !== null) return [pair[1]!.toLowerCase(), pair[2]!.toLowerCase()]
  const alias = /^var\((--[\w-]+)\)$/.exec(value)
  if (alias !== null) return resolve(properties, alias[1]!)
  throw new Error(`${role} is '${value}', which is neither a light-dark() pair nor a var() alias.`)
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high! + 0.05) / (low! + 0.05)
}

/** Every pair below its target, every step too small and every pair of states that look the same. */
export function contrastFailures(properties: ReadonlyMap<string, string>): {
  readonly failures: string[]
  readonly table: string[]
} {
  const failures: string[] = []
  const table: string[] = []
  for (const [role, surfaces, minimum] of PAIRS) {
    for (const surface of surfaces) {
      const [fg, bg] = [resolve(properties, role), resolve(properties, surface)]
      const ratios = THEMES.map((_, index) => contrast(fg[index]!, bg[index]!))
      table.push(`${role} on ${surface}: ${ratios.map(ratio => ratio.toFixed(2)).join(' / ')}`)
      THEMES.forEach((theme, index) => {
        if (ratios[index]! < minimum)
          failures.push(`${minimum === 3 ? 'boundary' : 'text'} | ${role} on ${surface} | ${theme}`)
      })
    }
  }
  for (const [state, rest, minimum] of STEPS) {
    const [a, b] = [resolve(properties, state), resolve(properties, rest)]
    THEMES.forEach((theme, index) => {
      const ratio = contrast(a[index]!, b[index]!)
      table.push(`${state} against ${rest} (${theme}): ${ratio.toFixed(2)}`)
      if (ratio < minimum) failures.push(`step | ${state} against ${rest} | ${theme}`)
    })
  }
  for (const [state, rest] of DISTINCT) {
    const [a, b] = [resolve(properties, state), resolve(properties, rest)]
    THEMES.forEach((theme, index) => {
      if (a[index] === b[index]) failures.push(`distinct | ${state} equals ${rest} | ${theme}`)
    })
  }
  return { failures, table }
}

describe('contrast gate', () => {
  it('keeps text at 4.5:1, boundaries at 3:1, and hover, selected and the accent hover apart in both themes', () => {
    const tokens = FILES.find(file => isTokens(file.path))
    expect(tokens, `${TOKENS} is among the scanned files`).toBeDefined()
    const { failures, table } = contrastFailures(rootProperties(tokens!.text))
    process.stderr.write(`[design-gate contrast] ${table.length} pairs x 2 themes checked\n`)
    const report = ratchet('contrast', tally(failures.map(failure => `${TOKENS} | ${failure}`)))
    expect(
      report.missing,
      'baselines/contrast.json is missing: seed it with DESIGN_GATES_SEED=1',
    ).toBe(false)
    expect(report.added, 'pairs below their contrast target').toEqual([])
    expect(
      report.stale,
      'fixed pairs: shrink baselines/contrast.json with DESIGN_GATES_SHRINK=1',
    ).toEqual([])
  })

  it('measures WCAG ratios, follows aliases and refuses a value it cannot read', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    const aliased = rootProperties(
      ':root {\n  --kami-a: light-dark(#141413, #EceADF);\n  --omne-b: var(--kami-a);\n  --omne-c: var(--omne-b);\n  --omne-d: color-mix(in srgb, red 50%, blue);\n}\n:root[data-size="large"] {\n  --omne-c: light-dark(#000000, #000000);\n}\n',
    )
    expect(resolve(aliased, '--omne-c')).toEqual(['#141413', '#eceadf'])
    expect(() => resolve(aliased, '--omne-missing')).toThrow('does not define --omne-missing')
    expect(() => resolve(aliased, '--omne-d')).toThrow(
      'neither a light-dark() pair nor a var() alias',
    )
  })

  it('recognises a pair below its target, a step too small and two states that look the same', () => {
    const properties = rootProperties(
      `:root {\n${[
        ...new Set([
          ...PAIRS.flatMap(([role, surfaces]) => [role, ...surfaces]),
          ...STEPS.flat(),
          ...DISTINCT.flat(),
        ]),
      ]
        .filter((name): name is string => typeof name === 'string')
        .map(name => `  ${name}: light-dark(#ffffff, #000000);`)
        .join('\n')}\n  --omne-ink-primary: light-dark(#000000, #ffffff);\n}\n`,
    )
    const { failures } = contrastFailures(properties)
    expect(failures).toContain('text | --omne-ink-muted on --omne-surface-page | light')
    expect(failures).toContain('boundary | --omne-line on --omne-surface-field | dark')
    expect(failures).toContain('step | --omne-selected against --omne-hover | light')
    expect(failures).toContain('distinct | --omne-accent-hover equals --omne-accent | dark')
    expect(failures).not.toContain('text | --omne-ink-primary on --omne-surface-page | light')
  })
})
