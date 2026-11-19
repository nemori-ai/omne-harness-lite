import { describe, expect, it } from 'vitest'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations, observations } = workspaceProtocol
const ON_TARGET = ['grant-participation', 'grant-admin', 'revoke-admin', 'remove'] as const
const ON_SELF = ['leave', 'destroy'] as const
const CHANGES = [...ON_TARGET, ...ON_SELF]
const COMMITS: readonly string[] = ['register', 'associate', 'dissociate', ...CHANGES]
const READS = ['list', 'describe', ...COMMITS.map(name => `query-${name}`)]
const workspace = 'wsp_00000000000000000000000001'
const instance = 'wsi_00000000000000000000000001'
const registered = { workspace, instance, type: 'directory' }
const registration = { tenant, operation: 'op-1', address: '/Users/me/projects/blog' }

describe('workspace/v1', () => {
  it('is workspace major 1: two reads, nine commits, a query for each commit, and no observation', () => {
    expect([workspaceProtocol.name, workspaceProtocol.major]).toEqual(['workspace', 1])
    expect(Object.keys(operations).sort()).toEqual([...READS, ...COMMITS].sort())
    expect(Object.keys(observations)).toEqual([])
    for (const [name, operation] of Object.entries(operations)) {
      expect([name, operation.effect]).toEqual([name, READS.includes(name) ? 'read' : 'commit'])
      expect([name, operation.identity, operation.limit, operation.countsAsAccess]).toEqual([
        name,
        'login',
        'small',
        true,
      ])
    }
  })

  it('gives the commit an answer for nothing changed and for an unknown result, and no read either', () => {
    for (const [name, operation] of Object.entries(operations)) {
      const outcomes = Object.keys(operation.outcomes)
      expect([name, outcomes.includes('unknown')]).toEqual([name, COMMITS.includes(name)])
      expect([name, outcomes.includes('no-change')]).toEqual([name, COMMITS.includes(name)])
      for (const fixed of ['denied', 'basis-unavailable', 'protocol-rejected'])
        expect([name, fixed, outcomes.includes(fixed)]).toEqual([name, fixed, true])
    }
  })
})

describe('registering', () => {
  it('carries the operation name, the address and an optional type; the query takes the same body', () => {
    for (const name of ['register', 'query-register'] as const) {
      expectRoundTrip(operations[name].body, registration)
      expectRoundTrip(operations[name].body, { ...registration, type: 'git' })
      for (const bad of [
        { ...registration, operation: '' },
        { ...registration, address: '' },
        { ...registration, type: '' },
        { ...registration, type: null },
        { ...registration, tenant: 'nobody' },
        { tenant, operation: 'op-1' },
        { ...registration, extra: true },
      ])
        expect([name, bad, readSample(operations[name].body, bad).ok]).toEqual([name, bad, false])
    }
  })

  it('answers the workspace, the instance and the type, or a reason, or nothing', () => {
    expectRoundTrip(operations.register.outcomes.succeeded, registered)
    expectRoundTrip(operations.register.outcomes['no-change'], registered)
    expectRoundTrip(operations.register.outcomes.invalid, { reason: 'occupied' })
    expectRoundTrip(operations.register.outcomes.conflict, {})
    expectRoundTrip(operations['query-register'].outcomes.succeeded, registered)
    expectRoundTrip(operations['query-register'].outcomes['not-committed'], {})
    expect(readSample(operations.register.outcomes.succeeded, { workspace, instance }).ok).toBe(
      false,
    )
    expect(readSample(operations.register.outcomes.invalid, { reason: '' }).ok).toBe(false)
  })
})

describe('listing and describing', () => {
  const summary = { workspace, type: 'directory', standing: 'owner' }

  it('lists the workspaces of the tenant with its standing in each', () => {
    expectRoundTrip(operations.list.body, { tenant })
    expectRoundTrip(operations.list.outcomes.succeeded, { workspaces: [] })
    expectRoundTrip(operations.list.outcomes.succeeded, {
      workspaces: [
        summary,
        { ...summary, standing: 'participant' },
        { ...summary, standing: 'admin' },
      ],
    })
    expect(
      readSample(operations.list.outcomes.succeeded, {
        workspaces: [{ ...summary, standing: 'none' }],
      }).ok,
    ).toBe(false)
  })

  it('describes one workspace with each instance and what a look at it found', () => {
    expectRoundTrip(operations.describe.body, { tenant, workspace })
    expect(readSample(operations.describe.body, { tenant, workspace: '' }).ok).toBe(false)
    const at = (availability: unknown) => ({ instance, address: '/a', availability })
    expectRoundTrip(operations.describe.outcomes.succeeded, {
      ...summary,
      instances: [
        at({ kind: 'available', directory: '/a', basis: 'unpinned' }),
        at({ kind: 'unavailable', reason: 'not-found' }),
        at({ kind: 'unknown' }),
      ],
    })
    expectRoundTrip(operations.describe.outcomes['not-found'], {})
    for (const bad of [
      { kind: 'available', directory: '/a' },
      { kind: 'gone' },
      { kind: 'unavailable' },
    ])
      expect(
        readSample(operations.describe.outcomes.succeeded, { ...summary, instances: [at(bad)] }).ok,
      ).toBe(false)
  })
})

describe('changing who takes part, leaving and destroying', () => {
  const other = JSON.stringify({
    organization: 'org_00000000000000000000000001',
    account: 'acc_00000000000000000000000001',
  })
  const ending = { tenant, operation: 'op-2', workspace }

  it('a change to another tenant names the workspace and the target; its query takes the same body', () => {
    for (const change of ON_TARGET)
      for (const name of [change, `query-${change}`] as const) {
        const body = operations[name].body
        expectRoundTrip(body, { ...ending, target: other })
        for (const bad of [
          ending,
          { ...ending, target: 'nobody' },
          { ...ending, target: other, operation: '' },
          { ...ending, target: other, workspace: '' },
          { ...ending, target: other, extra: true },
        ])
          expect([name, bad, readSample(body, bad).ok]).toEqual([name, bad, false])
      }
  })

  it('leaving and destroying name the workspace and no target', () => {
    for (const change of ON_SELF)
      for (const name of [change, `query-${change}`] as const) {
        const body = operations[name].body
        expectRoundTrip(body, ending)
        for (const bad of [
          { ...ending, target: other },
          { tenant, operation: 'op-2' },
        ])
          expect([name, bad, readSample(body, bad).ok]).toEqual([name, bad, false])
      }
  })

  it('a change answers nothing, or a reason; its query answers whether it was committed', () => {
    for (const change of CHANGES) {
      const { outcomes } = operations[change]
      expectRoundTrip(outcomes.succeeded, {})
      expectRoundTrip(outcomes['no-change'], {})
      expectRoundTrip(outcomes.conflict, {})
      expectRoundTrip(outcomes.invalid, { reason: 'not-a-participant' })
      expect(readSample(outcomes.invalid, {}).ok).toBe(false)
      const query = operations[`query-${change}`].outcomes
      expectRoundTrip(query.succeeded, {})
      expectRoundTrip(query['not-committed'], {})
      expect(Object.keys(query)).not.toContain('invalid')
    }
  })
})

describe('associating and dissociating an instance', () => {
  const named = { tenant, operation: 'op-3', workspace }
  const associating = { ...named, address: '/work/feature' }
  const dissociating = { ...named, instance: 'wsi_00000000000000000000000002' }

  it('an association names the workspace and an address, and answers the instance; its query takes the same body', () => {
    for (const name of ['associate', 'query-associate'] as const) {
      expectRoundTrip(operations[name].body, associating)
      for (const bad of [named, { ...associating, address: 7 }, { ...associating, instance: 'x' }])
        expect([name, bad, readSample(operations[name].body, bad).ok]).toEqual([name, bad, false])
      expectRoundTrip(operations[name].outcomes.succeeded, { instance: dissociating.instance })
      expect(readSample(operations[name].outcomes.succeeded, {}).ok).toBe(false)
    }
    expectRoundTrip(operations.associate.outcomes['no-change'], { instance: dissociating.instance })
    expectRoundTrip(operations.associate.outcomes.invalid, { reason: 'not-the-same-resource' })
    expectRoundTrip(operations.associate.outcomes.conflict, {})
    expectRoundTrip(operations['query-associate'].outcomes['not-committed'], {})
  })

  it('a dissociation names the workspace and the instance, and answers nothing', () => {
    for (const name of ['dissociate', 'query-dissociate'] as const) {
      expectRoundTrip(operations[name].body, dissociating)
      for (const bad of [named, { ...dissociating, address: '/a' }])
        expect([name, bad, readSample(operations[name].body, bad).ok]).toEqual([name, bad, false])
      expectRoundTrip(operations[name].outcomes.succeeded, {})
    }
    expectRoundTrip(operations.dissociate.outcomes.invalid, { reason: 'not-found' })
  })
})
