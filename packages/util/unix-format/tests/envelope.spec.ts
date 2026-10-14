import { describe, expect, it } from 'vitest'
import { formatError, formatHold, formatSuccess } from '@omne-harness/unix-format'

describe('formatError', () => {
  it('renders the message alone', () => {
    expect(formatError('Operation failed.')).toBe('ERROR: Operation failed.')
  })

  it('appends a hint line', () => {
    expect(formatError('Operation failed.', { hint: "Try 'retry' command." })).toBe(
      "ERROR: Operation failed.\nHINT: Try 'retry' command.",
    )
  })

  it('passes multi-line messages through', () => {
    expect(formatError('line 1\nline 2', { hint: 'check docs' })).toBe(
      'ERROR: line 1\nline 2\nHINT: check docs',
    )
  })

  it('renders an empty message and an empty hint', () => {
    expect(formatError('')).toBe('ERROR: ')
    expect(formatError('boom', { hint: '' })).toBe('ERROR: boom\nHINT: ')
  })
})

describe('formatHold', () => {
  it('renders the message alone', () => {
    expect(formatHold('Read help first.')).toBe('HOLD: Read help first.')
  })

  it('treats empty steps as none', () => {
    expect(formatHold('msg', { steps: [] })).toBe('HOLD: msg')
  })

  it('numbers steps from one', () => {
    expect(
      formatHold('Before install:', { steps: ['Read skill doc', 'Set i_have_read_skill=true'] }),
    ).toBe('HOLD: Before install:\n  1. Read skill doc\n  2. Set i_have_read_skill=true')
  })

  it('passes newlines inside a step through', () => {
    expect(formatHold('m', { steps: ['line1\nline2'] })).toBe('HOLD: m\n  1. line1\nline2')
  })
})

describe('formatSuccess', () => {
  it('renders the message alone', () => {
    expect(formatSuccess('Installed v1.0.')).toBe('OK: Installed v1.0.')
  })

  it('appends a hint line', () => {
    expect(formatSuccess('Installed v1.0.', { hint: "Run 'list' to verify." })).toBe(
      "OK: Installed v1.0.\nHINT: Run 'list' to verify.",
    )
  })

  it('renders an empty message and an empty hint', () => {
    expect(formatSuccess('', { hint: '' })).toBe('OK: \nHINT: ')
  })
})
