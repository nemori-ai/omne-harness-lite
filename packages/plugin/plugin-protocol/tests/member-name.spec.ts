import { describe, expect, it } from 'vitest'
import { memberName, readManifest } from '@omne-harness/plugin-protocol'

describe('one name for a member', () => {
  it('writes the title the member gives, with the title of its point', () => {
    expect(
      memberName({ title: '天气', point: 'shell.pages', pointTitle: '一级页面', key: 'weather' }),
    ).toBe('「天气」（一级页面）')
  })

  it('writes the title of the point and the key, the id, or both when the member gives no title', () => {
    expect(
      memberName({ point: 'reports.sections', pointTitle: '报表的节', key: 'sales', id: 'q1' }),
    ).toBe('报表的节「sales / q1」')
    expect(
      memberName({ point: 'shell.parts', pointTitle: '部位', key: 'weather.card', id: null }),
    ).toBe('部位「weather.card」')
  })

  it('is the point alone for the one member of a point that takes no key', () => {
    expect(memberName({ point: 'shell.gate', pointTitle: '登录门', key: '', id: '' })).toBe(
      '登录门',
    )
    expect(
      memberName({ point: 'shell.pages', pointTitle: '一级页面', key: '', id: 'weather' }),
    ).toBe('一级页面「weather」')
  })

  it('falls back to the name of the point when the point has no title to tell', () => {
    expect(memberName({ point: 'shell.pages', pointTitle: null, key: 'weather' })).toBe(
      'shell.pages「weather」',
    )
  })
})

describe('the title of a member in the manifest', () => {
  const manifest = (member: object): string =>
    JSON.stringify({
      schema: 1,
      name: 'weather',
      summary: 'Weather.',
      client: { members: [member] },
    })

  it('reads a title', () => {
    const read = readManifest(
      manifest({ point: 'shell.pages', key: 'weather', title: '天气', data: {} }),
    )
    expect(read).toMatchObject({
      kind: 'read',
      manifest: { client: { members: [{ title: '天气' }] } },
    })
  })

  it('refuses an empty title and says which member', () => {
    expect(
      readManifest(manifest({ point: 'shell.pages', key: 'weather', title: ' ', data: {} })),
    ).toEqual({
      kind: 'refused',
      reason: 'client.members[0] has a title that is not text',
    })
  })
})
