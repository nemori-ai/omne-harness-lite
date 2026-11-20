import { describe, expect, it } from 'vitest'
import {
  GRANT_REF_TEXT_LIMIT,
  grantRefText,
  parseGrantRef,
  type GrantRef,
} from '@omne-harness/authorization'

const source = { owner: 'session', record: 'card/1#decision', revision: '4', digest: 'abc' }
const gate = { capability: 'tool.Schedules', key: 'tool.activate' }

const GRANTS: readonly GrantRef[] = [
  { via: 'verdict', layer: 'tenant', holder: 'tenant-1', gate, revision: 'r7' },
  { via: 'verdict', layer: 'session', holder: 'session-1', gate, revision: 'r7' },
  { via: 'session-grant', holder: 'session-1', gate, source },
  { via: 'once', holder: 'session-1', source },
  { via: 'skip-ask', holder: 'session-1', source },
]

function broken(value: object, at = ''): (readonly [string, unknown])[] {
  const variants: (readonly [string, unknown])[] = [
    [`${at || 'it'} with an extra member`, { ...value, extra: 'x' }],
  ]
  for (const [key, member] of Object.entries(value)) {
    const path = at === '' ? key : `${at}.${key}`
    const { [key]: _gone, ...without } = value as Record<string, unknown>
    variants.push([`${path} missing`, without])
    for (const wrong of ['', 5, null, []])
      variants.push([`${path} = ${JSON.stringify(wrong)}`, { ...value, [key]: wrong }])
    if (typeof member === 'object' && member !== null)
      for (const [label, inner] of broken(member, path))
        variants.push([label, { ...value, [key]: inner }])
  }
  return variants
}

describe('the canonical text of a grant reference', () => {
  it.each(GRANTS)('reads back the same reference: $via', grant => {
    const text = grantRefText(grant)
    expect(parseGrantRef(text)).toEqual(grant)
    expect(grantRefText(parseGrantRef(text)!)).toBe(text)
  })

  it('is the same text whatever order the members were written in', () => {
    const reordered = { source, holder: 'session-1', via: 'once' } as const
    expect(grantRefText(reordered)).toBe(grantRefText(GRANTS[3]!))
  })

  it.each([
    ['not JSON', 'grant'],
    ['an unknown way', JSON.stringify({ holder: 'h', via: 'guess' })],
    ['a missing member', JSON.stringify({ holder: 'session-1', via: 'once' })],
    ['an extra member', grantRefText({ ...GRANTS[3]!, extra: 1 } as unknown as GrantRef)],
    ['an empty holder', grantRefText({ ...GRANTS[3]!, holder: '' } as GrantRef)],
    [
      'a layer outside the two',
      grantRefText({ ...GRANTS[0]!, layer: 'organization' } as unknown as GrantRef),
    ],
    [
      'evidence with a member missing',
      grantRefText({ via: 'once', holder: 'h', source: { owner: 'o' } } as unknown as GrantRef),
    ],
    ['text that is not canonical', ` ${grantRefText(GRANTS[2]!)}`],
  ])('rejects %s', (_label, text) => {
    expect(parseGrantRef(text)).toBeNull()
  })

  it.each([
    ['an array', '[]'],
    ['a number', '5'],
    ['null', 'null'],
  ])('rejects text that is %s', (_label, text) => {
    expect(parseGrantRef(text)).toBeNull()
  })

  it.each(
    GRANTS.flatMap(grant =>
      broken(grant).map(([label, value]) => [`${grant.via}: ${label}`, value] as const),
    ),
  )('rejects one member broken, %s', (_label, value) => {
    expect(parseGrantRef(grantRefText(value as GrantRef))).toBeNull()
  })

  it('rejects text over the limit and keeps every canonical reference of this shape under it', () => {
    const long = { ...GRANTS[2]!, holder: 'h'.repeat(GRANT_REF_TEXT_LIMIT) }
    expect(parseGrantRef(grantRefText(long))).toBeNull()
    for (const grant of GRANTS) expect(Buffer.byteLength(grantRefText(grant))).toBeLessThan(400)
  })
})
