import { expect, it } from 'vitest'
import { captureComposedTree } from '../src/tree.ts'

const row = {
  id: 'a',
  plugin: { package: '@test/provider', export: 'Managed' },
  config: { secret: ['private'] },
  enabled: true,
  source: 'distribution',
}

it.each([
  { enabled: undefined },
  { enabled: 'true' },
  { source: 'unknown' },
  { editIndex: undefined },
  { editIndex: 0 },
  { source: 'operator' },
  { source: 'operator', editIndex: '0' },
  { source: 'operator', editIndex: 0.5 },
  { source: 'operator', editIndex: -1 },
  { source: 'operator', editIndex: Number.MAX_SAFE_INTEGER + 1 },
])('rejects invalid composed provenance %j', changes => {
  const item = { ...row, ...changes }
  expect(() => captureComposedTree([item])).toThrow(
    expect.objectContaining({
      code: 'invalid-tree',
      layer: item.source === 'operator' ? 'operator' : 'distribution',
      index: 0,
    }),
  )
})

it('preserves row validation and duplicate identity priority before metadata', () => {
  expect(() => captureComposedTree([{ ...row, config: undefined, enabled: undefined }])).toThrow(
    expect.objectContaining({ code: 'invalid-config', rowId: 'a', index: 0 }),
  )
  expect(() => captureComposedTree([row, { ...row, enabled: undefined }])).toThrow(
    expect.objectContaining({ code: 'duplicate-id', rowId: 'a', index: 1 }),
  )
})

it('captures operator edit zero and disabled distribution rows without retaining input', () => {
  const input = [
    { ...row, enabled: false },
    { ...row, id: 'b', source: 'operator', editIndex: 0 },
  ]
  const captured = captureComposedTree(input)
  input[0]!.config.secret.push('later')
  expect(captured[0]).toMatchObject({ enabled: false, source: 'distribution' })
  expect(captured[0]).not.toHaveProperty('editIndex')
  expect(captured[1]).toMatchObject({ source: 'operator', editIndex: 0 })
  expect(captured[1]?.config).toEqual({ secret: ['private'] })
  expect(Object.isFrozen(captured)).toBe(true)
  expect(Object.isFrozen(captured[1])).toBe(true)
  expect(Object.isFrozen(captured[1]?.config)).toBe(true)
})
