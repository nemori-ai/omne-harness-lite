import { mkdtempSync, existsSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROCESS_FALL_FILE, takeLastFall } from '../src/process-fall.ts'

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'omne-process-fall-')))

describe('what a process that went down left for the next one', () => {
  it('is read once: the next run does not count the same fall again', () => {
    const root = fresh()
    writeFileSync(
      join(root, PROCESS_FALL_FILE),
      JSON.stringify({ who: 'plugin:a', error: 'broke' }),
    )
    expect(takeLastFall(root)).toEqual({ who: 'plugin:a', error: 'broke' })
    expect(existsSync(join(root, PROCESS_FALL_FILE))).toBe(false)
    expect(takeLastFall(root)).toBeNull()
  })

  it('a fall traced to nobody keeps its reason and names nobody', () => {
    const root = fresh()
    writeFileSync(join(root, PROCESS_FALL_FILE), JSON.stringify({ who: null, error: 'broke' }))
    expect(takeLastFall(root)).toEqual({ who: null, error: 'broke' })
  })

  it.each([
    ['not JSON', '{'],
    ['not a fall', '{"who":"plugin:a"}'],
    ['null', 'null'],
  ])('%s: nothing is read, and nobody is blamed', (_, text) => {
    const root = fresh()
    writeFileSync(join(root, PROCESS_FALL_FILE), text)
    expect(takeLastFall(root)).toBeNull()
  })
})
