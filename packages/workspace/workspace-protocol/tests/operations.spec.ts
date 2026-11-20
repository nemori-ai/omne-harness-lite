import { describe, expect, it } from 'vitest'
import { workspaceProtocol } from '@omne-harness/workspace-protocol'
import { expectRoundTrip, readSample, tenant } from './fixtures/samples.ts'

const { operations, observations } = workspaceProtocol
const READS = ['query-register', 'list', 'describe']
const COMMITS = ['register']
const workspace = 'wsp_00000000000000000000000001'
const instance = 'wsi_00000000000000000000000001'
const registered = { workspace, instance, type: 'directory' }
const registration = { tenant, operation: 'op-1', address: '/Users/me/projects/blog' }

describe('workspace/v1', () => {
  it('is workspace major 1 with three reads, one commit and no observation', () => {
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
