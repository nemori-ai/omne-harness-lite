import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const read = sessionProtocol.operations['read-workspace-selection']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied', 'unknown']
const workspace = {
  workspace: 'wsp_00000000000000000000000001',
  instance: 'wsi_00000000000000000000000001',
}

describe('read-workspace-selection', () => {
  it('is a login read of the small limit that counts as access', () => {
    expect({
      identity: read.identity,
      effect: read.effect,
      limit: read.limit,
      counts: read.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'read', limit: 'small', counts: true })
    expect(
      Object.keys(read.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['not-found'])
  })

  it('names the session it reads, and nothing else', () => {
    expectRoundTrip(read.body, { tenant, session })
    for (const sample of [{ tenant }, { tenant, session, workspace }])
      expect(readSample(read.body, sample)).toEqual({ ok: false })
  })

  it('answers the workspace the session stands at, and the directory and state of its working directory', () => {
    const at = { revision: '7' }
    expectRoundTrip(read.outcomes.succeeded, {
      ...at,
      workspace,
      state: 'attached',
      directory: '/srv/blog',
      reason: null,
    })
    expectRoundTrip(read.outcomes.succeeded, {
      ...at,
      workspace: null,
      state: 'default',
      directory: '/srv/default',
      reason: null,
    })
    expectRoundTrip(read.outcomes.succeeded, {
      ...at,
      workspace,
      state: 'unusable',
      directory: null,
      reason: 'not-permitted',
    })
    for (const sample of [
      { ...at, workspace, state: 'other', directory: null, reason: null },
      { ...at, workspace, state: 'attached', directory: '', reason: null },
      {
        ...at,
        workspace: { workspace: workspace.workspace },
        state: 'default',
        directory: null,
        reason: null,
      },
      { workspace: null, state: 'default', directory: null, reason: null },
    ])
      expect(readSample(read.outcomes.succeeded, sample)).toEqual({ ok: false })
  })
})
