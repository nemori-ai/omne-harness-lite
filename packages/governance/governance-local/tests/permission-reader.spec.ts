import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { combinationManifest, manifestDigest } from '@omne-harness/sql-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { organizationCodec } from '@omne-harness/legal-identity'
import { PermissionEvaluationSchema, evaluatePermission } from '@omne-harness/permissions'
import { createGovernanceLocal } from '../src/provider.ts'
import { PERMISSION_CURRENT, PERMISSION_SNAPSHOT } from '../src/permission-capture-schema.ts'
import { GOVERNANCE_OWNER } from '../src/migration.ts'
import { canonical, json } from '../src/encoding.ts'
import { evaluation } from '../../../assets/permissions/tests/fixtures.ts'
import { openRegistrarWorld } from './registrar-world.ts'
import { openProviderWorld } from './provider-world.ts'
import { capture } from './permission-capture-world.ts'
import type { PermissionProjection, PermissionProjectionRequest } from '../src/permission-reader.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

type ReadContext = { principal: ActingForTenantPrincipal; origin: { operationId: string } }

async function setup() {
  const url = new URL('./permission-current.mjs', import.meta.url)
  const w = await openRegistrarWorld({
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
        grouping: 'groupable',
      },
    ],
    migrations: [],
    readHandlers: [],
  })
  cleanup.push(() => w.close())
  const { options } = await openProviderWorld(w)
  const participants = [
    'fixture.permission-current',
    PERMISSION_SNAPSHOT.participant,
    GOVERNANCE_OWNER,
  ]
  const manifest = combinationManifest({ catalog: w.activation.materials, participants })
  if (manifest.kind !== 'manifest') throw new Error(JSON.stringify(manifest))
  const combination = {
    combinationVersion: 'permission-reader/1',
    manifestDigest: manifestDigest(manifest.manifest),
  }
  expect(
    await w.activation.storage.registerCombination({
      ...w.activation.domain,
      ...combination,
      participants,
    }),
  ).toMatchObject({ kind: 'registered' })
  const alternate = { ...combination, combinationVersion: 'permission-reader/alternate' }
  expect(
    await w.activation.storage.registerCombination({
      ...w.activation.domain,
      ...alternate,
      participants,
    }),
  ).toMatchObject({ kind: 'registered' })
  const base = capture(w.scope).request.command
  const org = organizationCodec.encode(w.principal.tenant.organization)
  if (!org.ok) throw new Error('Organization encoding failed')
  const permission = {
    ...base.permission,
    scope: {
      ...base.permission.scope,
      organizationId: org.value,
      targetId: canonical(base.target),
    },
  }
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
  let source: typeof base.source | null = null
  let resolutionReads = 0
  let qualificationRevision = '1'
  let mutateProjection = false
  const projected: PermissionProjectionRequest[] = []
  const context: ReadContext = {
    principal: w.principal,
    origin: { operationId: permission.operation.operationId },
  }
  const runtime = await createGovernanceLocal({
    ...options,
    permission: {
      principalOf: (context: ReadContext) => context.principal,
      sourceRoute: base.sourceRoute,
      async resolve(principal, request, context) {
        resolutionReads++
        // The original-action owner is a fixture; the principal is still verified by Governance.
        if (
          principal !== w.principal ||
          context.origin.operationId !== request.operation.operationId
        )
          return { kind: 'denied' }
        return {
          kind: 'resolved',
          permission: request,
          target: base.target,
          source,
          qualification: {
            ...base.qualification,
            observation: { revision: qualificationRevision },
          },
        }
      },
      project: input => {
        projected.push(input)
        const selected =
          canonical(input.command.qualification.observation) === canonical({ revision: '2' })
            ? alternate
            : combination
        const result = {
          combination: { ...selected },
          commands: [
            {
              participant: 'fixture.permission-current',
              facts: {
                current: json({
                  binding: input.binding,
                  epoch: input.epoch,
                  transactionDomain: input.transactionDomain,
                  target: input.command.target,
                  source: input.command.source,
                  qualification: input.command.qualification,
                  evaluation: value,
                }),
              },
            },
          ],
        } satisfies PermissionProjection
        if (mutateProjection)
          queueMicrotask(() => {
            result.combination.combinationVersion = 'not-registered'
            result.commands[0]!.facts.current = json({ changed: true })
          })
        return result
      },
    },
  })
  if (runtime.kind !== 'created') throw new Error(JSON.stringify(runtime))
  cleanup.push(() => runtime.close())
  return {
    w,
    context,
    runtime,
    permission,
    value,
    projected,
    changeQualification() {
      qualificationRevision = '2'
    },
    mutateProjectionAfterReturn() {
      mutateProjection = true
    },
    requireOrganization() {
      source = { ...base.source, target: { ...base.source.target, scopeRef: org.value } }
    },
    get resolutionReads() {
      return resolutionReads
    },
  }
}

it('pins the owner observation and selected combination without retaining mutable projection objects', async () => {
  const t = await setup()
  t.mutateProjectionAfterReturn()
  expect(await t.runtime.permissionBasis.readCurrent(t.context, t.permission)).toHaveProperty(
    'kind',
    'current',
  )
  const first = t.projected[0]!
  expect(await t.w.services().sql.observe(first.binding)).toMatchObject({
    kind: 'found',
    record: {
      state: 'committed',
      execution: { combinationVersion: 'permission-reader/1' },
      request: { command: { qualification: { observation: { revision: '1' } } } },
    },
  })
  t.changeQualification()
  expect(await t.runtime.permissionBasis.readCurrent(t.context, t.permission)).toHaveProperty(
    'kind',
    'current',
  )
  const second = t.projected[1]!
  expect(await t.w.services().sql.observe(second.binding)).toMatchObject({
    kind: 'found',
    record: {
      state: 'committed',
      execution: { combinationVersion: 'permission-reader/alternate' },
      request: { command: { qualification: { observation: { revision: '2' } } } },
    },
  })
  const saved = await t.w.services().sql.readStage(second.binding, 'apply')
  expect(saved).toMatchObject({
    kind: 'stored',
    envelope: { combinationVersion: 'permission-reader/alternate' },
  })
})

it('does not trust unretained organization absence and observes the next known prohibition', async () => {
  const t = await setup()
  const first = await t.runtime.permissionBasis.readCurrent(t.context, t.permission)
  expect(first.kind).toBe('current')
  if (first.kind !== 'current') throw new Error(JSON.stringify(first))
  expect(evaluatePermission(first.evaluation)).toMatchObject({
    kind: 'unavailable',
    missingBasis: ['organization'],
  })
  t.value.sources.tenant = {
    kind: 'available',
    sourceRef: 'fixture-tenant',
    revision: '2',
    scope: t.permission.scope,
    definition: t.permission.definition,
    rule: { pick: 'deny', allowedSet: null },
  }
  const second = await t.runtime.permissionBasis.readCurrent(t.context, t.permission)
  expect(second.kind).toBe('current')
  if (second.kind !== 'current') throw new Error(JSON.stringify(second))
  expect(evaluatePermission(second.evaluation)).toMatchObject({
    kind: 'denied',
    reason: 'active-prohibition',
  })
})

it('keeps known denial when organization acquisition and cleanup are unavailable', async () => {
  const t = await setup()
  t.requireOrganization()
  t.value.sources.tenant = {
    kind: 'available',
    sourceRef: 'fixture-tenant',
    revision: '2',
    scope: t.permission.scope,
    definition: t.permission.definition,
    rule: { pick: 'deny', allowedSet: null },
  }
  const result = await t.runtime.permissionBasis.readCurrent(t.context, t.permission)
  expect(result).toMatchObject({
    kind: 'current',
    evaluation: { sources: { organization: { kind: 'unavailable' } } },
  })
  if (result.kind !== 'current') throw new Error(JSON.stringify(result))
  expect(evaluatePermission(result.evaluation)).toMatchObject({ kind: 'denied' })
  expect(await t.runtime.close()).toMatchObject({ kind: 'pending' })
})

it('denies cross-tenant requests before resolving any target or capturing facts', async () => {
  const t = await setup()
  expect(
    await t.runtime.permissionBasis.readCurrent(t.context, {
      ...t.permission,
      scope: { ...t.permission.scope, tenantId: 'other' },
    }),
  ).toEqual({ kind: 'denied' })
  expect(t.resolutionReads).toBe(0)
})

it('does not supply current after provider close', async () => {
  const t = await setup()
  expect(await t.runtime.close()).toMatchObject({ kind: 'closed' })
  expect(await t.runtime.permissionBasis.readCurrent(t.context, t.permission)).toMatchObject({
    kind: 'unavailable',
  })
  expect(t.resolutionReads).toBe(0)
})

it('retains original context for the owner resolver without treating it as principal authority', async () => {
  const t = await setup()
  expect(
    await t.runtime.permissionBasis.readCurrent(
      { ...t.context, principal: { ...t.w.principal } },
      t.permission,
    ),
  ).toEqual({ kind: 'denied' })
  expect(t.resolutionReads).toBe(0)
  expect(
    await t.runtime.permissionBasis.readCurrent(
      { ...t.context, origin: { operationId: 'other-action' } },
      t.permission,
    ),
  ).toEqual({ kind: 'denied' })
  expect(t.resolutionReads).toBe(1)
})
