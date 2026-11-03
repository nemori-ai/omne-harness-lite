import { describe, expect, it } from 'vitest'
import { decodeOutputCursor, decodeRevision } from '../src/identity-values.ts'
import { decodeModelOutputV1, encodeModelOutputV1 } from '../src/model-output-v1.ts'

// The envelope of a sealed block (`kind`, `index`, `block`) is judged before the block itself: a
// wire value must carry exactly those keys, a string index and a record block, while the producer
// side (encoding) drops what it does not know. These cases hold that judgment on its own.

const textBlock = {
  id: 'b1',
  visibility: { toHuman: true, toModel: true },
  kind: 'text',
  text: 'a',
}

function projectionWith(blocks: unknown): Record<string, unknown> {
  const cursor = decodeOutputCursor('1')
  const revision = decodeRevision('2')
  if ('failure' in cursor || 'failure' in revision) throw new Error('Invalid identity fixture')
  return {
    projection: 'model-output-v1',
    phase: 'running',
    cursor: cursor.ok,
    revision: revision.ok,
    blocks,
  }
}

function decodeSealed(envelope: Record<string, unknown>) {
  return decodeModelOutputV1(
    JSON.stringify(projectionWith([{ kind: 'sealed', index: '0', block: textBlock, ...envelope }])),
  )
}

describe('the envelope of a sealed block', () => {
  it('accepts exactly the three keys on the wire', () => {
    expect(decodeSealed({})).toHaveProperty('ok')
  })

  it('refuses a key beyond the envelope on the wire but drops it when encoding', () => {
    expect(decodeSealed({ extra: 1 })).toStrictEqual({
      failure: { kind: 'invalid-model-output', reason: 'blocks' },
    })
    const encoded: unknown = Reflect.apply(encodeModelOutputV1, undefined, [
      projectionWith([{ kind: 'sealed', index: '0', block: textBlock, extra: 1 }]),
    ])
    if (typeof encoded !== 'object' || encoded === null || !('ok' in encoded))
      throw new Error('Expected the encoding to succeed')
    expect(String(encoded.ok)).toContain('"kind":"sealed"')
    expect(String(encoded.ok)).not.toContain('extra')
  })

  it.each([5, null, undefined, ['0']])('refuses the index %j', index => {
    expect(decodeSealed({ index })).toStrictEqual({
      failure: { kind: 'invalid-model-output', reason: 'blocks' },
    })
  })

  it.each([null, 'text', 5, ['x']])('refuses the block %j without throwing', block => {
    expect(decodeSealed({ block })).toStrictEqual({
      failure: { kind: 'invalid-model-output', reason: 'blocks' },
    })
  })
})
