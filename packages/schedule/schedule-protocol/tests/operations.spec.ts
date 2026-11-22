import { describe, expect, it } from 'vitest'
import { scheduleProtocol } from '@omne-harness/schedule-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations } = scheduleProtocol
const at = '2026-11-30T01:00:00.000Z'
const upcoming = { at, local: '2026-11-30T09:00:00', calendar: 'cn-legal-holidays', version: 'v-1' }
const card = {
  schedule: 'sched-1',
  label: '交报表',
  control: 'active',
  standing: 'ready',
  author: { kind: 'agent', session: 'session-1' },
  next: upcoming,
  revision: 2,
}
const detail = {
  ...card,
  createdAt: at,
  definition: { any: 'json' },
}

describe('schedule/v2', () => {
  it('has the read and commit operations of the design and no observation', () => {
    expect(Object.keys(operations)).toEqual([
      'list-schedules',
      'read-schedule',
      'read-revisions',
      'read-agenda',
      'preview',
      'create-schedule',
      'query-create-schedule',
      'manage-schedule',
      'query-manage-schedule',
    ])
    expect(operations['create-schedule'].effect).toBe('commit')
    expect(operations['manage-schedule'].effect).toBe('commit')
    expect(operations['read-schedule'].effect).toBe('read')
    expect(Object.keys(scheduleProtocol.observations)).toEqual([])
  })

  it('round-trips a page of cards and a detail with its author, and no consent', () => {
    expectRoundTrip(operations['list-schedules'].body, {
      tenant,
      control: null,
      terminal: false,
      cursor: null,
      limit: 50,
    })
    expectRoundTrip(operations['list-schedules'].outcomes.succeeded, { items: [card], next: null })
    for (const author of [{ kind: 'human' }, { kind: 'agent', session: 's-2' }, { kind: 'system' }])
      expectRoundTrip(operations['read-schedule'].outcomes.succeeded, { ...detail, author })
    const succeeded = operations['read-schedule'].outcomes.succeeded
    expect(readSample(succeeded, { ...detail, basis: { kind: 'owner' } }).ok).toBe(false)
  })

  it('carries a create and every manage action', () => {
    const create = { tenant, createId: 'c-1', definition: { x: 1 }, state: 'active', reason: null }
    expectRoundTrip(operations['create-schedule'].body, create)
    expectRoundTrip(operations['query-create-schedule'].body, create)
    for (const action of [
      { kind: 'rename', label: '新名字' },
      { kind: 'edit', instruction: '写周报' },
      { kind: 'revise', definition: { y: 2 }, reason: '改规则' },
      { kind: 'replace', definition: { y: 2 }, reason: '换掉' },
      { kind: 'pause', reason: null },
      { kind: 'stop', reason: '不要了' },
    ])
      expectRoundTrip(operations['manage-schedule'].body, {
        tenant,
        actionId: 'a-1',
        schedule: 'sched-1',
        revision: 2,
        action,
      })
  })

  it('previews a saved schedule or a definition, with the calendar of each time', () => {
    expectRoundTrip(operations.preview.body, {
      tenant,
      source: { kind: 'schedule', schedule: 's' },
      count: 3,
    })
    expectRoundTrip(operations.preview.body, {
      tenant,
      source: { kind: 'definition', definition: {} },
      count: 3,
    })
    expectRoundTrip(operations.preview.outcomes.succeeded, { upcoming: [upcoming], complete: true })
  })

  it('refuses an unknown action, a negative revision and a bad agenda date', () => {
    const manage = {
      tenant,
      actionId: 'a',
      schedule: 's',
      revision: 1,
      action: { kind: 'reconfirm' },
    }
    expect(readSample(operations['manage-schedule'].body, manage)).toEqual({ ok: false })
    expect(
      readSample(operations['manage-schedule'].body, {
        ...manage,
        revision: -1,
        action: { kind: 'pause', reason: null },
      }),
    ).toEqual({ ok: false })
    expect(
      readSample(operations['read-agenda'].body, {
        tenant,
        from: '2026-02-30',
        to: '2026-03-01',
        timezone: 'Asia/Shanghai',
        cursor: null,
      }),
    ).toEqual({ ok: false })
  })
})
