import { describe, expect, it } from 'vitest'
import {
  instanceId,
  loadBasis,
  operationId,
  reason,
  standingOf,
  typeName,
} from '@omne-harness/workspace-contract'

describe('values read from outside are parsed once', () => {
  it('an instance identity is the minted form and nothing else', () => {
    expect(instanceId('wsi_0123456789abcdefghjkmnpqrs')).toBe('wsi_0123456789abcdefghjkmnpqrs')
    for (const text of [
      '',
      'wsi_',
      'wsp_0123456789abcdefghjkmnpqrs',
      'wsi_0123456789ABCDEFGHJKMNPQRS',
      7,
      null,
    ])
      expect(instanceId(text)).toBeNull()
  })

  it('a type name is a short lowercase word', () => {
    expect(typeName('git')).toBe('git')
    expect(typeName('directory-2')).toBe('directory-2')
    for (const text of ['', 'Git', '2git', 'a b', 'x'.repeat(33), undefined])
      expect(typeName(text)).toBeNull()
  })

  it('an operation name is printable, not empty and bounded', () => {
    expect(operationId('f3b0-register/1')).toBe('f3b0-register/1')
    for (const text of ['', 'a b', 'tab\t', 'x'.repeat(129), {}])
      expect(operationId(text)).toBeNull()
  })

  it('a reason and a load basis written wrongly by code throw', () => {
    expect(reason('occupied')).toBe('occupied')
    expect(() => reason('Not A Code')).toThrow(TypeError)
    expect(loadBasis('unpinned')).toBe('unpinned')
    expect(() => loadBasis('two\nlines')).toThrow(TypeError)
    expect(() => loadBasis('')).toThrow(TypeError)
  })
})

describe('standing is computed from the relation', () => {
  it.each([
    [null, 'none'],
    [{ role: 'participant', superAdmin: false }, 'participant'],
    [{ role: 'participant', superAdmin: true }, 'admin'],
    [{ role: 'owner' }, 'owner'],
  ] as const)('%j is %s', (relation, standing) => {
    expect(standingOf(relation)).toBe(standing)
  })
})
