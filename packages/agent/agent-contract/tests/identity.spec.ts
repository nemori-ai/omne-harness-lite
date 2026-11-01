import { describe, expect, it } from 'vitest'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  AGENT_IDENTITY_MAX_LENGTH,
  decodeActionBatchId,
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentInstanceId,
  decodeAgentOperationId,
  decodeAgentRegistrationId,
  decodeCardRoundId,
  decodeConsumptionId,
  decodeExecutionAttachmentId,
  decodeExecutionRevision,
  decodeInputBatchId,
  decodeInputId,
  decodePassageId,
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
  decodeStepId,
  judgeAccess,
  judgeAdoption,
  judgeAuthority,
  judgeEvidence,
  type StructureFailure,
} from '@omne-harness/agent-contract'

type Decode = (value: unknown) => unknown

/** Each decoder with the identity type name that its failures report in `field`. */
const DECODERS: readonly (readonly [string, Decode])[] = [
  ['AgentInstanceId', decodeAgentInstanceId],
  ['StepId', decodeStepId],
  ['ActionId', decodeActionId],
  ['PassageId', decodePassageId],
  ['CardRoundId', decodeCardRoundId],
  ['ActionBatchId', decodeActionBatchId],
  ['AgentExecutionId', decodeAgentExecutionId],
  ['ExecutionAttachmentId', decodeExecutionAttachmentId],
  ['AgentRegistrationId', decodeAgentRegistrationId],
  ['AgentOperationId', decodeAgentOperationId],
  ['ExecutionRevision', decodeExecutionRevision],
  ['InputId', decodeInputId],
  ['InputBatchId', decodeInputBatchId],
  ['ConsumptionId', decodeConsumptionId],
  ['ReplyAdmissionPageCursor', decodeReplyAdmissionPageCursor],
]

describe('the identity decoders', () => {
  it('has the length limit of the identity text', () => {
    expect(AGENT_IDENTITY_MAX_LENGTH).toBe(256)
  })

  describe.each(DECODERS)('decode%s', (name, decode) => {
    it('gives the text back as the brand', () => {
      expect(decode('exec-0001_A.b~z')).toEqual({ ok: 'exec-0001_A.b~z' })
    })

    it('accepts the first and last printable ASCII characters and the longest text', () => {
      expect(decode('!~')).toEqual({ ok: '!~' })
      const longest = 'a'.repeat(AGENT_IDENTITY_MAX_LENGTH)
      expect(decode(longest)).toEqual({ ok: longest })
    })

    it.each([[undefined], [null], [7], [{}], [['a']], [Symbol('a')]])(
      'refuses a value that is not a string (%s)',
      value => {
        expect(decode(value)).toEqual({ failure: { field: name, reason: 'type' } })
      },
    )

    it('refuses the empty string', () => {
      expect(decode('')).toEqual({ failure: { field: name, reason: 'empty' } })
    })

    it('refuses a text longer than the limit', () => {
      expect(decode('a'.repeat(AGENT_IDENTITY_MAX_LENGTH + 1))).toEqual({
        failure: { field: name, reason: 'length' },
      })
    })

    it.each([
      ['a space inside', 'a b'],
      ['a leading space', ' a'],
      ['a tab', 'a\tb'],
      ['a newline', 'a\nb'],
      ['a control character', 'a\u001fb'],
      ['the delete character', 'a\u007fb'],
      ['a non-ASCII letter', 'café'],
      ['a CJK character', '执行'],
    ])('refuses %s', (_label, text) => {
      expect(decode(text)).toEqual({ failure: { field: name, reason: 'character' } })
    })

    it('reports the longest text as too long before it reports a character', () => {
      expect(decode(`${' '.repeat(AGENT_IDENTITY_MAX_LENGTH)}x`)).toEqual({
        failure: { field: name, reason: 'length' },
      })
    })
  })
})

describe('decodeReplyAdmissionSequence', () => {
  const field = 'ReplyAdmissionSequence'

  it.each([['0'], ['1'], ['99'], ['100'], ['9007199254740993'], ['1'.repeat(256)]])(
    'gives the canonical decimal %s back as the brand',
    text => {
      expect(decodeReplyAdmissionSequence(text)).toEqual({ ok: text })
    },
  )

  it.each([
    ['a leading zero', '01'],
    ['two zeros', '00'],
    ['a minus sign', '-1'],
    ['a plus sign', '+1'],
    ['a non-digit', '1a'],
    ['a decimal point', '1.0'],
    ['an exponent', '1e3'],
    ['a space', ' 1'],
    ['a full-width digit', '１'],
  ])('refuses %s', (_label, text) => {
    expect(decodeReplyAdmissionSequence(text)).toEqual({ failure: { field, reason: 'character' } })
  })

  it('refuses the empty string, a number and a text longer than the limit', () => {
    expect(decodeReplyAdmissionSequence('')).toEqual({ failure: { field, reason: 'empty' } })
    expect(decodeReplyAdmissionSequence(1)).toEqual({ failure: { field, reason: 'type' } })
    expect(decodeReplyAdmissionSequence('1'.repeat(AGENT_IDENTITY_MAX_LENGTH + 1))).toEqual({
      failure: { field, reason: 'length' },
    })
  })
})

const ADOPTION = { owner: 'agent', name: 'definition', revision: '3', digest: 'sha256:aa' }
const EVIDENCE = { owner: 'agent', record: 'record-1', revision: '4', digest: 'sha256:bb' }

const failureOf = (judged: unknown): StructureFailure => {
  expect(judged).toHaveProperty('failure')
  return (judged as { failure: StructureFailure }).failure
}

type Judge = (value: unknown) => unknown

/** The shared rules of the two all-text structures. */
const TEXT_STRUCTURES: readonly (readonly [string, Judge, Record<string, string>])[] = [
  ['Adoption', judgeAdoption, ADOPTION],
  ['Evidence', judgeEvidence, EVIDENCE],
]

describe.each(TEXT_STRUCTURES)('judge%s', (structure, judge, valid) => {
  const fields = Object.keys(valid)

  it('accepts the exact structure and returns a frozen copy', () => {
    const input = { ...valid }
    const judged = judge(input) as { ok: Record<string, string> }
    expect(judged).toEqual({ ok: valid })
    expect(Object.isFrozen(judged.ok)).toBe(true)
    expect(judged.ok).not.toBe(input)
    input['owner'] = 'changed'
    expect(judged.ok['owner']).toBe('agent')
  })

  it('accepts an object without a prototype', () => {
    expect(judge(Object.assign(Object.create(null), valid))).toEqual({ ok: valid })
  })

  it.each([[null], [undefined], ['text'], [7], [[]], [[valid]], [() => valid]])(
    'refuses a value that is not an object (%s)',
    value => {
      expect(failureOf(judge(value))).toEqual({ field: structure, reason: 'type' })
    },
  )

  it.each(fields)('refuses a missing %s', field => {
    const { [field]: _omitted, ...rest } = valid
    expect(failureOf(judge(rest))).toEqual({ field, reason: 'missing' })
  })

  it.each(fields)('refuses %s that is not a string', field => {
    for (const bad of [undefined, null, 5, {}, ['a']]) {
      expect(failureOf(judge({ ...valid, [field]: bad }))).toEqual({ field, reason: 'type' })
    }
  })

  it.each(fields)('refuses an empty %s', field => {
    expect(failureOf(judge({ ...valid, [field]: '' }))).toEqual({ field, reason: 'empty' })
  })

  it('refuses an array even when its prototype was removed', () => {
    expect(failureOf(judge(Object.setPrototypeOf([], null)))).toEqual({
      field: structure,
      reason: 'type',
    })
  })

  it('refuses a member that the structure does not have', () => {
    expect(failureOf(judge({ ...valid, extra: 'x' }))).toEqual({
      field: 'extra',
      reason: 'unknown-field',
    })
  })

  it('reports a missing member before an unknown one', () => {
    const { owner: _omitted, ...rest } = valid
    expect(failureOf(judge({ ...rest, extra: 'x' }))).toEqual({
      field: 'owner',
      reason: 'missing',
    })
  })

  it('refuses an object of another prototype, a symbol key and an accessor without running it', () => {
    class Holder {
      owner = 'agent'
    }
    expect(failureOf(judge(Object.assign(new Holder(), valid)))).toEqual({
      field: structure,
      reason: 'type',
    })
    expect(failureOf(judge({ ...valid, [Symbol('k')]: 1 }))).toEqual({
      field: structure,
      reason: 'type',
    })
    let read = 0
    const withAccessor = { ...valid }
    Object.defineProperty(withAccessor, 'owner', {
      enumerable: true,
      get: () => {
        read += 1
        return 'agent'
      },
    })
    expect(failureOf(judge(withAccessor))).toEqual({ field: structure, reason: 'type' })
    expect(read).toBe(0)
  })

  it('does not throw on an object whose reflection throws', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error('trap')
        },
      },
    )
    expect(failureOf(judge(hostile))).toEqual({ field: structure, reason: 'type' })
  })
})

const AUTHORITY = {
  execution: 'exec-1',
  executionAttachment: 'attach-1',
  instance: 'instance-1',
  generation: '7',
  source: EVIDENCE,
}

describe('judgeAuthority', () => {
  it('accepts the exact structure and returns a frozen copy', () => {
    const input = { ...AUTHORITY }
    const judged = judgeAuthority(input) as { ok: Record<string, unknown> }
    expect(judged).toEqual({ ok: AUTHORITY })
    expect(Object.isFrozen(judged.ok)).toBe(true)
    expect(Object.isFrozen(judged.ok['source'])).toBe(true)
    expect(judged.ok['source']).not.toBe(AUTHORITY.source)
  })

  it.each([[null], [undefined], ['text'], [[]]])('refuses %s that is not an object', value => {
    expect(failureOf(judgeAuthority(value))).toEqual({ field: 'Authority', reason: 'type' })
  })

  it.each(['execution', 'executionAttachment', 'instance', 'generation', 'source'])(
    'refuses a missing %s',
    field => {
      const { [field]: _omitted, ...rest } = AUTHORITY as Record<string, unknown>
      expect(failureOf(judgeAuthority(rest))).toEqual({ field, reason: 'missing' })
    },
  )

  describe.each(['execution', 'executionAttachment', 'instance'])('the identity %s', field => {
    it.each([
      ['empty', ''],
      ['not a string', 5],
      ['null', null],
      ['too long', 'a'.repeat(AGENT_IDENTITY_MAX_LENGTH + 1)],
      ['with a space', 'a b'],
    ])('is refused as identity when it is %s', (_label, bad) => {
      expect(failureOf(judgeAuthority({ ...AUTHORITY, [field]: bad }))).toEqual({
        field,
        reason: 'identity',
      })
    })
  })

  it.each([
    ['empty', '', 'empty'],
    ['a number', 7, 'type'],
    ['null', null, 'type'],
  ] as const)('refuses a generation that is %s', (_label, bad, reason) => {
    expect(failureOf(judgeAuthority({ ...AUTHORITY, generation: bad }))).toEqual({
      field: 'generation',
      reason,
    })
  })

  it('refuses a source that is not an Evidence and names the path', () => {
    expect(failureOf(judgeAuthority({ ...AUTHORITY, source: 'x' }))).toEqual({
      field: 'source',
      reason: 'type',
    })
    expect(
      failureOf(judgeAuthority({ ...AUTHORITY, source: { ...EVIDENCE, record: '' } })),
    ).toEqual({ field: 'source.record', reason: 'empty' })
    expect(failureOf(judgeAuthority({ ...AUTHORITY, source: { ...EVIDENCE, extra: 1 } }))).toEqual({
      field: 'source.extra',
      reason: 'unknown-field',
    })
    expect(failureOf(judgeAuthority({ ...AUTHORITY, source: ADOPTION }))).toEqual({
      field: 'source.record',
      reason: 'missing',
    })
  })

  it('refuses a member that the structure does not have', () => {
    expect(failureOf(judgeAuthority({ ...AUTHORITY, extra: true }))).toEqual({
      field: 'extra',
      reason: 'unknown-field',
    })
  })

  it('refuses an accessor without running it', () => {
    let read = 0
    const withAccessor = { ...AUTHORITY }
    Object.defineProperty(withAccessor, 'generation', {
      enumerable: true,
      get: () => {
        read += 1
        return '7'
      },
    })
    expect(failureOf(judgeAuthority(withAccessor))).toEqual({
      field: 'Authority',
      reason: 'type',
    })
    expect(read).toBe(0)
  })
})

function mintTenant(): TenantId {
  const organization = organizationCodec.parse(`org_${'0'.repeat(26)}`)
  const account = accountCodec.parse(`acc_${'1'.repeat(26)}`)
  if (!organization.ok || !account.ok) throw new Error('the fixture identity text is invalid')
  return tenant(organization.value, account.value)
}

/** A principal judgment of the test: a non-empty `name` and nothing else. */
function judgeNamed(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return { failure: { field: 'Principal', reason: 'type' } } as const
  }
  const name: unknown = (value as { name?: unknown }).name
  if (typeof name !== 'string') return { failure: { field: 'name', reason: 'type' } } as const
  if (name === '') return { failure: { field: 'name', reason: 'empty' } } as const
  return { ok: { name } }
}

describe('judgeAccess', () => {
  const TENANT = mintTenant()
  const valid = { principal: { name: 'ada' }, tenant: TENANT }

  it('accepts the exact structure, passes the principal to the injected judgment and freezes the result', () => {
    const seen: unknown[] = []
    const judged = judgeAccess(valid, value => {
      seen.push(value)
      return judgeNamed(value)
    })
    expect(judged).toEqual({ ok: valid })
    expect(seen).toEqual([{ name: 'ada' }])
    expect(Object.isFrozen((judged as { ok: object }).ok)).toBe(true)
    expect((judged as { ok: { tenant: unknown } }).ok.tenant).toBe(TENANT)
  })

  it('uses the value that the injected judgment returns as the principal', () => {
    const judged = judgeAccess(valid, () => ({ ok: 'normalized' }))
    expect(judged).toEqual({ ok: { principal: 'normalized', tenant: TENANT } })
  })

  it.each([[null], [undefined], ['text'], [[]]])('refuses %s that is not an object', value => {
    expect(failureOf(judgeAccess(value, judgeNamed))).toEqual({ field: 'Access', reason: 'type' })
  })

  it('refuses a missing principal and a missing tenant', () => {
    expect(failureOf(judgeAccess({ tenant: TENANT }, judgeNamed))).toEqual({
      field: 'principal',
      reason: 'missing',
    })
    expect(failureOf(judgeAccess({ principal: { name: 'ada' } }, judgeNamed))).toEqual({
      field: 'tenant',
      reason: 'missing',
    })
  })

  it('keeps the reason of a principal failure and prefixes its field', () => {
    expect(failureOf(judgeAccess({ ...valid, principal: { name: '' } }, judgeNamed))).toEqual({
      field: 'principal.name',
      reason: 'empty',
    })
    expect(failureOf(judgeAccess({ ...valid, principal: 3 }, judgeNamed))).toEqual({
      field: 'principal.Principal',
      reason: 'type',
    })
  })

  it('refuses a tenant that legal-identity did not mint', () => {
    const lookalike = {
      name: 'TenantId',
      organization: { name: 'OrganizationId', text: `org_${'0'.repeat(26)}` },
      account: { name: 'AccountId', text: `acc_${'1'.repeat(26)}` },
    }
    for (const bad of [lookalike, structuredClone(TENANT), 'tenant', null, 5, {}]) {
      expect(failureOf(judgeAccess({ ...valid, tenant: bad }, judgeNamed))).toEqual({
        field: 'tenant',
        reason: 'type',
      })
    }
  })

  it('refuses a member that the structure does not have', () => {
    expect(failureOf(judgeAccess({ ...valid, extra: 1 }, judgeNamed))).toEqual({
      field: 'extra',
      reason: 'unknown-field',
    })
  })

  it('refuses an accessor without running it', () => {
    let read = 0
    const withAccessor = { principal: { name: 'ada' } }
    Object.defineProperty(withAccessor, 'tenant', {
      enumerable: true,
      get: () => {
        read += 1
        return TENANT
      },
    })
    expect(failureOf(judgeAccess(withAccessor, judgeNamed))).toEqual({
      field: 'Access',
      reason: 'type',
    })
    expect(read).toBe(0)
  })
})

// The tests below have literal names on purpose. The decoders and the structures above are covered
// by generated tests (`describe.each`), and a run that picks tests by name cannot see the names that
// a generated test gets. These tests keep the refusal words under such a run.
describe('the refusal words of the identity rules', () => {
  it('names the rule that a decoder broke, with the identity type', () => {
    expect(decodeStepId(5)).toEqual({ failure: { field: 'StepId', reason: 'type' } })
    expect(decodeStepId('')).toEqual({ failure: { field: 'StepId', reason: 'empty' } })
    expect(decodeStepId('a'.repeat(AGENT_IDENTITY_MAX_LENGTH + 1))).toEqual({
      failure: { field: 'StepId', reason: 'length' },
    })
    expect(decodeStepId('a b')).toEqual({ failure: { field: 'StepId', reason: 'character' } })
  })

  it('names the structure and the member that a text structure broke', () => {
    expect(judgeAdoption(ADOPTION)).toEqual({ ok: ADOPTION })
    expect(judgeAdoption(5)).toEqual({ failure: { field: 'Adoption', reason: 'type' } })
    expect(judgeAdoption({ ...ADOPTION, owner: 5 })).toEqual({
      failure: { field: 'owner', reason: 'type' },
    })
    expect(judgeEvidence({ ...EVIDENCE, record: '' })).toEqual({
      failure: { field: 'record', reason: 'empty' },
    })
    expect(judgeAdoption(Object.assign(Object.create(null), ADOPTION))).toEqual({ ok: ADOPTION })
    expect(judgeAdoption(Object.assign(new Date(), ADOPTION))).toEqual({
      failure: { field: 'Adoption', reason: 'type' },
    })
  })

  it('names the member of an authority that is missing, that is not an identity, or that is a bad source', () => {
    const { execution: _execution, ...withoutExecution } = AUTHORITY
    expect(judgeAuthority(withoutExecution)).toEqual({
      failure: { field: 'execution', reason: 'missing' },
    })
    expect(judgeAuthority({ ...AUTHORITY, execution: 'a b' })).toEqual({
      failure: { field: 'execution', reason: 'identity' },
    })
    const { source: _source, ...withoutSource } = AUTHORITY
    expect(judgeAuthority(withoutSource)).toEqual({
      failure: { field: 'source', reason: 'missing' },
    })
    expect(judgeAuthority({ ...AUTHORITY, source: 'x' })).toEqual({
      failure: { field: 'source', reason: 'type' },
    })
    expect(judgeAuthority({ ...AUTHORITY, source: { ...EVIDENCE, record: '' } })).toEqual({
      failure: { field: 'source.record', reason: 'empty' },
    })
  })
})

/** The value with one more own data member named `__proto__`, as `JSON.parse` makes it. */
function withOwnProto(value: object): object {
  return Object.defineProperty({ ...value }, '__proto__', {
    value: { extra: 1 },
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

// A structure judgment that collects the members into an object literal assigns `__proto__`
// through the prototype setter: the member then never shows up as unknown, and the closed field
// rule lets it pass. Each judgment must name it as an unknown member.
describe('an own member named __proto__', () => {
  it('is an unknown member of an Adoption, also when JSON.parse made it', () => {
    const parsed: unknown = JSON.parse(`${JSON.stringify(ADOPTION).slice(0, -1)},"__proto__":{}}`)
    expect(Object.keys(parsed as object)).toContain('__proto__')
    expect(judgeAdoption(parsed)).toEqual({
      failure: { field: '__proto__', reason: 'unknown-field' },
    })
    expect(judgeAdoption(withOwnProto(ADOPTION))).toEqual({
      failure: { field: '__proto__', reason: 'unknown-field' },
    })
  })

  it('is an unknown member of an Evidence', () => {
    expect(judgeEvidence(withOwnProto(EVIDENCE))).toEqual({
      failure: { field: '__proto__', reason: 'unknown-field' },
    })
  })

  it('is an unknown member of an Access', () => {
    const access = { principal: { name: 'ada' }, tenant: mintTenant() }
    expect(judgeAccess(withOwnProto(access), judgeNamed)).toEqual({
      failure: { field: '__proto__', reason: 'unknown-field' },
    })
  })

  it('is an unknown member of an Authority and of its source', () => {
    expect(judgeAuthority(withOwnProto(AUTHORITY))).toEqual({
      failure: { field: '__proto__', reason: 'unknown-field' },
    })
    expect(judgeAuthority({ ...AUTHORITY, source: withOwnProto(EVIDENCE) })).toEqual({
      failure: { field: 'source.__proto__', reason: 'unknown-field' },
    })
  })
})
