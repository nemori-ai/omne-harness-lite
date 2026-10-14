import { helpText, parseArgv } from '@omne-harness/cli'
import { describe, expect, it } from 'vitest'
import { expectedHelp } from './support/expected.ts'

describe('parseArgv success', () => {
  it('accepts exactly --help', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' })
  })

  it('accepts exactly --version', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' })
  })
})

describe('helpText', () => {
  it('is the documented help text with a trailing newline', () => {
    expect(helpText).toBe(expectedHelp)
  })
})
