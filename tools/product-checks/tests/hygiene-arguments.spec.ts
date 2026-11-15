import { describe, expect, it } from 'vitest'
import { HYGIENE_FLAG, parseArguments } from '../src/hygiene/arguments.ts'

describe('hygiene switch of the command line', () => {
  it('does not run the hygiene checks without the switch', () => {
    expect(parseArguments(['../../packages', '../../apps'])).toEqual({
      paths: ['../../packages', '../../apps'],
      hygiene: false,
    })
    expect(parseArguments([]).hygiene).toBe(false)
  })

  it('runs them with the switch, wherever it stands, and keeps it out of the scan roots', () => {
    expect(HYGIENE_FLAG).toBe('--hygiene')
    expect(parseArguments(['--hygiene', 'a', 'b'])).toEqual({ paths: ['a', 'b'], hygiene: true })
    expect(parseArguments(['a', '--hygiene', 'b'])).toEqual({ paths: ['a', 'b'], hygiene: true })
    expect(parseArguments(['a', 'b', '--hygiene'])).toEqual({ paths: ['a', 'b'], hygiene: true })
  })

  it('scans packages by default, with or without the switch', () => {
    expect(parseArguments([])).toEqual({ paths: ['packages'], hygiene: false })
    expect(parseArguments(['--hygiene'])).toEqual({ paths: ['packages'], hygiene: true })
  })
})
