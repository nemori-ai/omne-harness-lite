import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import { PermissionEvaluationSchema, evaluatePermission } from '@omne-harness/permissions'
import { evaluation } from '../../../assets/permissions/tests/fixtures.ts'
import { PERMISSION_CURRENT, PERMISSION_SNAPSHOT } from '../src/permission-capture-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { persistStageSchema } from '../src/sql-stage-schema.ts'
import { digest, json, operationIdentity } from '../src/encoding.ts'
import { openRegistrarWorld } from './registrar-world.ts'
import { capture } from './permission-capture-world.ts'
import { binding } from './operation-world.ts'

const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
async function setup(withSource = false, holdIdentity = true) {
  const url = new URL('./permission-current.mjs', import.meta.url)
  const extra = {
    participants: [
      {
        participant: 'fixture.permission-current',
        protocol: '1',
        moduleUrl: url.href,
        codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
        ownedTables: [],
        readTables: [],
        requiresFacts: [],
        providesFacts: [PERMISSION_CURRENT],
        allowedFunctions: [],
        grouping: 'groupable' as const,
      },
    ],
    migrations: [],
    readHandlers: [],
  }
  const w = await openRegistrarWorld(extra)
  worlds.push(w)
  const participants = [
    'fixture.permission-current',
    PERMISSION_SNAPSHOT.participant,
    GOVERNANCE_OWNER,
  ]
  const checked = combinationManifest({ catalog: w.activation.materials, participants })
  if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
  const registration = {
    combinationVersion: 'permission-test/1',
    manifestDigest: manifestDigest(checked.manifest),
  }
  expect(
    await w.activation.storage.registerCombination({
      ...w.activation.domain,
      ...registration,
      participants,
    }),
  ).toMatchObject({ kind: 'registered' })
  const base = capture(w.scope)
  const input = {
    ...base,
    principalRef: w.principalRef,
    request: {
      ...base.request,
      command: { ...base.request.command, source: withSource ? base.request.command.source : null },
    },
  }
  const operation = binding(input),
    { sql, standing } = w.services()
  expect(await sql.accept(input)).toMatchObject({ kind: 'found' })
  if (holdIdentity)
    expect(
      await standing.reserve({ operation, destination: w.destination, required: [] }, w.principal),
    ).toMatchObject({ kind: 'held' })
  const execution = { ...registration, authority: { fixture: 'qualified-original-action' } }
  expect(
    await sql.executeControl(operation, { kind: 'submit', binding: operation, execution }),
  ).toMatchObject({ kind: 'applied' })
  const request = { binding: operation, execution }
  const permission = input.request.command.permission
  const raw = evaluation()
  const value = PermissionEvaluationSchema.parse({
    ...raw,
    scope: permission.scope,
    definition: permission.definition,
    declaration: {
      kind: 'available',
      definition: { ...raw.declaration.definition, reference: permission.definition },
    },
    sources: {
      organization: { kind: 'absent', revision: '1' },
      tenant: {
        kind: 'available',
        sourceRef: 'fixture-tenant',
        revision: '1',
        scope: permission.scope,
        definition: permission.definition,
        rule: { pick: 'auto', allowedSet: null },
      },
      session: { kind: 'absent', revision: '1' },
    },
    constraints: [],
    requiredConstraintIds: [],
  })
  const current = {
    binding: operation,
    epoch: input.epoch,
    transactionDomain: input.transactionDomain,
    target: input.request.command.target,
    source: input.request.command.source,
    qualification: input.request.command.qualification,
    evaluation: value,
  }
  async function apply(changed = current, beforeSend?: () => Promise<void>) {
    const envelope = {
      identity: operationIdentity(input.transactionDomain, operation.ref),
      ...registration,
      commands: [
        { participant: 'fixture.permission-current', facts: { current: json(changed) } },
        { participant: PERMISSION_SNAPSHOT.participant, facts: { request: json(request) } },
        { participant: GOVERNANCE_OWNER, facts: { requestDigest: digest(request) } },
      ],
    }
    expect(
      await sql.save(persistStageSchema.parse({ binding: operation, stage: 'apply', envelope })),
    ).toMatchObject({ kind: 'stored' })
    await beforeSend?.()
    const result = await sql.send(operation, 'apply')
    return { result, observed: await sql.observe(operation) }
  }
  return { w, operation, current, apply }
}
it('stores one bound current result under the original operation and replays it', async () => {
  const t = await setup()
  const first = await t.apply()
  expect(first.observed).toMatchObject({
    kind: 'found',
    record: { state: 'committed', result: { kind: 'current' } },
  })
  expect((await t.apply()).observed).toEqual(first.observed)
})

it('retains the original qualification and rejects a substituted observation in the same capture', async () => {
  const t = await setup()
  const accepted = await t.w.services().sql.observe(t.operation)
  expect(accepted).toMatchObject({
    kind: 'found',
    record: {
      request: {
        command: {
          qualification: {
            owner: 'fixture.action',
            protocol: 'fixture-action/1',
            observation: { revision: '1' },
          },
        },
      },
    },
  })
  const changed = {
    ...t.current,
    qualification: { ...t.current.qualification, observation: { revision: '2' } },
  }
  const answer = await t.apply(changed)
  expect(answer.observed).toMatchObject({
    kind: 'found',
    record: { state: 'submitted', result: null },
  })
})
it('preserves a known prohibition as partial current while an unreceived source is cancelled', async () => {
  const t = await setup(true)
  t.current.evaluation.sources.tenant = {
    ...t.current.evaluation.sources.tenant,
    kind: 'available',
    sourceRef: 'fixture-tenant',
    revision: '1',
    scope: t.current.evaluation.scope,
    definition: t.current.evaluation.definition,
    rule: { pick: 'deny', allowedSet: null },
  }
  const { observed } = await t.apply()
  expect(observed).toMatchObject({
    kind: 'found',
    record: {
      state: 'aborted',
      result: {
        kind: 'current',
        evaluation: { sources: { organization: { kind: 'unavailable' } } },
      },
    },
    source: { kind: 'requested' },
  })
  if (observed.kind !== 'found') throw new Error('Missing operation')
  const result = observed.record.result
  expect(
    evaluatePermission(
      result && typeof result === 'object' && !Array.isArray(result) ? result['evaluation'] : null,
    ),
  ).toMatchObject({ kind: 'denied', reason: 'active-prohibition' })
})
it('cannot create current without the original Identity hold', async () => {
  const t = await setup(false, false)
  expect((await t.apply()).observed).toMatchObject({ record: { state: 'submitted', result: null } })
})
it('cannot replace the original permission scope or source plan', async () => {
  const t = await setup()
  t.current.evaluation.scope.tenantId = 'other'
  expect((await t.apply()).observed).toMatchObject({ record: { state: 'submitted', result: null } })
})

it.each(['epoch', 'domain', 'target', 'source', 'binding'] as const)(
  'rejects a changed %s in the original current transaction',
  async field => {
    const t = await setup()
    switch (field) {
      case 'epoch':
        t.current.epoch = 'another-epoch'
        break
      case 'domain':
        t.current.transactionDomain = 'another-domain'
        break
      case 'target':
        t.current.target.targetRef = 'another-target'
        break
      case 'source':
        t.current.source = capture(t.w.scope).request.command.source
        break
      case 'binding':
        t.current.binding = { ...t.current.binding, requestDigest: 'f'.repeat(64) }
        break
    }
    expect((await t.apply()).observed).toMatchObject({
      record: { state: 'submitted', result: null },
    })
  },
)
it('preserves a winning seal instead of adding current afterward', async () => {
  const t = await setup()
  const sql = t.w.services().sql
  let sealed: Awaited<ReturnType<typeof sql.observe>> | undefined
  const result = await t.apply(t.current, async () => {
    expect(
      await sql.executeControl(t.operation, { kind: 'seal', binding: t.operation }),
    ).toMatchObject({ kind: 'applied' })
    sealed = await sql.observe(t.operation)
    expect(sealed).toMatchObject({ record: { state: 'aborted' } })
  })
  expect(result.observed).toEqual(sealed)
})
