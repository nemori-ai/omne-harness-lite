// The gate: the six answers of `admit` in the order of SPEC S1, the capability token that only
// the gate grants, and the eligibility-free variant for task operations.
import { describe, expect, it } from 'vitest'
import type { AdoptedEndpoint } from '@omne-harness/mcp-contract/provider'
import { admit, admitWithoutEligibility, assertAdmitted } from '../src/internal/gate.ts'
import { countedAdoption, countedEligibility } from './doubles/ports.ts'
import { alice, bob, home, json, mallory, ref } from './doubles/values.ts'

const files = ref('files')
const nowhere = ref('nowhere')
const body = json({ name: 'files', transport: 'streamable-http', auth: 'none' })

function world() {
  const adoption = countedAdoption()
  const eligibility = countedEligibility()
  adoption.adopt({ tenant: home, scope: 'ws', ref: files, body })
  return { adoption, eligibility, ports: { adoption, eligibility } }
}

describe('admit', () => {
  it('admits an adopted endpoint that the principal is eligible for', async () => {
    const { ports, eligibility } = world()
    eligibility.grant(alice, files)
    const admitted = await admit(ports, alice, files)
    expect('ok' in admitted).toBe(true)
    if (!('ok' in admitted)) return
    expect(admitted.ok.ref).toEqual(files)
    expect(admitted.ok.body).toEqual(body)
    expect(() => assertAdmitted(admitted.ok)).not.toThrow()
  })

  it('answers not-available-to-you for an endpoint that is not adopted', async () => {
    const { ports } = world()
    expect(await admit(ports, alice, nowhere)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
  })

  it('does not ask eligibility when the endpoint is not adopted', async () => {
    const { ports, eligibility } = world()
    eligibility.grant(alice, nowhere)
    await admit(ports, alice, nowhere)
    expect(eligibility.calls()).toBe(0)
  })

  it('answers unknown when the adoption cannot be read, before asking eligibility', async () => {
    const { ports, adoption, eligibility } = world()
    eligibility.grant(alice, files)
    adoption.setUnreadable(true)
    expect(await admit(ports, alice, files)).toEqual({ failure: { kind: 'unknown' } })
    expect(eligibility.calls()).toBe(0)
  })

  it('answers not-available-to-you to a principal without eligibility', async () => {
    const { ports } = world()
    expect(await admit(ports, bob, files)).toEqual({ failure: { kind: 'not-available-to-you' } })
  })

  it('answers the same to an outsider for an adopted and a missing endpoint', async () => {
    const { ports } = world()
    const forAdopted = await admit(ports, mallory, files)
    const forMissing = await admit(ports, mallory, nowhere)
    expect(forAdopted).toEqual({ failure: { kind: 'not-available-to-you' } })
    expect(forMissing).toEqual(forAdopted)
  })

  it.each(['local-command-not-enabled', 'disabled'] as const)(
    'answers blocked with %s to an eligible principal a setting blocks',
    async reason => {
      const { ports, eligibility } = world()
      eligibility.block(alice, files, reason)
      expect(await admit(ports, alice, files)).toEqual({ failure: { kind: 'blocked', reason } })
    },
  )

  it('answers unknown when eligibility cannot be decided', async () => {
    const { ports, eligibility } = world()
    eligibility.grant(alice, files)
    eligibility.setUnreadable(alice, files, true)
    expect(await admit(ports, alice, files)).toEqual({ failure: { kind: 'unknown' } })
  })

  it('asks the adoption once and eligibility once for an admitted endpoint', async () => {
    const { ports, adoption, eligibility } = world()
    eligibility.grant(alice, files)
    await admit(ports, alice, files)
    expect(adoption.calls()).toBe(1)
    expect(eligibility.calls()).toBe(1)
  })
})

describe('admitWithoutEligibility', () => {
  it('admits an adopted endpoint without asking eligibility', async () => {
    const { ports, eligibility } = world()
    const admitted = await admitWithoutEligibility(ports, bob, files)
    expect('ok' in admitted).toBe(true)
    if ('ok' in admitted) expect(() => assertAdmitted(admitted.ok)).not.toThrow()
    expect(eligibility.calls()).toBe(0)
  })

  it('still answers not-available-to-you and unknown from the adoption', async () => {
    const { ports, adoption } = world()
    expect(await admitWithoutEligibility(ports, alice, nowhere)).toEqual({
      failure: { kind: 'not-available-to-you' },
    })
    adoption.setUnreadable(true)
    expect(await admitWithoutEligibility(ports, alice, files)).toEqual({
      failure: { kind: 'unknown' },
    })
  })
})

describe('AdmittedEndpoint', () => {
  it('cannot be forged: an adopted endpoint that did not pass the gate throws TypeError', async () => {
    const { adoption } = world()
    const answer = await adoption.endpoint(alice, files)
    if (!('ok' in answer) || answer.ok === 'not-adopted') throw new Error('not adopted')
    const adopted: AdoptedEndpoint = answer.ok
    const forged: AdoptedEndpoint = { ...adopted }
    expect(() => assertAdmitted(forged)).toThrow(TypeError)
    expect(() => assertAdmitted(adopted)).toThrow(TypeError)
  })

  it('is not the port object: a copy of the token is not admitted either', async () => {
    const { ports, eligibility } = world()
    eligibility.grant(alice, files)
    const admitted = await admit(ports, alice, files)
    if (!('ok' in admitted)) throw new Error('not admitted')
    expect(() => assertAdmitted({ ...admitted.ok })).toThrow(TypeError)
  })
})
