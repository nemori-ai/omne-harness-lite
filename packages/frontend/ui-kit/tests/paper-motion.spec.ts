// @module-tag source-text
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const SHEET = readFileSync(join(import.meta.dirname, '..', 'src', 'paper', 'paper.css'), 'utf8')
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
const reduced = SHEET.slice(SHEET.indexOf('{', start) + 1, SHEET.lastIndexOf('}'))
const still = new Set(
  rules(reduced)
    .filter(rule => /transition:\s*none\s*!important/.test(rule.body))
    .flatMap(rule => rule.selectors),
)

it('takes every transition of the paper away when motion is reduced, the controls included', () => {
  expect(start).toBeGreaterThan(0)
  const moving = rules(SHEET.slice(0, start))
    .filter(rule => /(?:^|;)\s*transition\s*:/.test(rule.body))
    .flatMap(rule => rule.selectors.map(subject))
  expect(moving.length).toBeGreaterThan(0)
  for (const name of [...moving, '.omne-paper-surface', '.omne-paper-handle', '.omne-paper-corner'])
    expect(still, name).toContain(name)
})

it('moves only transform and opacity: every transition of the paper names one of the two', () => {
  const moved = rules(SHEET.slice(0, start)).flatMap(rule =>
    [...rule.body.matchAll(/(?:^|;)\s*transition(?:-property)?\s*:([^;]*)/g)].flatMap(match =>
      match[1]!.split(',').map(part => part.trim().split(/\s+/)[0]),
    ),
  )
  expect(moved.length).toBeGreaterThan(0)
  for (const property of moved) expect(['transform', 'opacity']).toContain(property)
})
