import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { screenshotsBinary } from '../scripts/native-binaries.ts'

describe('the native binaries the packaged app carries', () => {
  it('finds the screenshot library binary installed for this system', () => {
    const binary = screenshotsBinary()
    expect(binary.endsWith('.node')).toBe(true)
    expect(existsSync(binary)).toBe(true)
  })

  it('throws, rather than packing nothing, for a system whose binary is not installed', () => {
    const other = process.platform === 'aix' ? 'sunos' : 'aix'
    expect(() => screenshotsBinary(other, 'ppc64')).toThrow()
  })
})
