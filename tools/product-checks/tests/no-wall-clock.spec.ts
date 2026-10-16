import { describe, expect, it } from 'vitest'
import { noWallClock } from '../src/rules/no-wall-clock.ts'

const check = (text: string) => noWallClock.check([{ path: 'schema/schema-provider/src/provider.ts', text }])

describe('wall-clock annotations', () => {
  it.each(['operation-timing', 'internal-name', 'clock-source', 'observation-time'])(
    'permits a concrete %s call with a reason',
    category => {
      expect(check(`const t = /* wall-clock: ${category} -- local operation */ Date.now()`)).toEqual([])
    },
  )

  it('binds the annotation to one call even on a shared line', () => {
    const violations = check('const elapsed = /* wall-clock: operation-timing -- lock wait */ Date.now() - Date.now()')
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ line: 1 })
  })

  it('does not annotate a declaration, a later statement, or an enclosing expression', () => {
    expect(check(`/* wall-clock: operation-timing -- lock wait */ const t = Date.now()
/* wall-clock: operation-timing -- lock wait */
Date.now()
/* wall-clock: operation-timing -- lock wait */ (Date.now())
const t2 = /* wall-clock: operation-timing -- lock wait */ 0; Date.now()`)).toHaveLength(4)
  })

  it.each([
    '/* wall-clock: operation-timing */',
    '/* wall-clock: operation-timing --   */',
    '/* wall-clock: unknown -- local operation */',
    '/* wall-clock: operation-timing -- line one\nline two */',
    '/* text /* wall-clock: operation-timing -- lock wait */',
    '// wall-clock: operation-timing -- lock wait\n',
  ])('keeps invalid annotations visible: %s', annotation => {
    expect(check(`const t = ${annotation} Date.now()`)).toHaveLength(1)
  })

  it('uses the same binding for const aliases, destructuring and no-argument constructors', () => {
    expect(check(`const { now: tick } = performance
const current = Date.now
const Constructor = Date
const a = /* wall-clock: operation-timing -- elapsed wait */ tick()
const b = /* wall-clock: internal-name -- temporary filename */ current()
const c = /* wall-clock: observation-time -- display only */ new Constructor()
tick(); current(); new Constructor(); new Constructor(knownTime)`)).toHaveLength(3)
  })

  it('does not treat comment-shaped strings as annotations', () => {
    expect(check('const note = "/* wall-clock: operation-timing -- lock wait */"; Date.now()')).toHaveLength(1)
  })
})
