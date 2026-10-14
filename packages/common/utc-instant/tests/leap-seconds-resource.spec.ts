import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const resource = readFileSync(new URL('../resources/leap-seconds.list', import.meta.url), 'utf8')
const generated = readFileSync(new URL('../src/leap-seconds.generated.ts', import.meta.url), 'utf8')

describe('resources/leap-seconds.list', () => {
  it('is embedded unchanged in the generated module', () => {
    expect(generated).toContain(`export const leapSecondsList = \`${resource}\`\n`)
  })

  it('matches its own IERS #h hash', () => {
    const hashed = resource
      .split('\n')
      .flatMap(line => {
        if (line.startsWith('#$') || line.startsWith('#@')) return [line.slice(2)]
        if (line.startsWith('#')) return []
        return [line.split('#')[0] ?? '']
      })
      .join('')
      .replace(/\s+/gu, '')
    const recorded = /^#h\s+(.+)$/mu.exec(resource)?.[1]?.replace(/\s+/gu, '')
    expect(createHash('sha1').update(hashed).digest('hex')).toBe(recorded)
  })
})
