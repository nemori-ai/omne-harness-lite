import { expect, it } from 'vitest'
import {
  acquireParamsSchema,
  originalAcquisitionSchema,
  terminalFacility,
  originRef,
} from '@omne-harness/execution-environment-contract'
import {
  createMemoryResourceLedger,
  createScriptedTerminalFacility,
} from '@omne-harness/execution-environment-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'

const tenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!tenant.ok) throw new Error('invalid fixture tenant')
const original = {
  tenant: tenant.value,
  acquisition: 'a',
  origin: 'a',
  scope: { ref: 'call-a' },
  placement: {
    kind: 'placement',
    requirement: {
      allowedBindings: [{ kind: 'host_machine' }],
      facilities: ['terminal'],
      isolation: [],
    },
    binding: { kind: 'host_machine' },
    provider: { name: 'test', generation: '1', version: '1' },
    continuity: { kind: 'not_guaranteed' },
    quotaDomain: 'test',
  },
}

it('decodes retained acquisition data while preserving the retention ledger identity', async () => {
  const { ledger } = createMemoryResourceLedger()
  const retention = { scope: { ref: 'session-1' }, ledger }
  const { tenant: owner, ...input } = original
  const result = await acquireParamsSchema['~standard'].validate([
    { tenant: owner, principal: 'a' },
    { ...input, ledger, guard: { authorize: async () => 'authorized' }, retention },
  ])
  expect(result.issues).toBeUndefined()
  if (result.issues) throw new Error('valid retention refused')
  expect(result.value[1].retention?.ledger).toBe(ledger)
})

it('preserves retention scope in original data and rejects runtime ports or unknown scope fields', async () => {
  const retained = { ...original, retentionScope: { ref: 'session-1' } }
  const decoded = await originalAcquisitionSchema['~standard'].validate(retained)
  expect(decoded.issues).toBeUndefined()
  if ('value' in decoded) expect(decoded.value).toEqual(retained)
  for (const invalid of [
    { ...retained, retentionScope: { ref: 'session-1', tenant: 'forged' } },
    { ...retained, retention: { ledger: createMemoryResourceLedger() } },
  ]) {
    expect((await originalAcquisitionSchema['~standard'].validate(invalid)).issues).toBeDefined()
  }
})

it('declares attach and detach as guarded terminal operations', () => {
  expect(terminalFacility.operations).toEqual([
    'create',
    'attach',
    'detach',
    'execute',
    'close',
    'list',
  ])
  expect(terminalFacility.guarded).toEqual(terminalFacility.operations)
})

it('refuses retention on the per-acquisition scripted terminal without creating an object', async () => {
  const terminal = createScriptedTerminalFacility(() => ({ kind: 'started' }))
  const request = {
    requestId: 'unsupported',
    access: { tenant: original.tenant, principal: 'a' },
    origin: originRef('a'),
    binding: { kind: 'host_machine' } as const,
  }
  expect(
    await terminal.facility.create({ ...request, cwd: '/', env: {}, retain: 'session' }),
  ).toEqual({ kind: 'rejected', requestId: request.requestId, reason: 'unsupported' })
  expect(await terminal.facility.list(request)).toEqual({
    kind: 'done',
    requestId: request.requestId,
    value: [],
  })
  const ref = { id: 'foreign', generation: '1' }
  if (terminal.facility.attach === undefined || terminal.facility.detach === undefined)
    throw new Error('expected explicit unsupported handlers')
  expect(await terminal.facility.attach({ ...request, terminal: ref })).toMatchObject({
    kind: 'rejected',
    reason: 'unsupported',
  })
  expect(await terminal.facility.detach({ ...request, terminal: ref })).toMatchObject({
    kind: 'rejected',
    reason: 'unsupported',
  })
})

it('rejects missing retention methods and extra retention fields', async () => {
  const { ledger } = createMemoryResourceLedger()
  const { tenant: owner, ...input } = original
  for (const retention of [
    { scope: { ref: 'session' }, ledger: { ...ledger, permit: undefined } },
    { scope: { ref: 'session' }, ledger, callerSession: 'forged' },
    { scope: { ref: 'session' }, ledger: { ...ledger, closed: {} } },
  ]) {
    expect(
      (
        await acquireParamsSchema['~standard'].validate([
          { tenant: owner, principal: 'a' },
          { ...input, ledger, guard: { authorize: async () => 'authorized' }, retention },
        ])
      ).issues,
    ).toBeDefined()
  }
})
