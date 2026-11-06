import type { Context } from '@deepseek-ai/cordis'
import type {
  PrincipalIssuer,
  IdentityOperations,
  IdentityGovernance,
} from '@omne-harness/identity'
import {
  identityOperationsKey,
  identityGovernanceKey,
  principalIssuerKey,
} from '@omne-harness/identity/cordis'
import { succeed } from '@omne-harness/operation-result'
import { createServerEntry, type ResolvedDefinition } from '@omne-harness/server-entry'
import { createMemoryAgentDrive, evidence } from '@omne-harness/session-contract/testing'
import type {
  AgentDrivePort,
  SessionEvidenceBridge,
  SessionContextInput,
} from '@omne-harness/session-contract'
import {
  SessionEvidenceBridgeService,
  SessionContextInputService,
  AgentDrivePortService,
  sessionEvidenceKey,
  sessionContextInputKey,
  sessionAgentDriveKey,
  sessionKey,
  type SessionService,
} from '@omne-harness/session-cordis-contract/cordis'
import { defineRow } from '../../../src/row.ts'
import { identityClock } from '../../../src/entry/identity-clock.ts'
import { sessionClock } from '../../../src/entry/session-clock.ts'
import { identityRow } from '../../../src/rows/identity/index.ts'
import { sessionAd09Row } from '../../../src/rows/session-ad09/index.ts'
import { sessionProviderRealRow } from '../../../src/rows/session-provider/real.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import {
  BASE_ENTRY_OBJECTS,
  declared,
  loadTree,
  makeBase,
  storageRows,
} from '../session-fixtures/tree.ts'
import { createGuards } from '../storage/fixtures/tree.ts'
import { releaseIdentityConfig } from '../identity/fixtures.ts'

const definition: ResolvedDefinition = {
  candidate: { owner: 'fixture', name: 'assistant@1', revision: '1', digest: 'sha256:assistant' },
  execution: { owner: 'fixture', name: 'execution', revision: '1', digest: 'sha256:execution' },
  entryContract: { owner: 'fixture', name: 'entry', revision: '1', digest: 'sha256:entry' },
  requiredIdentities: [],
  tenantDefaults: { owner: 'fixture', name: 'defaults', revision: '1', digest: 'sha256:defaults' },
  initialModelSelection: { name: 'controlled-agent', basis: evidence('model-selection') },
}

function materialsRow() {
  class Evidence extends SessionEvidenceBridgeService {
    readonly prepare: SessionEvidenceBridge['prepare'] = command =>
      Promise.resolve(succeed(command.kind === 'create' ? createGuards(command) : []))
  }
  class ContextInput extends SessionContextInputService {
    readonly prepare: SessionContextInput<unknown>['prepare'] = () => Promise.resolve(succeed([]))
  }
  return declared(
    defineRow({
      row: 'session-ad10',
      implementation: 'contract-double',
      manifest: {
        provides: [sessionEvidenceKey, sessionContextInputKey],
        injects: [],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'intake-materials',
        apply(ctx: Context) {
          new Evidence(ctx)
          new ContextInput(ctx)
        },
      },
    }),
  )
}

export async function openIntakeTree(maxPendingInputs = 2, maxInputBytes = 4096) {
  const base = makeBase()
  const driver = createMemoryAgentDrive()
  const invoked: Parameters<AgentDrivePort['invoke']>[0][] = []
  const blocked = Promise.withResolvers<void>()
  let heldSession: string | undefined
  class Drive extends AgentDrivePortService {
    readonly invoke: AgentDrivePort['invoke'] = async input => {
      invoked.push(input)
      if (heldSession === undefined) heldSession = input.session
      if (input.session === heldSession) await blocked.promise
      return driver.invoke(input)
    }
    readonly submit = driver.submit
    readonly resume = driver.resume
    readonly control = driver.control
    readonly detach = driver.detach
    readonly recordResult = driver.recordResult
    readonly query = driver.query
    readonly inspect = driver.inspect
    readonly prewarm = driver.prewarm
  }
  const driveRow = declared(
    defineRow({
      row: 'session-ad14',
      implementation: 'contract-double',
      manifest: { provides: [sessionAgentDriveKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: Drive,
    }),
  )
  const captured: {
    issuer?: PrincipalIssuer
    identity?: IdentityOperations
    governance?: IdentityGovernance
  } = {}
  const capture = declared(
    defineRow({
      row: 'server-entry',
      implementation: 'contract-double',
      manifest: {
        provides: [],
        injects: [principalIssuerKey, identityOperationsKey, identityGovernanceKey],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'intake-entry-dependencies',
        inject: [principalIssuerKey, identityOperationsKey, identityGovernanceKey],
        apply(ctx: Context) {
          captured.issuer = ctx.principalIssuer
          captured.identity = ctx.identityOperations
          captured.governance = ctx.identityGovernance
        },
      },
    }),
  )
  const storage = storageRows(base)
  const rows = storage.specs.filter(spec => spec.row.id !== 'session-storage')
  const tree = await loadTree({
    base,
    rows: [
      ...rows,
      declared(sessionStorageRow, {
        combinationVersion: 'session-composite/1',
        directoryFile: base.directoryFile,
        domainRule: 'organization-account/1',
        intakeLimits: { maxPendingInputs, maxInputBytes },
      }),
      declared(identityRow, releaseIdentityConfig()),
      declared(sessionAd09Row),
      materialsRow(),
      driveRow,
      declared(sessionProviderRealRow, { admission: 'none' }),
      capture,
    ],
    entryObjects: [...BASE_ENTRY_OBJECTS, identityClock, sessionClock],
  })
  const { issuer, identity, governance } = captured
  if (issuer === undefined || identity === undefined || governance === undefined) {
    await tree.dispose()
    base.release()
    throw new Error('real Identity entry did not load')
  }
  const intake: SessionService<unknown> = tree.root.intercept(sessionKey, {
    caller: 'intake',
  }).session
  const reader: SessionService<unknown> = tree.root.intercept(sessionKey, {
    caller: 'reader',
  }).session
  const coordinator: SessionService<unknown> = tree.root.intercept(sessionKey, {
    caller: 'coordinator',
  }).session
  const entry = createServerEntry({
    config: {
      listenAddress: '127.0.0.1',
      listenPort: 0,
      maxInFlightRequests: 8,
      maxBodyBytes: { small: 16384, input: 65536 },
      heartbeatIntervalMs: 100,
      jsonBudgets: {
        maxDepth: 32,
        maxItems: 65536,
        maxMembers: 1024,
        maxStringLength: 65536,
        maxNumberLength: 64,
      },
      maxPageBytes: 65536,
      historyKinds: [
        'message.user',
        'intake.routed',
        'run.started',
        'run.attempt-started',
        'run.cancelled',
        'session.archived',
      ],
      observation: { perLogin: 2, perInstance: 8, cancelRetentionMs: 1000 },
    },
    dependencies: {
      identity,
      governance,
      issuer,
      session: { management: intake.management, work: intake.work, history: reader.history },
      resolveDefinition: name => (name === 'assistant' ? definition : undefined),
    },
  })
  const listening = await entry.start()
  return {
    port: listening.port,
    tree,
    issuer,
    identity,
    governance,
    intake,
    coordinator,
    invoked,
    accessRequests: storage.check.controls.asked,
    releaseAgent: () => blocked.resolve(),
    async close() {
      blocked.resolve()
      await entry.stop()
      await tree.shutdown()
      base.release()
    },
  }
}
