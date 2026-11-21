import { describe, expect, it } from 'vitest'
import { sessionProtocol } from '@omne-harness/session-protocol'
import { expectRoundTrip, readSample, session, tenant } from './fixtures/samples.ts'

const select = sessionProtocol.operations['select-workspace']
const always = ['succeeded', 'protocol-rejected', 'basis-unavailable', 'denied', 'unknown']
const workspace = {
  workspace: 'wsp_00000000000000000000000001',
  instance: 'wsi_00000000000000000000000001',
}

describe('select-workspace', () => {
  it('is a login commit of the small limit that counts as access', () => {
    expect({
      identity: select.identity,
      effect: select.effect,
      limit: select.limit,
      counts: select.countsAsAccess,
    }).toEqual({ identity: 'login', effect: 'commit', limit: 'small', counts: true })
    expect(
      Object.keys(select.outcomes)
        .filter(name => !always.includes(name))
        .sort(),
    ).toEqual(['archived', 'conflict', 'frozen', 'invalid', 'not-found'])
  })

  it('names an instance of a workspace, or none, under a control identity', () => {
    expectRoundTrip(select.body, { tenant, session, controlId: 'control', workspace })
    expectRoundTrip(select.body, { tenant, session, controlId: 'control', workspace: null })
    for (const sample of [
      { tenant, session, controlId: 'control' },
      { tenant, session, controlId: '', workspace },
      { tenant, session, controlId: 'control', workspace: { ...workspace, instance: '' } },
      { tenant, session, controlId: 'control', workspace: { workspace: workspace.workspace } },
      { tenant, session, controlId: 'control', workspace: { ...workspace, directory: '/a' } },
      { tenant, session, controlId: 'control', workspace, extra: 1 },
    ])
      expect(readSample(select.body, sample)).toEqual({ ok: false })
  })

  it('answers the directory the session works in from its next step, or none', () => {
    expectRoundTrip(select.outcomes.succeeded, { controlId: 'control', directory: '/srv/blog' })
    expectRoundTrip(select.outcomes.succeeded, { controlId: 'control', directory: null })
    expect(readSample(select.outcomes.succeeded, { controlId: 'control' })).toEqual({ ok: false })
    expect(readSample(select.outcomes.succeeded, { controlId: 'control', directory: '' })).toEqual({
      ok: false,
    })
  })

  it('refuses a target Workspace did not verify with one of the two reasons', () => {
    for (const reason of ['not-permitted', 'instance-unavailable'])
      expectRoundTrip(select.outcomes.invalid, { reason })
    expect(readSample(select.outcomes.invalid, { reason: 'other' })).toEqual({ ok: false })
  })
})

describe('create-session with a workspace', () => {
  const create = sessionProtocol.operations['create-session']
  const base = { createCallId: 'create', purpose: '' }

  it('takes the instance the session starts in, or none', () => {
    expectRoundTrip(create.body, { ...base, workspace })
    expectRoundTrip(create.body, { ...base, definition: 'coding', workspace })
    for (const sample of [
      { ...base, workspace: null },
      { ...base, workspace: { workspace: workspace.workspace } },
      { ...base, workspace: { ...workspace, workspace: '' } },
      { ...base, workspace: 'wsp_00000000000000000000000001' },
    ])
      expect(readSample(create.body, sample)).toEqual({ ok: false })
  })
})
