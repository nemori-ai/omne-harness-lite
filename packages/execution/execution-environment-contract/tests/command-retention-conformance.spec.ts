import { expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { originRef } from '@omne-harness/execution-environment-contract'
import {
  commandRetentionConformance,
  createScriptedCommandFacility,
  createScriptedRetentionStore,
  runConformanceCase,
  type CommandRetentionAcquisition,
  type CommandRetentionSubject,
  type ScriptedRetentionStore,
} from '@omne-harness/execution-environment-contract/testing'

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('invalid tenant fixture')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const otherTenant = tenantOf('acc_zzzzzzzzzzzzzzzzzzzzzzzzzz')

const obligations = [
  'V-EE28.clean-exit-reports-none',
  'V-EE28.leftover-is-retained-and-listed',
  'V-EE28.list-stays-in-scope-and-tenant',
  'V-EE28.handle-stop-after-handover-is-unconfirmed',
  'V-EE28.scope-close-stops-retained',
  'V-EE28.no-ledger-stops-with-reason',
]

let sequence = 0
function acquisition(
  store: ScriptedRetentionStore,
  scope: string,
  who: TenantId,
  ledger = true,
): CommandRetentionAcquisition {
  const scripted = createScriptedCommandFacility(
    request => ({
      kind: 'started',
      ...(request.args[0] === 'leftover' ? { leaves: 1 } : {}),
    }),
    { retention: { store, scope, ledger } },
  )
  return {
    facility: scripted.facility,
    request: () => ({
      requestId: `suite-${++sequence}`,
      access: { principal: 'suite', tenant: who },
      origin: originRef('suite-call'),
      binding: { kind: 'host_machine' },
    }),
  }
}

type Shape = 'other-scope' | 'other-tenant'
function subject(shape: Shape = 'other-scope', unbound = true): CommandRetentionSubject {
  const store = createScriptedRetentionStore()
  const body = (word: string) => ({
    executable: 'script',
    args: [word],
    cwd: '.',
    env: {},
    outputMode: 'separate' as const,
  })
  return {
    acquisition: acquisition(store, 'scope-a', tenant),
    elsewhere:
      shape === 'other-scope'
        ? acquisition(store, 'scope-b', tenant)
        : acquisition(store, 'scope-a', otherTenant),
    ...(unbound ? { unbound: acquisition(store, 'scope-c', tenant, false) } : {}),
    commands: { clean: () => body('clean'), leftover: () => body('leftover') },
    async closeScope() {
      store.closeScope('scope-a')
    },
    async domainStopped(process) {
      return store.stopped(process)
    },
  }
}

function caseNamed(name: string, make: () => CommandRetentionSubject) {
  const test = commandRetentionConformance({ subject: make, waitMs: 500 }).find(
    test => test.name === name,
  )
  if (!test) throw new Error(`missing conformance case ${name}`)
  return test
}

for (const name of obligations) {
  for (const shape of ['other-scope', 'other-tenant'] as const) {
    it(`${name} accepts scripted retention across ${shape}`, async () => {
      expect(await runConformanceCase(caseNamed(name, () => subject(shape)))).toEqual({
        name,
        status: 'pass',
      })
    })
  }
}

it('reports a missing unbound acquisition as not applicable and still disposes the subject', async () => {
  let disposed = 0
  const test = caseNamed('V-EE28.no-ledger-stops-with-reason', () => ({
    ...subject('other-scope', false),
    async dispose() {
      disposed++
    },
  }))
  expect(await runConformanceCase(test)).toMatchObject({
    status: 'not-applicable',
    reason: expect.any(String),
  })
  expect(disposed).toBe(1)
})

it('assembles a lazy, unique case list without allocating a subject', () => {
  const cases = commandRetentionConformance({
    subject() {
      throw new Error('eager allocation')
    },
  })
  expect(cases.map(test => test.name)).toEqual(obligations)
})

it('rejects a facility that keeps no list per retention scope', async () => {
  // One scope for both acquisitions: the second list shows the first acquisition's process.
  const test = caseNamed('V-EE28.list-stays-in-scope-and-tenant', () => {
    const store = createScriptedRetentionStore()
    const shared = acquisition(store, 'scope-a', tenant)
    return { ...subject(), elsewhere: shared, acquisition: shared }
  })
  await expect(runConformanceCase(test)).rejects.toMatchObject({ name: 'AssertionError' })
})

it('rejects a facility whose scope closing stops nothing', async () => {
  const test = caseNamed('V-EE28.scope-close-stops-retained', () => ({
    ...subject(),
    async closeScope() {},
  }))
  await expect(runConformanceCase(test)).rejects.toMatchObject({ name: 'AssertionError' })
})
