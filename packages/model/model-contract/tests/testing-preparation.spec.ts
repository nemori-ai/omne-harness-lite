import { describe, expect, it } from 'vitest'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import { judgeMessage, parseMessageId, type Message } from '@omne-harness/message'
import type { Modality } from '@omne-harness/modality'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeRevision,
  type Adoption,
  type AssembledModelInput,
  type DurableEvidence,
  type FixedModelRequest,
  type ModalityRequirement,
  type ModelProfile,
  type Parameter,
  type ParameterAdoption,
  type ProfileSupplier,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import {
  decodeCredentialId,
  judgeReplayDeclaration,
  type ModelTransport,
  type PreparedTransport,
  type TransportDispatch,
} from '@omne-harness/model-contract/provider'
import {
  createScriptedModelRequestPreparation,
  ScriptedModelError,
  type ScriptedModelPreparationMatch,
  type ScriptedModelPreparationPlan,
} from '@omne-harness/model-contract/testing'

function mint(organization: string, account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${organization.padStart(26, '0')}`,
      account: `acc_${account.padStart(26, '0')}`,
    }),
  )
  if (!parsed.ok) throw new Error('Invalid tenant fixture')
  return parsed.value
}
function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

/** A principal with a method: the double keeps it by reference and compares it by identity. */
class Agent {
  readonly name: string
  constructor(name: string) {
    this.name = name
  }
  greet(): string {
    return `hello ${this.name}`
  }
}

const adoption = (name: string): Adoption => ({ owner: 'test', name, revision: '1', digest: 'd' })
const evidence = (label: string): DurableEvidence => ({
  owner: 'test',
  record: label,
  revision: '1',
  digest: `digest-${label}`,
})
const requirement = (modalities: readonly [Modality, ...Modality[]] = ['text']) => ({
  modalities,
  source: evidence('modality'),
})

function schema(): JsonValue {
  const read = readJsonText('{"type":"object"}', {
    maxBytes: 256,
    maxDepth: 4,
    maxItems: 8,
    maxMembers: 8,
    maxStringLength: 64,
    maxNumberLength: 8,
  })
  if (read.kind !== 'ok') throw new Error('Invalid schema fixture')
  return read.value
}

function block(id: string, text: string): ContentBlock {
  const judged = judgeContentBlock({
    kind: 'text',
    id,
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if (!('ok' in judged)) throw new Error('Invalid block fixture')
  return judged.ok
}
function message(name: string, text: string): Message {
  const id = parseMessageId(`msg_${name.padEnd(22, 'x')}`)
  if (!id.ok) throw new Error('Invalid message id fixture')
  const judged = judgeMessage({ id: id.value, role: 'user', blocks: [block(`b-${name}`, text)] })
  if (!('ok' in judged)) throw new Error('Invalid message fixture')
  return judged.ok
}

const first: ProfileSupplier = { adoption: adoption('first'), recipient: 'east', model: 'm1' }
const second: ProfileSupplier = {
  adoption: adoption('second'),
  recipient: 'west',
  model: 'm2',
  replay: { produces: 'west/shared', accepts: ['west/shared', 'east/m1'], foreignThinking: 'text' },
}

function profileOf(
  over: Readonly<{
    suppliers?: readonly [ProfileSupplier, ...ProfileSupplier[]]
    availability?: ModelProfile['availability']
    scope?: ModelProfile['identity']['scope']
  }> = {},
): ModelProfile {
  const upstream = [{ supplier: adoption('first'), limit: { kind: 'unknown' } }] as const
  return {
    identity: { scope: over.scope ?? { kind: 'factory' }, route: 'default' },
    adoption: adoption('profile'),
    revision: must(decodeRevision('1')),
    updatedAt: '2026-11-01T00:00:00Z',
    availability: over.availability ?? 'active',
    definition: {
      suppliers: over.suppliers ?? [first, second],
      fallback: true,
      input: ['text', 'image'],
      output: ['text'],
      context: {
        window: { provided: '100', upstream },
        input: null,
        output: { provided: '10', upstream },
        compactionTriggerPercent: '80',
      },
      limits: [],
      parameters: [],
      representation: adoption('representation'),
      meter: adoption('meter'),
      retryPolicy: adoption('retry'),
    },
  }
}

const tenantCredential = () =>
  ({ kind: 'tenant', id: must(decodeCredentialId('cred-tenant')) }) as const
const bound = (supplier: ProfileSupplier, credential: Supplier['credential']): Supplier => ({
  adoption: supplier.adoption,
  recipient: supplier.recipient,
  model: supplier.model,
  credential,
})

const temperature = { kind: 'temperature', value: 0.5 } as const
const topP = { kind: 'top-p', value: 0.9 } as const
/** One explicit adoption of `parameter` for each supplier of the profile, in supplier order. */
const explicitFor = (parameter: Parameter): ParameterAdoption[] =>
  [first, second].map(supplier => ({
    supplier: supplier.adoption,
    applied: parameter,
    origin: { kind: 'explicit', requested: parameter, source: adoption('rules') },
  }))
const adoptions = (): ParameterAdoption[] => explicitFor(temperature)

/** The script misuse that a refused registration throws, with the message that names its check. */
const misuseOf = (message: string) => ({ reason: 'invalid-script', message })

const plan = (): ScriptedModelPreparationPlan => ({
  suppliers: [bound(first, tenantCredential()), bound(second, { kind: 'factory' })],
  parameterAdoptions: adoptions(),
})

function assembled(over: Partial<AssembledModelInput> = {}): AssembledModelInput {
  return {
    system: [block('system', 'Be brief.')],
    messages: [message('one', 'one'), message('two', 'two')],
    tools: [],
    toolChoice: 'none',
    parameters: [temperature],
    representation: adoption('representation'),
    source: adoption('source'),
    ...over,
  }
}

type Lease = Readonly<{
  prepared: PreparedTransport
  closes: () => number
}>

type Step =
  | Readonly<{ kind: 'ok'; close?: () => Promise<void> }>
  | Readonly<{ kind: 'fail'; failure: TransportFailure }>
  | Readonly<{ kind: 'throw'; error: Error }>

/**
 * A transport made for these tests: each prepare follows the next step and hands out a new
 * prepared object, so that the leases of two calls can be told apart.
 */
function recordingTransport(steps: readonly Step[] = []) {
  const seen: { request: FixedModelRequest; supplier: Supplier; dispatch: TransportDispatch }[] = []
  const leases: Lease[] = []
  let materialize = 0
  const transport: ModelTransport = {
    async prepare(request, supplier, dispatch) {
      seen.push({ request, supplier, dispatch })
      const step = steps[seen.length - 1] ?? { kind: 'ok' }
      if (step.kind === 'throw') throw step.error
      if (step.kind === 'fail') return fail(step.failure)
      let closes = 0
      const prepared: PreparedTransport = {
        async materialize() {
          materialize += 1
          throw new Error('a preparation must not materialize')
        },
        async close() {
          closes += 1
          if (step.close !== undefined) await step.close()
        },
      }
      leases.push({ prepared, closes: () => closes })
      return succeed(prepared)
    },
  }
  return { transport, seen, leases, materialized: () => materialize }
}

function setup(steps: readonly Step[] = []) {
  const principal = new Agent('alice')
  const access: Access<Agent> = { tenant: mint('1', '1'), principal }
  const recorded = recordingTransport(steps)
  const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
  scripted.setAccess(access, 'allow')
  const profile = profileOf()
  const required: ModalityRequirement = requirement()
  scripted.setPlan({ ...access, profile, required, parameters: [temperature] }, { ok: plan() })
  const prepare = (input: Partial<AssembledModelInput> = {}) =>
    scripted.preparation.prepare({ ...access, profile, required, assembled: assembled(input) })
  return { access, scripted, recorded, profile, required, prepare }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

function scriptMisuse(run: () => void): ScriptedModelError {
  try {
    run()
  } catch (error) {
    if (error instanceof ScriptedModelError) return error
    throw error
  }
  throw new Error('expected a script misuse')
}

describe('the request comes from the assembled input of each call (M10)', () => {
  it('forms a new request for each call of the same plan and hands that request to the transport', async () => {
    const { scripted, recorded, prepare } = setup()
    const tool = { name: 'read', description: 'reads', argumentsSchema: schema() }
    const firstInput = assembled()
    const secondInput = assembled({
      messages: [message('two', 'two')],
      tools: [tool],
      toolChoice: { name: 'read' },
      replay: 'off',
      representation: adoption('compact'),
      source: adoption('compressed'),
    })
    const before = must(await prepare(firstInput))
    const after = must(await prepare(secondInput))
    for (const [request, input] of [
      [before, firstInput],
      [after, secondInput],
    ] as const) {
      expect(request.messages).toEqual(input.messages)
      expect(request.system).toEqual(input.system)
      expect(request.tools).toEqual(input.tools)
      expect(request.toolChoice).toEqual(input.toolChoice)
      expect(request.parameters).toEqual(input.parameters)
      expect(request.representation).toEqual(input.representation)
      expect(request.source).toEqual(input.source)
    }
    expect('replay' in before).toBe(false)
    expect(after.replay).toBe('off')
    expect(recorded.seen.map(item => item.request)).toEqual([before, after])
    expect(recorded.seen[0]?.request).toBe(before)
    expect(recorded.seen[1]?.supplier).toEqual(after.suppliers[0])
    expect(recorded.seen[1]?.dispatch).toEqual({ resent: [] })
    expect(Object.isFrozen(after)).toBe(true)
    const calls = scripted.calls()
    expect(calls.map(call => call.sequence)).toEqual([1, 2])
    expect(calls[0]?.input.assembled).toEqual(firstInput)
    expect(calls[1]?.input.assembled).toEqual(secondInput)
  })

  it('takes the profile adoption, fallback and retry policy of the profile', async () => {
    const { prepare, profile } = setup()
    const request = must(await prepare())
    expect(request.profile).toEqual(profile.adoption)
    expect(request.fallback).toBe(true)
    expect(request.retryPolicy).toEqual(profile.definition.retryPolicy)
  })

  it('keeps the input it recorded when the caller later changes its objects', async () => {
    const { scripted, prepare } = setup()
    const messages = [message('one', 'one')]
    await prepare({ messages })
    messages.push(message('late', 'late'))
    expect(scripted.calls()[0]?.input.assembled.messages).toHaveLength(1)
  })
})

describe('suppliers and parameter adoptions (M11)', () => {
  it('keeps the order of the suppliers, the tenant credential and the adoptions of the plan', async () => {
    const { prepare } = setup()
    const request = must(await prepare())
    expect(request.suppliers).toEqual(plan().suppliers)
    expect(request.suppliers[0].credential).toEqual(tenantCredential())
    expect(request.suppliers[1]?.credential).toEqual({ kind: 'factory' })
    expect(request.parameterAdoptions).toEqual(adoptions())
  })

  it('refuses a plan that drops, reorders or replaces a supplier or lacks an explicit adoption', async () => {
    const { scripted, access, profile, required, prepare } = setup()
    const match = { ...access, profile, required, parameters: [temperature] }
    const [one, two] = plan().suppliers
    if (two === undefined) throw new Error('expected two suppliers')
    const wrong: ScriptedModelPreparationPlan[] = [
      { ...plan(), suppliers: [one] },
      { ...plan(), suppliers: [two, one] },
      { ...plan(), suppliers: [{ ...one, model: 'other' }, two] },
      { ...plan(), parameterAdoptions: adoptions().slice(0, 1) },
      { ...plan(), parameterAdoptions: [] },
    ]
    for (const answer of wrong) {
      const error = scriptMisuse(() => scripted.setPlan(match, { ok: answer }))
      expect(error.reason).toBe('invalid-script')
    }
    expect(must(await prepare()).suppliers).toEqual(plan().suppliers)
  })

  it('accepts a plan that adopts two asked parameters explicitly for each supplier', async () => {
    const { scripted, access, profile, required } = setup()
    const parameters = [temperature, topP]
    const parameterAdoptions = [...adoptions(), ...explicitFor(topP)]
    scripted.setPlan(
      { ...access, profile, required, parameters },
      { ok: { ...plan(), parameterAdoptions } },
    )
    const request = must(
      await scripted.preparation.prepare({
        ...access,
        profile,
        required,
        assembled: assembled({ parameters }),
      }),
    )
    expect(request.parameterAdoptions).toEqual(parameterAdoptions)
  })
})

/**
 * Each check of a plan registration has one case whose plan breaks that check alone. The case
 * asserts the message that names the check and that the plan registered before is still used.
 */
describe('each plan check has a case that breaks only it (M11)', () => {
  function planned() {
    const fixture = setup()
    const { scripted, access, profile, required, prepare } = fixture
    const match = { ...access, profile, required, parameters: [temperature] }
    const [one, two] = plan().suppliers
    if (two === undefined) throw new Error('expected two suppliers')
    const refuse = (
      answer: ScriptedModelPreparationPlan,
      over: Partial<ScriptedModelPreparationMatch<Agent>> = {},
    ) => scriptMisuse(() => scripted.setPlan({ ...match, ...over }, { ok: answer }))
    const keptEarlier = async () =>
      expect(must(await prepare()).suppliers).toEqual(plan().suppliers)
    return { one, two, refuse, keptEarlier }
  }

  it('refuses a plan whose profile belongs to another tenant', async () => {
    const { refuse, keptEarlier } = planned()
    const profile = profileOf({ scope: { kind: 'tenant', tenant: mint('2', '3') } })
    expect(refuse(plan(), { profile })).toMatchObject(
      misuseOf('the planned profile scope does not apply to the tenant'),
    )
    await keptEarlier()
  })

  it('refuses a plan whose profile belongs to another organization', async () => {
    const { refuse, keptEarlier } = planned()
    const scope = { kind: 'organization', organization: mint('2', '3').organization } as const
    expect(refuse(plan(), { profile: profileOf({ scope }) })).toMatchObject(
      misuseOf('the planned profile scope does not apply to the tenant'),
    )
    await keptEarlier()
  })

  it('refuses a plan whose profile scope holds an organization that is not minted', async () => {
    const { refuse, keptEarlier } = planned()
    const organization = structuredClone(mint('1', '1').organization)
    const profile = profileOf({ scope: { kind: 'organization', organization } })
    expect(refuse(plan(), { profile })).toMatchObject(
      misuseOf('the planned profile scope holds an identity that is not minted'),
    )
    await keptEarlier()
  })

  it('refuses a plan whose profile is withdrawn', async () => {
    const { refuse, keptEarlier } = planned()
    const profile = profileOf({ availability: 'withdrawn' })
    expect(refuse(plan(), { profile })).toMatchObject(misuseOf('a planned profile must be active'))
    await keptEarlier()
  })

  it('refuses a plan whose profile does not cover the required modalities', async () => {
    const { refuse, keptEarlier } = planned()
    expect(refuse(plan(), { required: requirement(['text', 'video']) })).toMatchObject(
      misuseOf('the planned profile does not cover the input'),
    )
    await keptEarlier()
  })

  it('refuses a plan that binds fewer suppliers than the profile has', async () => {
    const { one, refuse, keptEarlier } = planned()
    expect(refuse({ ...plan(), suppliers: [one] })).toMatchObject(
      misuseOf('the plan must bind every supplier of the profile'),
    )
    await keptEarlier()
  })

  it('refuses a plan that binds more suppliers than the profile has', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    expect(refuse({ ...plan(), suppliers: [one, two, two] })).toMatchObject(
      misuseOf('the plan must bind every supplier of the profile'),
    )
    await keptEarlier()
  })

  it('refuses a planned supplier with a field that a bound supplier does not have', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const widened = { ...one, region: 'eu' } as Supplier
    expect(refuse({ ...plan(), suppliers: [widened, two] })).toMatchObject(
      misuseOf(
        'a planned supplier has a field other than adoption, recipient, model and credential',
      ),
    )
    await keptEarlier()
  })

  it('refuses a planned supplier with another adoption than the profile supplier at its position', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const replaced = { ...one, adoption: adoption('other') }
    expect(refuse({ ...plan(), suppliers: [replaced, two] })).toMatchObject(
      misuseOf('a planned supplier has another adoption than the profile supplier at its position'),
    )
    await keptEarlier()
  })

  it('refuses a planned supplier with another recipient than the profile supplier at its position', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const replaced = { ...one, recipient: 'north' }
    expect(refuse({ ...plan(), suppliers: [replaced, two] })).toMatchObject(
      misuseOf(
        'a planned supplier has another recipient than the profile supplier at its position',
      ),
    )
    await keptEarlier()
  })

  it('refuses a planned supplier with another model than the profile supplier at its position', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const replaced = { ...one, model: 'other' }
    expect(refuse({ ...plan(), suppliers: [replaced, two] })).toMatchObject(
      misuseOf('a planned supplier has another model than the profile supplier at its position'),
    )
    await keptEarlier()
  })

  it('refuses a planned supplier without a credential', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const bare = { adoption: one.adoption, recipient: one.recipient, model: one.model } as Supplier
    expect(refuse({ ...plan(), suppliers: [bare, two] })).toMatchObject(
      misuseOf('a planned supplier needs its credential'),
    )
    await keptEarlier()
  })

  it('refuses a planned credential of a kind that is neither tenant nor factory', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const credential = { kind: 'shared' } as unknown as Supplier['credential']
    expect(refuse({ ...plan(), suppliers: [{ ...one, credential }, two] })).toMatchObject(
      misuseOf('a planned credential is neither a tenant nor a factory binding'),
    )
    await keptEarlier()
  })

  it('refuses a planned credential with a field that its kind does not have', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const credential = {
      kind: 'factory',
      id: must(decodeCredentialId('cred-tenant')),
    } as unknown as Supplier['credential']
    expect(refuse({ ...plan(), suppliers: [one, { ...two, credential }] })).toMatchObject(
      misuseOf('a planned credential does not have exactly the fields of its kind'),
    )
    await keptEarlier()
  })

  it('refuses a planned tenant credential whose id does not decode', async () => {
    const { one, two, refuse, keptEarlier } = planned()
    const credential = { kind: 'tenant', id: '' } as unknown as Supplier['credential']
    expect(refuse({ ...plan(), suppliers: [{ ...one, credential }, two] })).toMatchObject(
      misuseOf('a planned tenant credential id does not decode'),
    )
    await keptEarlier()
  })

  it('refuses a parameter adoption whose supplier is not in the plan', async () => {
    const { refuse, keptEarlier } = planned()
    const stranger: ParameterAdoption = {
      supplier: adoption('stranger'),
      applied: temperature,
      origin: { kind: 'explicit', requested: temperature, source: adoption('rules') },
    }
    expect(refuse({ ...plan(), parameterAdoptions: [...adoptions(), stranger] })).toMatchObject(
      misuseOf('a parameter adoption names a supplier outside the plan'),
    )
    await keptEarlier()
  })

  it('refuses an explicit adoption of a parameter that the input does not ask for', async () => {
    const { refuse, keptEarlier } = planned()
    const parameterAdoptions = [...adoptions(), ...explicitFor(topP).slice(0, 1)]
    expect(refuse({ ...plan(), parameterAdoptions })).toMatchObject(
      misuseOf('an explicit adoption names a parameter that the input does not ask for'),
    )
    await keptEarlier()
  })

  it('refuses a plan in which an asked parameter lacks an explicit adoption for a supplier', async () => {
    const { refuse, keptEarlier } = planned()
    expect(refuse({ ...plan(), parameterAdoptions: adoptions().slice(0, 1) })).toMatchObject(
      misuseOf('an asked parameter has no explicit adoption for a supplier'),
    )
    await keptEarlier()
  })

  it('does not count a default adoption as the explicit adoption of an asked parameter', async () => {
    const { refuse, keptEarlier } = planned()
    const [explicit] = adoptions()
    if (explicit === undefined) throw new Error('expected an adoption')
    const byDefault: ParameterAdoption = {
      supplier: second.adoption,
      applied: temperature,
      origin: { kind: 'default', source: adoption('rules') },
    }
    expect(refuse({ ...plan(), parameterAdoptions: [explicit, byDefault] })).toMatchObject(
      misuseOf('an asked parameter has no explicit adoption for a supplier'),
    )
    await keptEarlier()
  })

  it('does not count the explicit adoption of another asked parameter for the same supplier', async () => {
    const { refuse, keptEarlier } = planned()
    const parameterAdoptions = [...adoptions(), ...explicitFor(topP).slice(0, 1)]
    expect(
      refuse({ ...plan(), parameterAdoptions }, { parameters: [temperature, topP] }),
    ).toMatchObject(misuseOf('an asked parameter has no explicit adoption for a supplier'))
    await keptEarlier()
  })
})

describe('replay declarations (M12)', () => {
  it('expands each declaration with the real judge, in the order of the suppliers', async () => {
    const { prepare, profile } = setup()
    const request = must(await prepare())
    expect(request.declarations).toEqual(
      profile.definition.suppliers.map((supplier, index) =>
        must(judgeReplayDeclaration(supplier, index)),
      ),
    )
    expect(request.declarations[0]).toEqual({
      produces: 'east/m1',
      accepts: ['east/m1'],
      foreignThinking: 'omit',
    })
  })

  it('returns the failure of an invalid declaration and prepares no transport', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: mint('1', '1'), principal }
    const recorded = recordingTransport()
    const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
    scripted.setAccess(access, 'allow')
    const broken: ProfileSupplier = { ...second, replay: { produces: 'a/b', accepts: ['c/d'] } }
    const profile = profileOf({ suppliers: [first, broken] })
    const required = requirement()
    scripted.setPlan(
      { ...access, profile, required, parameters: [temperature] },
      {
        ok: {
          suppliers: [bound(first, { kind: 'factory' }), bound(broken, { kind: 'factory' })],
          parameterAdoptions: adoptions(),
        },
      },
    )
    const outcome = await scripted.preparation.prepare({
      ...access,
      profile,
      required,
      assembled: assembled(),
    })
    const judged = judgeReplayDeclaration(broken, 1)
    expect('failure' in judged).toBe(true)
    expect(outcome).toEqual(judged)
    expect(recorded.seen).toHaveLength(0)
  })

  it('returns the failure of the first supplier before it judges the later ones', async () => {
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: mint('1', '1'), principal }
    const recorded = recordingTransport()
    const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
    scripted.setAccess(access, 'allow')
    const broken: ProfileSupplier = { ...first, replay: { produces: 'a/b', accepts: ['c/d'] } }
    const alsoBroken: ProfileSupplier = { ...second, replay: { produces: 'e/f', accepts: [] } }
    const profile = profileOf({ suppliers: [broken, alsoBroken] })
    const required = requirement()
    scripted.setPlan(
      { ...access, profile, required, parameters: [temperature] },
      {
        ok: {
          suppliers: [bound(broken, { kind: 'factory' }), bound(alsoBroken, { kind: 'factory' })],
          parameterAdoptions: adoptions(),
        },
      },
    )
    const outcome = await scripted.preparation.prepare({
      ...access,
      profile,
      required,
      assembled: assembled(),
    })
    const judged = judgeReplayDeclaration(broken, 0)
    expect('failure' in judged).toBe(true)
    expect(outcome).toEqual(judged)
    expect(Object.isFrozen(outcome)).toBe(true)
    expect(recorded.seen).toHaveLength(0)
  })
})

describe('the transport lifecycle (M13 to M16)', () => {
  it('returns a failed prepare as it came and closes nothing (M13)', async () => {
    const failure = { kind: 'unavailable', dependency: 'upstream', diagnostic: 'down' } as const
    const { recorded, prepare } = setup([{ kind: 'fail', failure }])
    expect(await prepare()).toEqual({ failure })
    expect(recorded.seen).toHaveLength(1)
    expect(recorded.leases).toHaveLength(0)
    expect(recorded.materialized()).toBe(0)
  })

  it('closes a prepared transport once and succeeds only after the close finished (M14)', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    // The test transport gives a signal when the close begins and keeps the close open until
    // `release`.
    let signal: () => void = () => undefined
    const closing = new Promise<void>(resolve => {
      signal = resolve
    })
    const close = () => {
      signal()
      return held
    }
    const { recorded, prepare } = setup([{ kind: 'ok', close }])
    let settled = false
    const pending = prepare().then(outcome => {
      settled = true
      return outcome
    })
    await closing
    // One macrotask runs every queued microtask: a call that does not wait for the close has
    // settled when it ends. The count of microtask turns that the double takes does not matter.
    await new Promise<void>(resolve => {
      setImmediate(resolve)
    })
    expect(recorded.leases[0]?.closes()).toBe(1)
    expect(settled).toBe(false)
    release()
    expect('ok' in (await pending)).toBe(true)
    expect(recorded.leases[0]?.closes()).toBe(1)
    expect(recorded.materialized()).toBe(0)
  })

  it('rejects with the very error of a failed close, without a second close (M15)', async () => {
    const error = new Error('close failed')
    const { recorded, prepare } = setup([{ kind: 'ok', close: () => Promise.reject(error) }])
    expect(await rejection(prepare())).toBe(error)
    expect(recorded.leases[0]?.closes()).toBe(1)
  })

  it('closes the lease of each call and closes nothing when prepare throws (M16)', async () => {
    const error = new Error('prepare threw')
    const { recorded, prepare } = setup([{ kind: 'ok' }, { kind: 'ok' }, { kind: 'throw', error }])
    must(await prepare())
    must(await prepare())
    expect(await rejection(prepare())).toBe(error)
    const [one, two] = recorded.leases
    expect(recorded.leases).toHaveLength(2)
    expect(one?.prepared).not.toBe(two?.prepared)
    expect([one?.closes(), two?.closes()]).toEqual([1, 1])
  })
})

describe('the read order and the record of attempts (M17)', () => {
  it('counts a denial, a scripted failure, a missing plan, a transport failure and a close failure', async () => {
    const failure = { kind: 'unavailable', dependency: 'upstream', diagnostic: 'down' } as const
    const closeError = new Error('close failed')
    const { scripted, access, profile, required, prepare } = setup([
      { kind: 'fail', failure },
      { kind: 'ok', close: () => Promise.reject(closeError) },
    ])
    const stranger = { tenant: access.tenant, principal: new Agent('alice') }
    expect(
      await scripted.preparation.prepare({
        ...stranger,
        profile,
        required,
        assembled: assembled(),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'prepare' } })
    const empty = scripted.calls()
    expect(await prepare()).toEqual({ failure })
    expect(await rejection(prepare())).toBe(closeError)
    const missing = await rejection(prepare({ parameters: [] }))
    expect(missing).toBeInstanceOf(ScriptedModelError)
    expect(missing).toMatchObject({
      reason: 'invalid-script',
      message: 'no scripted preparation plan',
    })
    const refused = { kind: 'invalid', field: 'credential', reason: 'missing' } as const
    scripted.setPlan({ ...access, profile, required, parameters: [] }, { failure: refused })
    expect(await prepare({ parameters: [] })).toEqual({ failure: refused })
    expect(empty.map(call => call.sequence)).toEqual([1])
    expect(scripted.calls().map(call => call.sequence)).toEqual([1, 2, 3, 4, 5])
    expect(scripted.calls()[0]?.input.principal).toBe(stranger.principal)
  })

  it('answers the tenant, the control plane and the profile before it looks for a plan', async () => {
    const recorded = recordingTransport()
    const principal = new Agent('alice')
    const access: Access<Agent> = { tenant: mint('1', '1'), principal }
    const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
    const input = (over: Partial<Parameters<typeof scripted.preparation.prepare>[0]> = {}) => ({
      ...access,
      profile: profileOf(),
      required: requirement(),
      assembled: assembled(),
      ...over,
    })
    // No plan is set at all: each answer below comes before the lookup.
    expect(await scripted.preparation.prepare(input())).toEqual({
      failure: { kind: 'denied', action: 'prepare' },
    })
    expect(
      await scripted.preparation.prepare(input({ tenant: structuredClone(access.tenant) })),
    ).toEqual({ failure: { kind: 'denied', action: 'tenant' } })
    scripted.setAccess(access, 'unavailable')
    expect(await scripted.preparation.prepare(input())).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-request-preparation',
        diagnostic: 'scripted-access',
      },
    })
    scripted.setAccess(access, 'allow')
    const forged = profileOf({ scope: { kind: 'tenant', tenant: structuredClone(access.tenant) } })
    expect(await scripted.preparation.prepare(input({ profile: forged }))).toEqual({
      failure: { kind: 'invalid', field: 'profile.identity.scope', reason: 'invalid-identity' },
    })
    expect(
      await scripted.preparation.prepare(
        input({ profile: profileOf({ availability: 'withdrawn' }) }),
      ),
    ).toEqual({ failure: { kind: 'invalid', field: 'profile', reason: 'withdrawn' } })
    expect(
      await scripted.preparation.prepare(input({ required: requirement(['text', 'video']) })),
    ).toEqual({ failure: { kind: 'invalid', field: 'required.modalities', reason: 'modality' } })
    expect(recorded.seen).toHaveLength(0)
    expect(scripted.calls()).toHaveLength(6)
  })

  it('fixes the plan of a call when it arrives: a later plan does not change a call in flight', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const { scripted, access, profile, required, prepare } = setup([
      { kind: 'ok', close: () => held },
    ])
    const pending = prepare()
    scripted.setPlan(
      { ...access, profile, required, parameters: [temperature] },
      { failure: { kind: 'denied', action: 'scripted' } },
    )
    release()
    expect(must(await pending).suppliers).toEqual(plan().suppliers)
    expect(await prepare()).toEqual({ failure: { kind: 'denied', action: 'scripted' } })
  })

  it('denies a profile of another organization and checks an organization scope that is not minted', async () => {
    const recorded = recordingTransport()
    const access: Access<Agent> = { tenant: mint('1', '1'), principal: new Agent('alice') }
    const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
    scripted.setAccess(access, 'allow')
    const prepareFor = (organization: TenantId['organization']) =>
      scripted.preparation.prepare({
        ...access,
        profile: profileOf({ scope: { kind: 'organization', organization } }),
        required: requirement(),
        assembled: assembled(),
      })
    // No plan is set at all: each answer below comes before the lookup.
    expect(await prepareFor(mint('2', '3').organization)).toEqual({
      failure: { kind: 'denied', action: 'prepare' },
    })
    expect(await prepareFor(structuredClone(access.tenant.organization))).toEqual({
      failure: { kind: 'invalid', field: 'profile.identity.scope', reason: 'invalid-identity' },
    })
    // The scope of the tenant's own organization passes, so the call reaches the plan lookup.
    const own = await rejection(prepareFor(mint('1', '2').organization))
    expect(own).toMatchObject({ reason: 'invalid-script', message: 'no scripted preparation plan' })
    expect(recorded.seen).toHaveLength(0)
  })

  it('keeps one plan per tenant and per principal for the same profile, requirement and parameters', async () => {
    const recorded = recordingTransport()
    const scripted = createScriptedModelRequestPreparation<Agent>({ transport: recorded.transport })
    const alice = new Agent('alice')
    const owners: [Access<Agent>, string][] = [
      [{ tenant: mint('1', '1'), principal: alice }, 'cred-first-tenant'],
      [{ tenant: mint('2', '3'), principal: alice }, 'cred-second-tenant'],
      [{ tenant: mint('1', '1'), principal: new Agent('bob') }, 'cred-other-principal'],
    ]
    const profile = profileOf()
    const required = requirement()
    const credentialOf = (id: string) =>
      ({ kind: 'tenant', id: must(decodeCredentialId(id)) }) as const
    for (const [access, id] of owners) {
      scripted.setAccess(access, 'allow')
      scripted.setPlan(
        { ...access, profile, required, parameters: [temperature] },
        {
          ok: {
            suppliers: [bound(first, credentialOf(id)), bound(second, { kind: 'factory' })],
            parameterAdoptions: adoptions(),
          },
        },
      )
    }
    for (const [access, id] of owners) {
      const request = must(
        await scripted.preparation.prepare({
          ...access,
          profile,
          required,
          assembled: assembled(),
        }),
      )
      expect(request.suppliers[0].credential).toEqual(credentialOf(id))
    }
  })
})
