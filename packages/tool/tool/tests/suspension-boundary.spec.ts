// The boundary of the suspension commands (P07): what the driver and the binding give back as a
// suspension, a checkpoint, a registration or a plan is copied as data and judged as a closed
// record before any digest. Each malformed field is refused with the field that carries the
// fault, so a caller learns which part of its answer was wrong and nothing is committed on it.
import { describe, expect, it } from 'vitest'
import { CHECKPOINT_STATE_MAX_BYTES } from '@omne-harness/tool-contract/provider'
import { askingAuthor, checkpointBinding, scriptedBridge } from './checkpoint-values.ts'
import { admitCall, startHarness, testAuthority } from './start-values.ts'

type Commands = ReturnType<typeof startHarness>['commands']
type Plan = Parameters<Commands['planSuspension']>[0]
type Suspend = Parameters<Commands['suspend']>[0]
type Attach = Parameters<Commands['attachRegistration']>[0]
type Json = Record<string, unknown>

/** A call that suspended on its wait, with the inputs the driver gave the ledger to get there. */
async function suspendedWithInputs() {
  const authority = testAuthority()
  const checkpoint = checkpointBinding(authority, askingAuthor())
  const seen: { plan?: object; suspend?: object; attach?: object } = {}
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: scriptedBridge('registers'),
    driverRetryDelayMs: 5,
    commands: base => ({
      ...base,
      planSuspension: input => {
        seen.plan ??= input
        return base.planSuspension(input)
      },
      suspend: input => {
        seen.suspend ??= input
        return base.suspend(input)
      },
      attachRegistration: input => {
        seen.attach ??= input
        return base.attachRegistration(input)
      },
    }),
  })
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
  const { plan, suspend, attach } = seen
  if (plan === undefined || suspend === undefined || attach === undefined)
    throw new Error('the call did not pass through the suspension commands')
  return { harness, plan, suspend, attach }
}

const fresh = await suspendedWithInputs()

function replaced(value: object, path: readonly string[], to: unknown): Json {
  const copy = structuredClone(value) as Json
  let cursor = copy
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Json
  const last = path[path.length - 1] as string
  if (to === undefined) delete cursor[last]
  else cursor[last] = to
  return copy
}

/** An evidence or adoption field names its own part (`schema.digest`): no reason means a prefix. */
const invalid = (field: string, reason?: string) => ({
  failure: {
    kind: 'invalid',
    field:
      reason === undefined
        ? expect.stringMatching(new RegExp(`^${field.replace(/[[\]]/gu, '\\$&')}(\\.|$)`, 'u'))
        : field,
    ...(reason === undefined ? {} : { reason }),
  },
})

const badAdoption = { owner: 'o', name: 'n', revision: '1', digest: '' }
const badStart = { operation: 'op', executor: null, execution: null, kind: 'start' }

describe('suspension: the suspension record a binding gives back', () => {
  const field = (path: readonly string[]) =>
    replaced(fresh.suspend, ['suspension', ...path], undefined)
  const cases: Array<[string, Json, string, string?]> = [
    [
      'a record that is not an object',
      replaced(fresh.suspend, ['suspension'], 'text'),
      'suspension',
      'type',
    ],
    ['a null record', replaced(fresh.suspend, ['suspension'], null), 'suspension', 'type'],
    ['an array record', replaced(fresh.suspend, ['suspension'], []), 'suspension', 'type'],
    ['a record without its schema', field(['schema']), 'suspension.schema', 'missing'],
    ['a record without its tenant', field(['tenant']), 'suspension.tenant', 'missing'],
    [
      'a record with a field of its own',
      replaced(fresh.suspend, ['suspension', 'extra'], 1),
      'suspension.extra',
      'unknown-field',
    ],
    [
      'a tenant that is not a tenant',
      replaced(fresh.suspend, ['suspension', 'tenant'], { name: 'TenantId' }),
      'suspension.tenant',
      'type',
    ],
    [
      'a call that is not an id',
      replaced(fresh.suspend, ['suspension', 'call'], ''),
      'suspension.call',
    ],
    [
      'an operation that is not an id',
      replaced(fresh.suspend, ['suspension', 'operation'], 5),
      'suspension.operation',
    ],
    [
      'an adoption that is not complete',
      replaced(fresh.suspend, ['suspension', 'adoption'], badAdoption),
      'suspension.adoption',
    ],
    [
      'an input digest that is not text',
      replaced(fresh.suspend, ['suspension', 'inputDigest'], 7),
      'suspension.inputDigest',
      'type',
    ],
    [
      'an empty input digest',
      replaced(fresh.suspend, ['suspension', 'inputDigest'], ''),
      'suspension.inputDigest',
      'type',
    ],
    [
      'a start that is not a record',
      replaced(fresh.suspend, ['suspension', 'start'], badStart),
      'suspension.start',
      'shape',
    ],
    [
      'a schema that is not complete',
      replaced(fresh.suspend, ['suspension', 'schema'], badAdoption),
      'suspension.schema',
    ],
  ]
  it.each(cases)(
    'refuses %s',
    async (_name: string, input: Json, name: string, reason?: string) => {
      const result = await fresh.harness.commands.suspend(input as unknown as Suspend)
      expect(result).toMatchObject(invalid(name, reason))
    },
  )
})

describe('suspension: the checkpoint a binding proved', () => {
  const field = (path: readonly string[]) =>
    replaced(fresh.suspend, ['checkpoint', ...path], undefined)
  const cases: Array<[string, Json, string, string?]> = [
    [
      'a checkpoint that is not an object',
      replaced(fresh.suspend, ['checkpoint'], 3),
      'checkpoint',
      'type',
    ],
    ['a null checkpoint', replaced(fresh.suspend, ['checkpoint'], null), 'checkpoint', 'type'],
    ['an array checkpoint', replaced(fresh.suspend, ['checkpoint'], []), 'checkpoint', 'type'],
    ['a checkpoint without its exclusion', field(['exclusion']), 'checkpoint.exclusion', 'missing'],
    [
      'a checkpoint with a field of its own',
      replaced(fresh.suspend, ['checkpoint', 'extra'], 1),
      'checkpoint.extra',
      'unknown-field',
    ],
    [
      'a schema that is not complete',
      replaced(fresh.suspend, ['checkpoint', 'schema'], badAdoption),
      'checkpoint.schema',
    ],
    [
      'a payload that is not evidence',
      replaced(fresh.suspend, ['checkpoint', 'payload'], { owner: 'o' }),
      'checkpoint.payload',
    ],
    [
      'a start that is not a record',
      replaced(fresh.suspend, ['checkpoint', 'start'], badStart),
      'checkpoint.start',
      'shape',
    ],
    [
      'a result for a closed wait that is not a text',
      replaced(fresh.suspend, ['checkpoint', 'closedResult'], 7),
      'checkpoint.closedResult',
      'type',
    ],
    [
      'an empty result for a closed wait',
      replaced(fresh.suspend, ['checkpoint', 'closedResult'], ''),
      'checkpoint.closedResult',
      'empty',
    ],
    [
      'a result for a closed wait above its bound',
      replaced(fresh.suspend, ['checkpoint', 'closedResult'], 'x'.repeat(1025)),
      'checkpoint.closedResult',
      'too-large',
    ],
    [
      'consumed responses that are not a list',
      replaced(fresh.suspend, ['checkpoint', 'consumedResponses'], 'none'),
      'checkpoint.consumedResponses',
      'type',
    ],
    [
      'a consumed response that is not an id',
      replaced(fresh.suspend, ['checkpoint', 'consumedResponses'], ['', 'x']),
      'checkpoint.consumedResponses[0]',
    ],
    [
      'an effect boundary that is not evidence',
      replaced(fresh.suspend, ['checkpoint', 'effectBoundary'], null),
      'checkpoint.effectBoundary',
    ],
    [
      'an exclusion that is not evidence',
      replaced(fresh.suspend, ['checkpoint', 'exclusion'], { owner: 'o' }),
      'checkpoint.exclusion',
    ],
  ]
  it.each(cases)(
    'refuses %s',
    async (_name: string, input: Json, name: string, reason?: string) => {
      const result = await fresh.harness.commands.suspend(input as unknown as Suspend)
      expect(result).toMatchObject(invalid(name, reason))
    },
  )
})

describe('suspension: the state a binding stored', () => {
  /** Base64 text of the largest state: four characters for each three bytes, rounded up. */
  const longest = Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4
  const stored = (state: unknown) =>
    fresh.harness.commands.suspend(replaced(fresh.suspend, ['state'], state) as unknown as Suspend)

  it.each([
    ['a state that is not text', 7, 'type'],
    ['a null state', null, 'type'],
    ['a list as the state', ['AAAA'], 'type'],
    ['a state above its bound', 'A'.repeat(longest + 4), 'too-large'],
    ['a state above its bound that is not base64 either', '!'.repeat(longest + 1), 'too-large'],
    ['a length that is not a multiple of four', 'AAA', 'not-base64'],
    ['a character outside the alphabet', '!!!!', 'not-base64'],
    ['a character outside the alphabet at the start', '!AAA', 'not-base64'],
    ['a character outside the alphabet at the end', 'AAA!', 'not-base64'],
    ['three padding characters', 'A===', 'not-base64'],
    ['padding in the middle', 'A=AA', 'not-base64'],
  ])('refuses %s', async (_name: string, state: unknown, reason: string) => {
    expect(await stored(state)).toMatchObject(invalid('state', reason))
  })

  // The call is suspended already, so the answer is the judgment of the ledger on a later command.
  it.each([['AAAA'], ['AAA='], ['AA=='], ['ab+/'], ['A'.repeat(longest)]])(
    'does not refuse base64 text up to the bound as a state: %#',
    async (state: string) => {
      expect(await stored(state)).not.toMatchObject({ failure: { kind: 'invalid' } })
    },
  )
})

describe('suspension: the plan and the registration given to the ledger', () => {
  it.each([
    ['a start that is not a record', replaced(fresh.plan, ['start'], badStart), 'start', 'shape'],
    [
      'a schema that is not complete',
      replaced(fresh.plan, ['schema'], badAdoption),
      'schema',
      undefined,
    ],
  ] as const)(
    'refuses a plan with %s',
    async (_name: string, input: Json, name: string, reason?: string) => {
      const result = await fresh.harness.commands.planSuspension(input as unknown as Plan)
      expect(result).toMatchObject(invalid(name, reason))
    },
  )

  it.each([
    ['a wait that is not an id', replaced(fresh.attach, ['wait'], ''), 'wait'],
    [
      'a registration that is not evidence',
      replaced(fresh.attach, ['registration'], { owner: 'o' }),
      'registration',
    ],
  ] as const)('refuses an attach with %s', async (_name, input, name) => {
    const result = await fresh.harness.commands.attachRegistration(input as unknown as Attach)
    expect(result).toMatchObject(invalid(name))
  })
})
