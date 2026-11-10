import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import { createGovernanceLocal } from '@omne-harness/governance-local'
import { createSessionStorage, sessionStorageMaterials } from '@omne-harness/session-storage-sql'
import {
  SESSION_LOG_PARTICIPANTS,
  SESSION_COMMIT_BASIS,
  SESSION_COMMIT_RESULT,
  sessionCommandFacts,
} from '@omne-harness/session-storage-sql/participants'
import { commandDigest, type SessionCommand } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { createFixedSessionCursorSigning } from '@omne-harness/session-cordis-contract/testing'
import {
  combinationManifest,
  manifestDigest,
  type SqlMaterialCatalog,
  type CommitRequestV2,
  type CommitResultV2,
} from '@omne-harness/sql-contract'
import { openRegistrarWorld } from '../../../../../packages/governance/governance-local/tests/registrar-world.ts'
import { openProviderWorld } from '../../../../../packages/governance/governance-local/tests/provider-world.ts'

import {
  sessionPermissionResultParticipant,
  SESSION_PERMISSION_RESULT,
} from '../../../dist/rows/governance/session-permission-result.js'
import { sessionPermissionReply } from '../../../dist/rows/governance/session-permission-reply.js'

const worlds: Awaited<ReturnType<typeof openRegistrarWorld>>[] = []
afterEach(async () => {
  for (const w of worlds.splice(0)) await w.close()
})
const BASIS = {
  key: 'governance.external-write-basis',
  protocol: 'governance-external-write-basis/1',
}
const RESULT = {
  key: 'governance.external-write-result',
  protocol: 'governance-external-write-result/1',
}
function adapters(): SqlMaterialCatalog['participants'] {
  return [
    { name: 'basis', requiresFacts: [BASIS], providesFacts: [SESSION_COMMIT_BASIS] },
    { name: 'result', requiresFacts: [BASIS, SESSION_COMMIT_RESULT], providesFacts: [RESULT] },
  ].map(({ name, ...facts }) => {
    const url = new URL(`./external-session-${name}.mjs`, import.meta.url)
    return {
      participant: `fixture.external-session-${name}`,
      protocol: `fixture-external-session-${name}/1`,
      moduleUrl: url.href,
      codeDigest: createHash('sha256').update(readFileSync(url)).digest('hex'),
      ownedTables: [],
      readTables: [],
      allowedFunctions: [],
      grouping: 'groupable',
      ...facts,
    }
  })
}
async function world(realResult: boolean) {
  const resultParticipant = realResult
    ? SESSION_PERMISSION_RESULT.participant
    : 'fixture.external-session-result'
  const materials = sessionStorageMaterials({ readOutputLimitBytes: 4 * 1024 * 1024 })
  const w = await openRegistrarWorld(
    {
      ...materials,
      participants: [
        ...materials.participants,
        ...adapters(),
        sessionPermissionResultParticipant(),
      ],
    },
    { maxJsonDepth: 64 },
  )
  worlds.push(w)
  async function register(name: string, participants: readonly string[]) {
    const checked = combinationManifest({ catalog: w.activation.materials, participants })
    expect(checked.kind, JSON.stringify(checked)).toBe('manifest')
    if (checked.kind !== 'manifest') throw new Error(JSON.stringify(checked))
    const combination = {
      combinationVersion: name,
      manifestDigest: manifestDigest(checked.manifest),
    }
    expect(
      await w.activation.storage.registerCombination({
        ...w.activation.domain,
        ...combination,
        participants,
      }),
    ).toMatchObject({ kind: 'registered' })
    return combination
  }
  const ordinary = await register('fixture-session-ordinary/1', SESSION_LOG_PARTICIPANTS)
  const protectedCombination = await register('fixture-session-protected/1', [
    'execution-record',
    'governance.external-write-basis',
    'fixture.external-session-basis',
    'session',
    resultParticipant,
    'governance.external-write-terminal',
    'governance.activation',
  ])
  const entry = { tenant: w.scope.tenantRef, domain: w.activation.domain }
  const port = createSessionStorage({
    storage: w.activation.storage,
    combination: ordinary,
    domains: {
      resolve: async () => ({ kind: 'ready', entry }),
      snapshot: async () => ({ kind: 'ready', value: { revision: '1', entries: [entry] } }),
    },
    accessCheck: {
      check: async () => ({ kind: 'allowed', evidence: evidence('fixture-session-create') }),
    },
    cursorSigning: createFixedSessionCursorSigning(),
  })
  const access = {
    principal: w.principal,
    tenant: w.principal.tenant,
    session: sessionId('protected-session'),
  }
  const create = {
    kind: 'create',
    input: {
      tenant: access.tenant,
      session: access.session,
      operation: operationId('protected-create'),
      creation: creation(),
    },
  } satisfies SessionCommand
  const created = await port.commit({
    access,
    command: create,
    guards: [
      initializationFixtureGuard(
        initializationFixtureFacts(create, null, adoptedInitializationFixture(create)),
      ),
    ],
  })
  expect(created, JSON.stringify(created)).toHaveProperty('ok')
  return { w, port, access, protectedCombination, resultParticipant }
}
const definition = {
  reference: {
    origin: {
      kind: 'independent' as const,
      providerId: 'fixture-tool',
      definitionRef: 'fixture-v1',
    },
    itemId: 'execute',
    revision: '1',
  },
  capabilityId: 'fixture-tool',
  enforcementKey: 'execute',
  title: 'Execute',
  description: 'Fixture command permission',
  approvalEffect: 'May execute fixture command',
  supportedScopes: [{ kind: 'session' as const, description: 'This session' }],
  assignmentLayers: ['session' as const],
  values: [
    { id: 'allow', title: 'Allow', description: 'May execute', permitsOperation: true },
    { id: 'deny', title: 'Deny', description: 'Do not execute', permitsOperation: false },
  ],
  comparison: null,
  defaultRule: { pick: 'deny', allowedSet: null },
  settings: null,
}
it.each([
  'success',
  'after-session',
  'wrong-binding',
  'wrong-execution',
  'wrong-writer',
  'seal-before',
  'changed-facts',
  'lost-reply',
  'session-result-coordination',
  'session-result-operation',
  'session-result-commands',
  'session-reply-digest',
  'session-reply-invalid',
  'stale-revision',
])(
  'commits real Session and Governance together: %s',
  async fault => {
    const { w, port, access, protectedCombination, resultParticipant } = await world(
      fault === 'success' || fault === 'lost-reply',
    )
    const before = await port.readWork(access)
    const command = {
      kind: 'change',
      input: {
        tenant: access.tenant,
        session: access.session,
        operation: operationId('protected-assignment'),
        declaration: {
          kind: 'permission-assignment',
          capabilityId: definition.capabilityId,
          enforcementKey: definition.enforcementKey,
          definition: definition.reference,
          rule: { pick: 'allow', allowedSet: null },
          expectedRevision: fault === 'stale-revision' ? '1' : '0',
          authorization: evidence('fixture-original-qualified'),
        },
      },
    } satisfies SessionCommand
    const session = sessionCommandFacts(command, [])
    const { options } = await openProviderWorld(w)
    const submissions: { request: CommitRequestV2; reply: CommitResultV2 }[] = []
    const made = await createGovernanceLocal({
      ...options,
      storage: {
        ...options.storage,
        async commit(request, signal) {
          const apply = request.identity.operation === 'governance.apply.internal.external-write'
          if (apply && fault === 'seal-before') {
            const sql = w.services().sql
            const ref = {
              scope: w.scope,
              principalRef: w.principalRef,
              owner: 'internal.external-write' as const,
              operationId: command.input.operation,
            }
            const prior = await sql.lookup(ref)
            if (prior.kind !== 'found') throw new Error('original operation missing')
            const binding = { ref, requestDigest: prior.record.requestDigest }
            await sql.executeControl(binding, { kind: 'seal', binding })
            expect(await sql.observe(binding)).toMatchObject({ record: { state: 'aborted' } })
          }
          const sent =
            apply && fault === 'changed-facts'
              ? {
                  ...request,
                  commands: request.commands.map(entry =>
                    entry.participant === 'session'
                      ? {
                          ...entry,
                          facts: {
                            ...entry.facts,
                            intakeLimits: { maxInputBytes: 1048576, maxPendingInputs: 65 },
                          },
                        }
                      : entry,
                  ),
                }
              : request
          const reply = await options.storage.commit(sent, signal)
          submissions.push({ request: sent, reply })
          return apply && fault === 'lost-reply'
            ? {
                kind: 'unknown',
                identity: request.identity,
                diagnostic: 'fixture observer lost reply',
              }
            : reply
        },
      },
      externalWrites: {
        sourceRoute: 'fixture-session-source',
        principalOf: principal => principal,
        resolve: async () => ({
          kind: 'qualified',
          required: [],
          source: null,
          qualification: {
            fixture: 'original-session-write-qualification',
            permissionRevision: command.input.declaration.expectedRevision,
            definition,
            policy: evidence('fixture-original-qualified'),
          },
        }),
        plan: () => ({
          combination: protectedCombination,
          writer: 'session',
          commands: [
            session,
            { participant: 'fixture.external-session-basis', facts: {} },
            { participant: resultParticipant, facts: { fault } },
          ],
        }),
      },
    })
    if (made.kind !== 'created' || made.externalWrites === undefined)
      throw new Error(JSON.stringify(made))
    const intent = {
      operationId: command.input.operation,
      write: {
        owner: 'session',
        protocol: 'session.permission-assignment/1',
        targetRef: access.session,
        commandDigest: commandDigest(command),
        command: session.facts,
      },
    }
    const result = await made.externalWrites.execute(w.principal, intent)
    const succeeds = fault === 'success' || fault === 'lost-reply'
    const summaries = submissions.map(({ request, reply }) => ({
      operation: request.identity.operation,
      kind: reply.kind,
      ...('reason' in reply ? { reason: reply.reason } : {}),
      ...('responses' in reply
        ? {
            responses: reply.responses.map(({ participant, reply: value }) => ({
              participant,
              kind: value.kind,
              ...('diagnostic' in value ? { diagnostic: value.diagnostic } : {}),
            })),
          }
        : {}),
    }))
    expect(result, JSON.stringify(summaries)).toMatchObject({
      kind: 'terminal',
      outcome: succeeds ? 'committed' : 'aborted',
    })
    const applied = submissions.find(
      entry => entry.request.identity.operation === 'governance.apply.internal.external-write',
    )
    expect(applied?.reply.kind, JSON.stringify(summaries)).toBe(
      succeeds ? 'committed' : 'rolled_back',
    )
    if (applied?.reply.kind !== 'committed' && applied?.reply.kind !== 'rolled_back')
      throw new Error('SQL receipt missing')
    expect(result).toHaveProperty('sqlIdentity', applied.request.identity)
    if (result.kind !== 'terminal') throw new Error('Governance terminal missing')
    const originalReceipt = await options.storage.query(result.sqlIdentity)
    expect(originalReceipt).toEqual(applied.reply)
    const originalReply = sessionPermissionReply(result, originalReceipt, command)
    if (succeeds) {
      expect(originalReply).toMatchObject({ kind: 'participated', digest: commandDigest(command) })
    } else if (fault === 'stale-revision') {
      expect(originalReply).toMatchObject({ kind: 'stopped', failure: { kind: 'changed' } })
    } else if (fault === 'changed-facts') {
      expect(originalReply).toMatchObject({ kind: 'unsupported' })
    } else {
      expect(originalReply).toMatchObject({ kind: 'failed' })
    }
    if (fault === 'success') {
      expect(
        sessionPermissionReply(
          result,
          { ...originalReceipt, identity: { ...originalReceipt.identity, operationKey: 'other' } },
          command,
        ),
      ).toMatchObject({ kind: 'failed' })
      expect(
        sessionPermissionReply({ ...result, outcome: 'aborted' }, originalReceipt, command),
      ).toMatchObject({ kind: 'failed' })
      expect(
        sessionPermissionReply(result, originalReceipt, {
          ...command,
          input: { ...command.input, operation: operationId('other-operation') },
        }),
      ).toMatchObject({ kind: 'failed' })
      expect(
        sessionPermissionReply(result, originalReceipt, {
          ...command,
          input: { ...command.input, declaration: { ...command.input.declaration, rule: null } },
        }),
      ).toMatchObject({ kind: 'failed' })
      expect(
        sessionPermissionReply(
          result,
          {
            kind: 'unknown',
            identity: result.sqlIdentity,
            diagnostic: 'fixture receipt unavailable',
          },
          command,
        ),
      ).toMatchObject({ kind: 'failed' })
    }
    expect(await made.externalWrites.execute(w.principal, intent)).toEqual(result)
    const responses = applied.reply.responses
    if (fault === 'seal-before') {
      expect(responses.at(-1)).toMatchObject({
        participant: 'governance.external-write-basis',
        reply: { kind: 'failed' },
      })
      expect(responses.some(entry => entry.participant === 'session')).toBe(false)
    } else if (fault === 'changed-facts') {
      expect(responses.at(-1)).toMatchObject({
        participant: 'session',
        reply: { kind: 'unsupported' },
      })
    } else if (fault === 'stale-revision') {
      expect(responses.at(-1)).toMatchObject({
        participant: 'session',
        reply: { kind: 'conflict', basis: { failure: { kind: 'changed' } } },
      })
    } else {
      expect(responses.find(entry => entry.participant === 'session')).toMatchObject({
        reply: { kind: 'participated' },
      })
      if (fault.startsWith('session-'))
        expect(responses.at(-1)).toMatchObject({
          participant: resultParticipant,
          reply: { kind: 'unsupported', basis: { reason: 'session-result-binding' } },
        })
      else if (!succeeds)
        expect(responses.at(-1)).toMatchObject({
          participant:
            fault === 'after-session'
              ? 'fixture.external-session-result'
              : 'governance.external-write-terminal',
          reply: { kind: 'failed' },
        })
    }
    if (succeeds)
      expect(responses.at(-1)).toMatchObject({
        participant: 'governance.activation',
        reply: {
          kind: 'participated',
          response: { kind: 'found', record: { state: 'committed' } },
        },
      })
    const after = await port.readWork(access)
    if (succeeds) {
      expect(after).toMatchObject({
        ok: {
          permissions: {
            revision: '1',
            assignments: [{ capabilityId: definition.capabilityId, rule: { pick: 'allow' } }],
          },
        },
      })
      expect(await made.externalWrites.execute(w.principal, intent)).toEqual(result)
      expect(await port.readWork(access)).toEqual(after)
    } else expect(after).toEqual(before)
    expect(await made.close()).toEqual({ kind: 'closed' })
  },
  30_000,
)
