import { describe, expect, it } from 'vitest'
import {
  RELATIONS_TO_REFERENCE,
  relationToReference,
  type DirectoryStanding,
  type RelationToReference,
} from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'

const id = sessionId
const row = (
  session: string,
  parent: string | null,
  root: string,
  depth: number,
  origin: string | null = null,
): DirectoryStanding => ({
  session: id(session),
  parent: parent === null ? null : id(parent),
  origin: origin === null ? null : id(origin),
  root: id(root),
  depth,
})

// One tree of three layers, a second tree, and a handoff made by `a` that itself handed off.
const R = row('r', null, 'r', 0)
const A = row('a', 'r', 'r', 1)
const B = row('b', 'r', 'r', 1)
const A1 = row('a1', 'a', 'r', 2)
const A2 = row('a2', 'a', 'r', 2)
const B1 = row('b1', 'b', 'r', 2)
const OTHER = row('x', null, 'x', 0)
const OTHER_CHILD = row('x1', 'x', 'x', 1)
const HANDED = row('h', null, 'h', 0, 'a')
const ROWS = [R, A, B, A1, A2, B1, OTHER, OTHER_CHILD, HANDED]

type Expected = Readonly<Record<string, RelationToReference>>
const TABLE: readonly (readonly [DirectoryStanding, Expected])[] = [
  [
    R,
    {
      r: 'self',
      a: 'child',
      b: 'child',
      a1: 'lower',
      a2: 'lower',
      b1: 'lower',
      x: 'unrelated',
      x1: 'unrelated',
      h: 'unrelated',
    },
  ],
  [
    A,
    {
      r: 'parent',
      a: 'self',
      b: 'sibling',
      a1: 'child',
      a2: 'child',
      b1: 'lower',
      x: 'unrelated',
      x1: 'unrelated',
      h: 'handed-off',
    },
  ],
  [
    A1,
    {
      r: 'upper',
      a: 'parent',
      b: 'upper',
      a1: 'self',
      a2: 'sibling',
      b1: 'rest',
      x: 'unrelated',
      x1: 'unrelated',
      h: 'unrelated',
    },
  ],
  [
    HANDED,
    {
      r: 'unrelated',
      a: 'handed-from',
      b: 'unrelated',
      a1: 'unrelated',
      a2: 'unrelated',
      b1: 'unrelated',
      x: 'unrelated',
      x1: 'unrelated',
      h: 'self',
    },
  ],
]

describe('what a session of the directory is to a reference (SW-I23)', () => {
  it.each(TABLE)('answers every row against the reference $0.session', (reference, expected) => {
    const answered = Object.fromEntries(
      ROWS.map(item => [item.session, relationToReference(item, reference)]),
    )
    expect(answered).toEqual(expected)
  })

  it('uses each of the ten values in the table, so none is unreachable', () => {
    const used = new Set(TABLE.flatMap(([, expected]) => Object.values(expected)))
    expect([...used].sort()).toEqual([...RELATIONS_TO_REFERENCE].sort())
  })

  it('reads the parent before the layer, and the layer before the handoff', () => {
    const handedInTree = row('k', 'r', 'r', 1, 'a')
    expect(relationToReference(handedInTree, A)).toBe('sibling')
    expect(relationToReference(handedInTree, A1)).toBe('upper')
  })
})
