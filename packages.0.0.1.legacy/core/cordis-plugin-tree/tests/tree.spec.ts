import { describe, expect, it } from 'vitest'
import { composePluginTree, describePluginTree, PluginTreeError } from '../src/index.ts'

const row = (id: string, config: unknown = {}) => ({
  id,
  plugin: { package: '@test/provider', export: 'Managed' },
  config,
})
describe('serializable plugin tree', () => {
  it('captures replacement and insertion without retaining mutable input', () => {
    const replacement = { n: [2] }
    const tree = composePluginTree(
      [row('a', { original: true }), row('b')],
      [
        { op: 'replace', id: 'a', config: replacement },
        { op: 'insert', row: row('c'), position: { before: 'b' } },
        { op: 'disable', id: 'b' },
      ],
    )
    replacement.n.push(3)
    expect(tree.map(item => [item.id, item.enabled])).toEqual([
      ['a', true],
      ['c', true],
      ['b', false],
    ])
    expect(tree[0]?.config).toEqual({ n: [2] })
    expect(Object.isFrozen(tree[0]?.config)).toBe(true)
    expect(describePluginTree(tree).every(item => item.config === '[redacted]')).toBe(true)
  })
  it.each(['a\n', 'a\r', 'a\u2028', 'a\u2029', '-a', 'A'])(
    'rejects the entire invalid id %j',
    id => {
      expect(() => composePluginTree([row(id)])).toThrow(PluginTreeError)
    },
  )
  it('rejects accessors without invoking them and preserves ordinary JSON prototype-looking keys', () => {
    let invoked = false
    const config = {
      get secret() {
        invoked = true
        return 'private'
      },
    }
    expect(() => composePluginTree([row('a', config)])).toThrow(PluginTreeError)
    expect(invoked).toBe(false)
    const parsed: unknown = JSON.parse('{"__proto__":{"x":1},"constructor":"value"}')
    expect(composePluginTree([row('a', parsed)])[0]?.config).toEqual(parsed)
  })
  it('checks the complete edit input before applying an earlier invalid target', () => {
    expect(() =>
      composePluginTree(
        [row('a')],
        [
          { op: 'disable', id: 'missing' },
          { op: 'replace', id: 'a', config: undefined },
        ],
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-config', index: 1 }))
  })
})
