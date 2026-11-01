// The conversion result reader for a deployment without media input: it answers that no block has
// a conversion, never a made-up one, and it still refuses a foreign tenant.
import { describe, expect, it } from 'vitest'
import { createAbsentConversionResults } from '@omne-harness/request-context'
import {
  createAssemblyFixture,
  testingAccess,
} from '@omne-harness/request-context-contract/testing'
import { blockId, tenantOf } from './fixtures/messages.ts'

describe('the absent conversion result reader', () => {
  const f = createAssemblyFixture()
  const reader = createAbsentConversionResults<string>()
  it('answers an index without any entry, so every block is unconverted', async () => {
    const answer = await reader.read({
      access: f.call.access,
      target: f.target,
      blocks: [blockId('b1'), blockId('b2')],
    })
    expect(answer).toEqual({ kind: 'index', entries: new Map() })
  })
  it('answers an empty index for no blocks as well', async () => {
    expect(await reader.read({ access: f.call.access, target: f.target, blocks: [] })).toEqual({
      kind: 'index',
      entries: new Map(),
    })
  })
  it('refuses an access of another tenant than the target before anything else', async () => {
    const answer = await reader.read({
      access: testingAccess('p', tenantOf('9')),
      target: f.target,
      blocks: [blockId('b1')],
    })
    expect(answer).toEqual({ kind: 'denied' })
  })
  it('drives a text history through assembly without a converter', async () => {
    const hosted = createAssemblyFixture()
    expect((await hosted.operations().assemble(hosted.call)).kind).toBe(
      'candidate-before-extension',
    )
  })
})
