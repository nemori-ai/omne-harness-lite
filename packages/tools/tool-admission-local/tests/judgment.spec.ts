import { expect, test, vi } from 'vitest'
import { judgeContentBlock, LosslessNumber } from '@omne-harness-lite/content-blocks'
import { validate } from '@omne-harness-lite/loop-extension'
import type {
  AdmissionInput,
  AuthorizationContext,
  SessionRunMode,
  ExecuteTier,
} from '@omne-harness-lite/tool-admission'
import { createAdmissionJudgment } from '../src/index.ts'
const grants = Object.freeze({}) as AuthorizationContext
function call(id = 'call', args: unknown = { message: 'hello' }): AdmissionInput['call'] {
  const result = judgeContentBlock({
    kind: 'tool_call',
    id: `block-${id}`,
    callId: id,
    visibility: { toHuman: true, toModel: true },
    complete: true,
    tool: 'echo',
    arguments: args,
  })
  if (!('ok' in result) || result.ok.kind !== 'tool_call' || !('arguments' in result.ok))
    throw new Error('invalid call fixture')
  return result.ok as AdmissionInput['call']
}
function input(
  permission: ExecuteTier = 'auto',
  mode: SessionRunMode = 'auto_permission',
  id = 'call',
): Exclude<AdmissionInput, { readonly effectivePermission: 'not_in_composition' }> {
  return {
    call: call(id),
    definition: { name: 'echo' },
    effectivePermission: { value: permission, from: 'tenant' },
    grants,
    runMode: mode,
    tenantAutoWritable: true,
  }
}
async function one(
  value: AdmissionInput,
  evaluator: 'allow' | 'deny' | 'undecidable' | 'failure' = 'failure',
) {
  const evaluate = vi.fn(async () =>
    evaluator === 'failure' ? ({ unavailable: true } as const) : evaluator,
  )
  const result = await createAdmissionJudgment({ evaluate }).admit([value])
  return { result, evaluate }
}
for (const permission of ['forbid', 'auto', 'ask'] as const)
  for (const mode of ['never', 'auto_permission', 'bypass-permissions'] as const)
    for (const evaluation of ['allow', 'deny', 'undecidable', 'failure'] as const)
      test(`four-step order ${permission}/${mode}/${evaluation}`, async () => {
        const { result, evaluate } = await one(input(permission, mode), evaluation)
        if (permission !== 'ask') expect(evaluate).not.toHaveBeenCalled()
        if (permission === 'ask' && evaluation === 'failure') {
          expect(result).toEqual({ kind: 'failed', reason: 'unavailable' })
          return
        }
        const expected =
          permission === 'forbid'
            ? { kind: 'deny', reason: 'permission_forbidden' }
            : permission === 'auto' || evaluation === 'allow'
              ? { kind: 'allow' }
              : evaluation === 'deny'
                ? { kind: 'deny', reason: 'authorization_denied' }
                : mode === 'never'
                  ? { kind: 'deny', reason: 'run_mode_never' }
                  : mode === 'bypass-permissions'
                    ? { kind: 'allow' }
                    : { kind: 'ask' }
        expect(result).toMatchObject({ kind: 'decisions', results: [expected] })
      })
for (const answer of ['deny', 'declined', 'allow_once', 'allow_session', 'allow_tenant'] as const)
  for (const permission of ['forbid', 'auto', 'ask'] as const)
    test(`answer ${answer}/${permission} cannot overturn forbid and cannot ask again`, async () => {
      const { result, evaluate } = await one({ ...input(permission, 'never'), answer })
      expect(evaluate).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        kind: 'decisions',
        results: [
          permission === 'forbid'
            ? { kind: 'deny', reason: 'permission_forbidden' }
            : answer === 'deny'
              ? { kind: 'deny', reason: 'human_refused' }
              : answer === 'declined'
                ? { kind: 'deny', reason: 'human_declined' }
                : { kind: 'allow' },
        ],
      })
    })

test('not held denies only that item, even when grants cannot be evaluated', async () => {
  const unheld: AdmissionInput = {
    call: call(),
    definition: { name: 'echo' },
    effectivePermission: 'not_in_composition',
    grants,
    runMode: 'auto_permission',
    answer: 'allow_tenant',
  }
  const result = await createAdmissionJudgment().admit([
    unheld,
    input('auto', 'auto_permission', 'second'),
  ])
  expect(result).toMatchObject({
    kind: 'decisions',
    results: [{ kind: 'deny', reason: 'not_held' }, { kind: 'allow' }],
  })
})

test.each([false, true])(
  'card options and explanation preserve the tenant-writable boundary %s',
  async tenantAutoWritable => {
    const value = input('ask')
    const result = await createAdmissionJudgment({ evaluate: async () => 'undecidable' }).admit([
      { ...value, tenantAutoWritable },
    ])
    expect(result.kind).toBe('decisions')
    if (result.kind !== 'decisions' || result.results[0].kind !== 'ask')
      throw new Error('expected card')
    const card = result.results[0].card
    expect(validate('DecisionCardDraft', card)).toEqual({ valid: true })
    expect(card.options).toEqual([
      { id: 'deny', label: '不允许' },
      { id: 'allow_once', label: '这次允许' },
      { id: 'allow_session', label: '本会话内，这类情况都允许' },
      ...(tenantAutoWritable
        ? [{ id: 'allow_tenant', label: '将来本租户所有会话，这类情况全允许' }]
        : []),
    ])
    expect(card.explanation.includes('将来本租户所有会话')).toBe(tenantAutoWritable)
    expect(card.explanation).toContain('"message":"hello"')
    expect(card.about).toEqual({ position: 'before_action', callId: value.call.callId })
  },
)

test('a later evaluation failure yields no partial conclusions; absence is also unavailable', async () => {
  const values: [AdmissionInput, ...AdmissionInput[]] = [
    input(),
    input('ask', 'auto_permission', 'second'),
  ]
  expect(await createAdmissionJudgment().admit(values)).toEqual({
    kind: 'failed',
    reason: 'unavailable',
  })
  expect(
    await createAdmissionJudgment({
      evaluate: async () => {
        throw new Error('source unavailable')
      },
    }).admit(values),
  ).toEqual({ kind: 'failed', reason: 'unavailable' })
})

test('owns the entire batch before the first asynchronous evaluation', async () => {
  const gate = Promise.withResolvers<'undecidable'>()
  const second = {
    ...input('auto', 'auto_permission', 'second'),
    call: { ...call('second'), arguments: { value: 'original' } },
  }
  const judgment = createAdmissionJudgment({ evaluate: () => gate.promise })
  const first = input('ask')
  const expected = await createAdmissionJudgment().admit([second])
  const pending = judgment.admit([first, second])
  second.call.arguments.value = 'changed'
  second.runMode = 'never'
  gate.resolve('undecidable')
  const result = await pending
  if (result.kind !== 'decisions' || expected.kind !== 'decisions')
    throw new Error('expected complete decisions')
  expect(result.results[0].kind).toBe('ask')
  expect(result.results[1]).toEqual(expected.results[0])
})

test('tokens are stable by call id and exact JSON value, and grants are not bearer tokens', async () => {
  async function token(args: unknown, id = 'call') {
    const result = await createAdmissionJudgment().admit([{ ...input(), call: call(id, args) }])
    if (result.kind !== 'decisions' || result.results[0].kind !== 'allow')
      throw new Error('expected allow')
    return result.results[0].token
  }
  expect(await token({ a: new LosslessNumber('1.00e2'), b: [new LosslessNumber('-0')] })).toBe(
    await token({ b: [0], a: 100 }),
  )
  expect(await token({ a: new LosslessNumber('9007199254740992') })).not.toBe(
    await token({ a: new LosslessNumber('9007199254740993') }),
  )
  expect(await token([1, 2])).not.toBe(await token([2, 1]))
  expect(await token({ a: 1 }, 'first')).not.toBe(await token({ a: 1 }, 'second'))
})

test('failure precedence checks the whole shape, then unknown mode, then parent bounds', async () => {
  const judge = createAdmissionJudgment()
  const run = (batch: unknown) => judge.admit(batch as [AdmissionInput, ...AdmissionInput[]])
  expect(await run([])).toEqual({ kind: 'failed', reason: 'invalidInput' })
  expect(await run([{ ...input(), runMode: 'auto', extra: true }])).toHaveProperty(
    'reason',
    'invalidInput',
  )
  expect(
    await run([{ ...input(), runMode: 'auto', parent: { permission: 'forbid', runMode: 'auto' } }]),
  ).toHaveProperty('reason', 'modeUnknown')
  expect(
    await run([{ ...input(), parent: { permission: 'ask', runMode: 'auto_permission' } }]),
  ).toHaveProperty('reason', 'parentNarrower')
  expect(
    await run([input('auto', 'never'), input('auto', 'auto_permission', 'second')]),
  ).toHaveProperty('reason', 'invalidInput')
  expect(await run([input(), input()])).toHaveProperty('reason', 'invalidInput')
  for (const property of [
    'call',
    'definition',
    'effectivePermission',
    'grants',
    'runMode',
    'tenantAutoWritable',
  ]) {
    const value: Record<string, unknown> = { ...input() }
    delete value[property]
    expect(await run([value])).toEqual({ kind: 'failed', reason: 'invalidInput' })
  }
  for (const patch of [
    { effectivePermission: { value: 'auto', from: 'workspace' } },
    { effectivePermission: 'not_in_composition' }, // must omit tenantAutoWritable
    { call: { ...call(), arguments: undefined, unparseable: true } },
    { definition: { name: 'different' } },
    { parent: { permission: 'auto' } },
    { answer: 'yes' },
    { answer: ['allow_once'] },
    { grants: null },
    { effectivePermission: { value: 'auto', from: ['tenant'] } },
  ])
    expect(await run([{ ...input(), ...patch }])).toEqual({
      kind: 'failed',
      reason: 'invalidInput',
    })
})
