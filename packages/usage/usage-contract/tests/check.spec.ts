import { describe, expect, it } from 'vitest'
import { checkUsageQuery, edgesOf, type UsageQuery } from '@omne-harness/usage-contract'

const query = (changes: Partial<UsageQuery> = {}): UsageQuery => ({
  scope: { kind: 'tenant' },
  range: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' },
  zone: 'UTC',
  bucket: 'day',
  groupBy: [],
  ...changes,
})
const ms = (text: string) => Date.parse(text)
const iso = (at: number) => new Date(at).toISOString()
const hours = (edge: { start: number; end: number }) => (edge.end - edge.start) / 3_600_000
const checked = (changes: Partial<UsageQuery>, buckets = 1000) => {
  const answer = checkUsageQuery(query(changes), { buckets })
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

describe('a usage query checked before any read', () => {
  it('takes an IANA zone by its canonical name and refuses offsets and unknown names', () => {
    expect(checked({ zone: 'asia/shanghai' }).zone).toBe('Asia/Shanghai')
    expect(checked({ zone: 'America/Port-au-Prince' }).zone).toBe('America/Port-au-Prince')
    expect(checked({ zone: 'Etc/GMT-8' }).zone).toBe('Etc/GMT-8')
    for (const zone of ['+08:00', '-05:00', 'Mars/Olympus', ''])
      expect(checkUsageQuery(query({ zone }), { buckets: 10 }), zone).toEqual({
        failure: { kind: 'invalid', field: 'zone', reason: 'iana-name' },
      })
  })

  it('refuses a range it cannot read or that is empty, a bucket it does not know, and bad dimensions', () => {
    const refused = (changes: Partial<UsageQuery>) =>
      checkUsageQuery(query(changes), { buckets: 10 })
    expect(refused({ range: { from: 'today', to: '2026-11-02T00:00:00.000Z' } })).toMatchObject({
      failure: { field: 'range', reason: 'instant' },
    })
    expect(refused({ range: { from: '2026-11-02T00:00:00.000Z', to: 'never' } })).toMatchObject({
      failure: { field: 'range', reason: 'instant' },
    })
    const at = '2026-11-02T00:00:00.000Z'
    expect(refused({ range: { from: at, to: at } })).toMatchObject({
      failure: { field: 'range', reason: 'order' },
    })
    expect(refused({ bucket: 'minute' as never })).toEqual({
      failure: { kind: 'invalid', field: 'bucket', reason: 'value' },
    })
    for (const groupBy of [['model', 'tool', 'source'], ['model', 'model'], ['colour']] as never[])
      expect(refused({ groupBy }), JSON.stringify(groupBy)).toEqual({
        failure: { kind: 'invalid', field: 'groupBy', reason: 'dimensions' },
      })
    expect(refused({ groupBy: ['model', 'tool'] })).toMatchObject({ ok: {} })
  })

  it('answers unsupported for an organization and refuses a session with no name', () => {
    expect(checkUsageQuery(query({ scope: { kind: 'organization' } }), { buckets: 10 })).toEqual({
      failure: { kind: 'unsupported', field: 'scope' },
    })
    for (const scope of [
      { kind: 'session', session: '' },
      { kind: 'session', session: 5 },
      { kind: 'galaxy' },
      { kind: 'galaxy', session: 's-1' },
    ] as never[])
      expect(checkUsageQuery(query({ scope }), { buckets: 10 }), JSON.stringify(scope)).toEqual({
        failure: { kind: 'invalid', field: 'scope', reason: 'shape' },
      })
    expect(
      checkUsageQuery(query({ scope: { kind: 'session', session: 's-1' } }), { buckets: 10 }),
    ).toMatchObject({ ok: {} })
  })

  it('refuses more buckets than the limit before anything is read, and takes exactly the limit', () => {
    const year = { from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' }
    expect(checkUsageQuery(query({ range: year, bucket: 'month' }), { buckets: 11 })).toEqual({
      failure: { kind: 'too-large', limit: 'buckets' },
    })
    expect(checked({ range: year, bucket: 'month' }, 12).edges).toHaveLength(12)
    expect(checked({ range: year, bucket: 'none' }, 1).edges).toHaveLength(1)
  })
})

describe('the buckets of a range in a zone', () => {
  it('give the two days of a daylight-saving change their real length', () => {
    const ny = edgesOf(
      ms('2026-03-07T05:00:00Z'),
      ms('2026-03-10T04:00:00Z'),
      'America/New_York',
      'day',
      10,
    )
    expect(ny?.map(hours)).toEqual([24, 23, 24])
    const back = edgesOf(
      ms('2026-10-31T04:00:00Z'),
      ms('2026-11-03T05:00:00Z'),
      'America/New_York',
      'day',
      10,
    )
    expect(back?.map(hours)).toEqual([24, 25, 24])
    const berlin = edgesOf(
      ms('2026-03-28T23:00:00Z'),
      ms('2026-03-29T22:00:00Z'),
      'Europe/Berlin',
      'day',
      10,
    )
    expect(berlin?.map(hours)).toEqual([23])
  })

  it('cut the first and the last bucket to the range and tile it without gaps', () => {
    const edges =
      edgesOf(ms('2026-11-19T10:30:00Z'), ms('2026-11-21T06:00:00Z'), 'UTC', 'day', 10) ?? []
    expect(edges.map(edge => [iso(edge.start), iso(edge.end)])).toEqual([
      ['2026-11-19T10:30:00.000Z', '2026-11-20T00:00:00.000Z'],
      ['2026-11-20T00:00:00.000Z', '2026-11-21T00:00:00.000Z'],
      ['2026-11-21T00:00:00.000Z', '2026-11-21T06:00:00.000Z'],
    ])
  })

  it('start weeks on Monday, months on the first, hours on the hour of the zone', () => {
    const week =
      edgesOf(
        ms('2026-11-19T00:00:00Z'),
        ms('2026-12-01T00:00:00Z'),
        'Asia/Shanghai',
        'week',
        10,
      ) ?? []
    expect(week.map(edge => iso(edge.start)).slice(1)).toEqual([
      '2026-11-22T16:00:00.000Z',
      '2026-11-29T16:00:00.000Z',
    ])
    const month =
      edgesOf(
        ms('2026-01-15T00:00:00Z'),
        ms('2026-04-01T00:00:00Z'),
        'Asia/Kolkata',
        'month',
        10,
      ) ?? []
    expect(month.map(edge => iso(edge.start)).slice(1)).toEqual([
      '2026-01-31T18:30:00.000Z',
      '2026-02-28T18:30:00.000Z',
      '2026-03-31T18:30:00.000Z',
    ])
    const gap =
      edgesOf(
        ms('2026-03-08T05:00:00Z'),
        ms('2026-03-08T09:00:00Z'),
        'America/New_York',
        'hour',
        10,
      ) ?? []
    expect(gap.map(hours)).toEqual([1, 1, 1, 1])
  })

  it('start the day the clock jumps at midnight at its first hour, and the next day at midnight again', () => {
    const edges =
      edgesOf(
        ms('2026-09-04T04:00:00Z'),
        ms('2026-09-09T03:00:00Z'),
        'America/Santiago',
        'day',
        10,
      ) ?? []
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Santiago',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    expect(edges.map(edge => local.format(edge.start))).toEqual([
      '00:00',
      '00:00',
      '01:00',
      '00:00',
      '00:00',
    ])
    expect(edges.map(hours)).toEqual([24, 24, 23, 24, 24])
  })
})
