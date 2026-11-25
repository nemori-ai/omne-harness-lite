// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const SHEET = readFileSync(join(import.meta.dirname, '..', 'src', 'view', 'canvas-ui.css'), 'utf8')
const REDUCED = '@media (prefers-reduced-motion: reduce)'

function rules(text: string): { selectors: string[]; body: string }[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: match[1]!.split(',').map(selector => selector.trim()),
    body: match[2]!,
  }))
}

function subject(selector: string): string {
  const last =
    selector
      .split(/\s+|>/)
      .filter(part => part !== '')
      .at(-1) ?? ''
  return /^\.[\w-]+/.exec(last)?.[0] ?? last
}

const start = SHEET.indexOf(REDUCED)
const own = rules(start < 0 ? SHEET : SHEET.slice(0, start))
const reduced = start < 0 ? [] : rules(SHEET.slice(SHEET.indexOf('{', start) + 1))

const held = (name: string, still: (body: string) => boolean): boolean =>
  reduced.some(rule => rule.selectors.includes(name) && still(rule.body))

it('takes every transition the module writes away when motion is reduced', () => {
  const moving = own
    .filter(rule => /(?:^|;)\s*transition\s*:/.test(rule.body))
    .flatMap(rule => rule.selectors.map(subject))
  for (const name of moving)
    expect(
      held(name, body => /transition:\s*none\s*!important/.test(body)),
      name,
    ).toBe(true)
})

it('shows and hides what it fades at once when motion is reduced, the control keeping its own feedback', () => {
  const faded = [
    ...new Set(
      own
        .filter(rule => /(?:^|;)\s*opacity\s*:/.test(rule.body))
        .flatMap(rule => rule.selectors.map(subject)),
    ),
  ]
  expect(faded).toContain('.canvas-more')
  for (const name of faded)
    expect(
      held(name, body => {
        const property = /transition-property:([^;]*)!important/.exec(body)?.[1]
        return (
          /transition:\s*none\s*!important/.test(body) ||
          (property !== undefined && !/\bopacity\b/.test(property))
        )
      }),
      name,
    ).toBe(true)
})
