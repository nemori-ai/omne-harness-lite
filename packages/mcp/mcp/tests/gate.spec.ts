// The gate the services walk through: `admitForUse` composes adoption, eligibility and the close
// of invariant 6 on the one decision of `admit`; the two tokens that come out cannot be forged.
import { describe, expect, it } from 'vitest'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import * as gateModule from '../src/internal/gate.ts'
import {
  admit,
  admitWithoutEligibility,
  adopted,
  assertAdmitted,
  judge,
  refusalOf,
  type AdmittedEndpoint,
  type AdoptedOnly,
} from '../src/internal/gate.ts'
import { admitForUse, stillAdmitted } from '../src/internal/guard.ts'
import { createConnectionTable } from '../src/internal/table.ts'
import { countedAdoption, countedEligibility } from './doubles/ports.ts'
import { alice, bob, home, json, mallory, peerIdentity, ref } from './doubles/values.ts'
import { TIMEOUT, VALUE, adoptStdio, settingsOf, world } from './doubles/world.ts'

const files = ref('files')
const nowhere = ref('nowhere')
const body = json({ name: 'files', transport: 'streamable-http', auth: 'none' })

function ports() {
  const adoption = countedAdoption()
  const eligibility = countedEligibility()
  adoption.adopt({ tenant: home, scope: 'ws', ref: files, body })
  return { adoption, eligibility }
}

/** The use gate on a world whose transport script connects once. */
function gateOf(w = world({ script: [{ discover: peerIdentity() }] })) {
  const table = createConnectionTable(w.ports, w.config)
  return { w, table, gate: { ports: w.ports, table } }
}

describe('admitForUse: the six answers of SPEC S1', () => {
  it('admits an adopted endpoint that the principal is eligible for', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    const admitted = await admitForUse(gate, alice, files)
    if (!('ok' in admitted)) throw new Error('not admitted')
    expect(admitted.ok.ref).toEqual(files)
    expect(admitted.ok.definition.transport.kind).toBe('stdio')
    expect(() => assertAdmitted(admitted.ok)).not.toThrow()
  })

  it('answers not-available-to-you for an endpoint that is not adopted, without asking eligibility', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    w.eligibility.grant(alice, nowhere)
    expect(await admitForUse(gate, alice, nowhere)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(w.eligibility.calls()).toBe(0)
  })

  it('answers unknown when the adoption cannot be read, before asking eligibility', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    w.adoption.setUnreadable(true)
    expect(await admitForUse(gate, alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(w.eligibility.calls()).toBe(0)
  })

  it('answers unknown for an adopted body it cannot read', async () => {
    const { w, gate } = gateOf()
    w.adoption.adopt({ tenant: home, scope: 'ws', ref: files, body: json({ nonsense: 1 }) })
    w.eligibility.grant(alice, files)
    expect(await admitForUse(gate, alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('answers not-available-to-you to a principal without eligibility', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    expect(await admitForUse(gate, bob, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
  })

  it('answers the same to an outsider for an adopted and a missing endpoint', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    const forAdopted = await admitForUse(gate, mallory, files)
    const forMissing = await admitForUse(gate, mallory, nowhere)
    expect(forAdopted).toEqual({ failure: { kind: 'not-available-to-you' } })
    expect(forMissing).toEqual(forAdopted)
  })

  it.each(['local-command-not-enabled', 'disabled'] as const)(
    'answers blocked with %s to an eligible principal a setting blocks',
    async reason => {
      const { w, gate } = gateOf()
      adoptStdio(w, files)
      w.eligibility.block(alice, files, reason)
      expect(await admitForUse(gate, alice, files)).toEqual({
        failure: { kind: 'blocked', reason },
      })
    },
  )

  it('answers unknown when eligibility cannot be decided', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    w.eligibility.setUnreadable(alice, files, true)
    expect(await admitForUse(gate, alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('asks the adoption once and eligibility once for an admitted endpoint', async () => {
    const { w, gate } = gateOf()
    adoptStdio(w, files)
    await admitForUse(gate, alice, files)
    expect(w.adoption.calls()).toBe(1)
    expect(w.eligibility.calls()).toBe(1)
  })
})

describe('admitForUse: the close of invariant 6', () => {
  async function connected() {
    const { w, gate, table } = gateOf()
    adoptStdio(w, files)
    const admitted = await admitForUse(gate, alice, files)
    if (!('ok' in admitted)) throw new Error('not admitted')
    const ensured = await table.ensure(admitted.ok, alice)
    if (!('ok' in ensured)) throw new Error('not connected')
    return { w, gate, table }
  }

  it('closes the connection of an endpoint a setting blocks (endpoint-level)', async () => {
    const { w, gate, table } = await connected()
    w.eligibility.block(alice, files, 'disabled')
    expect(await admitForUse(gate, alice, files)).toEqual({
      failure: { kind: 'blocked', reason: 'disabled' },
    })
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
    expect(w.trace).toEqual(['transport.close', 'process.stop'])
  })

  it('closes the connection of an endpoint that was withdrawn', async () => {
    const { w, gate, table } = await connected()
    w.adoption.withdraw(home, files)
    expect(await admitForUse(gate, alice, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'none' })
  })

  it('does not close for a principal without eligibility, nor for an unknown answer', async () => {
    const { w, gate, table } = await connected()
    expect(await admitForUse(gate, bob, files)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    w.eligibility.setUnreadable(alice, files, true)
    expect(await admitForUse(gate, alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(table.stateOf(alice.tenant, files.holding)).toEqual({ kind: 'ready' })
    expect(w.trace).toEqual([])
  })
})

describe('stillAdmitted: the gate at the publish boundary', () => {
  it('is admitted on the same revision, superseded on a newer one, refused like the gate', async () => {
    const { w, gate } = gateOf()
    const adopted = adoptStdio(w, files)
    expect(await stillAdmitted(gate, alice, files, adopted.revision)).toEqual({ ok: 'admitted' })
    const updated = w.adoption.update(home, files, { processEnv: [{ name: 'X', value: '1' }] })
    expect(await stillAdmitted(gate, alice, files, adopted.revision)).toEqual({ ok: 'superseded' })
    expect(await stillAdmitted(gate, alice, files, updated.revision)).toEqual({ ok: 'admitted' })
    w.eligibility.revoke(alice, files)
    expect(await stillAdmitted(gate, alice, files, updated.revision)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
  })
})

describe('admit: the decision the services compose on', () => {
  it('names every outcome, and refusalOf maps each to its S1 refusal', async () => {
    const { adoption, eligibility } = ports()
    expect(await admit({ adoption, eligibility }, alice, nowhere)).toEqual({ kind: 'not-adopted' })
    expect(await admit({ adoption, eligibility }, bob, files)).toMatchObject({
      kind: 'not-eligible',
    })
    eligibility.block(alice, files, 'disabled')
    expect(await admit({ adoption, eligibility }, alice, files)).toMatchObject({
      kind: 'blocked',
      reason: 'disabled',
    })
    eligibility.grant(alice, files)
    eligibility.setUnreadable(alice, files, true)
    expect(await admit({ adoption, eligibility }, alice, files)).toMatchObject({
      kind: 'eligibility-unknown',
    })
    adoption.setUnreadable(true)
    expect(await admit({ adoption, eligibility }, alice, files)).toEqual({
      kind: 'adoption-unknown',
    })
    expect(refusalOf({ kind: 'not-adopted' })).toEqual({ kind: 'not-available-to-you' })
    expect(refusalOf({ kind: 'adoption-unknown' })).toEqual({ kind: 'unknown' })
    expect(refusalOf({ kind: 'body-unreadable' })).toEqual({ kind: 'unknown' })
  })
})

describe('admitWithoutEligibility', () => {
  it('hands out an adopted-only token without asking eligibility', async () => {
    const { adoption, eligibility } = ports()
    const token = await admitWithoutEligibility({ adoption }, bob, files)
    if (!('ok' in token)) throw new Error('not adopted')
    expect(token.ok.definition.auth).toBe('none')
    expect(() => assertAdmitted(token.ok)).toThrow(TypeError)
    expect(eligibility.calls()).toBe(0)
  })

  it('still answers not-available-to-you and unknown from the adoption', async () => {
    const { adoption } = ports()
    expect(await admitWithoutEligibility({ adoption }, alice, nowhere)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    adoption.setUnreadable(true)
    expect(await admitWithoutEligibility({ adoption }, alice, files)).toEqual({
      failure: { kind: 'unknown' },
    })
  })
})

describe('AdmittedEndpoint', () => {
  it('cannot be forged: the port object, a copy and a copy of the token all throw TypeError', async () => {
    const { adoption, eligibility } = ports()
    eligibility.grant(alice, files)
    const answer = await adoption.endpoint(alice, files)
    if (!('ok' in answer) || answer.ok === 'not-adopted') throw new Error('not adopted')
    const adopted: AdoptedEndpoint = answer.ok
    expect(() => assertAdmitted(adopted)).toThrow(TypeError)
    expect(() => assertAdmitted({ ...adopted })).toThrow(TypeError)
    const decision = await admit({ adoption, eligibility }, alice, files)
    if (decision.kind !== 'admitted') throw new Error('not admitted')
    const token: AdmittedEndpoint = decision.endpoint
    expect(() => assertAdmitted(token)).not.toThrow()
    expect(() => assertAdmitted({ ...token })).toThrow(TypeError)
  })
})

describe('judge: only a token this gate handed out', () => {
  it('throws TypeError for a copy of an adopted-only token with another definition, and starts nothing', async () => {
    const w = world({ script: [{ discover: peerIdentity() }] })
    adoptStdio(w, files)
    const shell = ref('shell')
    w.adoption.adopt({
      tenant: home,
      scope: 'ws',
      ref: shell,
      body: json({
        name: 'shell',
        transport: 'stdio',
        auth: 'none',
        launch: { command: 'not-the-adopted-command' },
      }),
      settings: settingsOf({ connectTimeout: VALUE(TIMEOUT) }),
    })
    const own = await adopted(w.ports, alice, files)
    const other = await adopted(w.ports, alice, shell)
    if (!('ok' in own) || !('ok' in other)) throw new Error('not adopted')
    const forged: AdoptedOnly = Object.freeze({
      ...own.ok,
      definition: other.ok.definition,
    }) as AdoptedOnly
    await expect(judge(w.ports, alice, forged)).rejects.toThrow(TypeError)
    expect(w.landing.started()).toEqual([])
    expect(w.eligibility.calls()).toBe(0)
  })

  it('keeps the token constructor inside the module', () => {
    expect('adoptedOnlyOf' in gateModule).toBe(false)
  })
})
