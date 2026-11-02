// The production parts of this package under the real Tool runtime factory: the host clock, a
// binding registry with the Catalog over it, the three absent ports and the default result policy.
// `createToolRuntime` checks that every dependency is present and throws a TypeError when one is
// not, so a construction that does not throw shows that these parts fill their ports.
//
// TEST DOUBLES, all of them from `@omne-harness/tool/testing` or this directory: the in-memory
// ledger store with the real ledger on it, the output custody (`toolOutputCustody` is not a part of
// this package), the start authority, environment and executor, the instance host, the invocation
// source, and the scripted origin check and availability facts. They prove only the wiring of the
// production parts above, in one process, without durability.
import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolRuntime, type ToolConfiguration } from '@omne-harness/tool'
import {
  createTestInvocationSource,
  createTestToolDependencies,
  createTestToolIdentities,
} from '@omne-harness/tool/testing'
import {
  defaultResultPolicy,
  type ToolDriver,
  type ToolInstanceHost,
} from '@omne-harness/tool-contract/provider'
import {
  createAbsentToolPorts,
  createLocalToolBindingRegistry,
  createLocalToolCatalog,
  createLocalToolClock,
} from '@omne-harness/tool-host-local'
import { authorityFor, officialLayer, scriptedVerifier } from './binding-values.ts'

const configuration: ToolConfiguration = {
  authorBufferBytes: 4_096,
  authorBufferItems: 16,
  authorWaitHistoryBytes: 65_536,
  authorWaitHistoryItems: 8,
  processBatchBytes: 4_096,
  processBatchDelayMs: 0,
  observerBufferBytes: 65_536,
  resultPageBytes: 4_096,
  reconciliationDelayMs: 0,
  ledgerCommitAttempts: 8,
  queueCapacity: 8,
}

function composition() {
  const clock = createLocalToolClock()
  const registry = createLocalToolBindingRegistry<string>({
    verifier: scriptedVerifier([authorityFor(officialLayer, 'alpha')]),
    fiber: () => 'fiber-1',
  })
  const catalog = createLocalToolCatalog<string>({
    registry,
    availability: {
      judge: () =>
        Promise.resolve(
          succeed({
            qualification: 'allowed',
            dependencies: [],
            inputCompatible: true,
            outputCompatible: true,
            attachmentsReadable: true,
          } as const),
        ),
    },
  })
  const absent = createAbsentToolPorts<string>()

  // TEST DOUBLE: the invocation source and its identities.
  const identities = createTestToolIdentities()
  const source = createTestInvocationSource<string>({
    snapshotPrincipal: principal => principal,
    authority: {
      qualify: () => Promise.resolve({ kind: 'allowed' }),
      samePrincipal: () => Promise.resolve({ kind: 'allowed' }),
    },
  })
  let installed: ToolDriver<string> | null = null
  // TEST DOUBLE: an instance host that records the driver and schedules nothing.
  const host: ToolInstanceHost<string> = {
    install: driver => {
      installed = driver
      return { release: () => Promise.resolve() }
    },
    schedule: () => Promise.resolve(succeed({ queued: true } as const)),
    publish: () =>
      Promise.resolve(fail({ kind: 'unavailable', dependency: 'test-host', diagnostic: 'none' })),
    withdraw: () =>
      Promise.resolve(fail({ kind: 'unavailable', dependency: 'test-host', diagnostic: 'none' })),
    directory: {
      connect: () => Promise.resolve(succeed({ kind: 'no-live-route' } as const)),
    },
  }
  // TEST DOUBLE: ledger, store, custody, start authority, environment and executor.
  const test = createTestToolDependencies<string>({
    configuration,
    operationIdentities: identities.operationIdentities,
    sourceIssuer: source.issuer,
    instances: host,
    catalog,
    children: absent.toolChildren,
    guards: {
      access: { qualify: () => Promise.resolve({ kind: 'allowed' }) },
      sources: source.guard,
      grants: new Map(),
      starts: { qualifyStart: () => Promise.resolve({ kind: 'allowed' }) },
      results: {
        text: value =>
          succeed({
            content: [
              {
                kind: 'text',
                id: 'b0' as never,
                visibility: { toHuman: true, toModel: true },
                text: value,
              },
            ],
            data: { kind: 'none' },
            original: { kind: 'none' },
            attachments: [],
          }),
      },
      policy: defaultResultPolicy,
      budgets: {
        arguments: {
          maxBytes: 4_096,
          maxDepth: 16,
          maxItems: 256,
          maxMembers: 64,
          maxStringLength: 1_024,
          maxNumberLength: 32,
        },
      },
    },
    bindingsFor: executor => ({
      inspect: catalog.inspect,
      resolve: () => Promise.resolve(succeed(executor)),
      recover: () =>
        Promise.resolve(
          fail({ kind: 'unavailable', dependency: 'test-binding', diagnostic: 'none' }),
        ),
    }),
  })
  return { clock, catalog, absent, test, installed: () => installed }
}

describe('the production parts under createToolRuntime', () => {
  it('T-COMP the runtime is constructed with the host clock, the Catalog and the absent ports', () => {
    const { clock, catalog, absent, test, installed } = composition()
    const provider = createToolRuntime<string, ContentBlock, unknown>(
      {
        ...test.dependencies,
        clock,
        catalog,
        decisions: absent.toolDecisions,
        resources: absent.toolResourceResponses,
        children: absent.toolChildren,
        resultPolicy: defaultResultPolicy,
      },
      configuration,
    )
    expect(provider.runtime).toBeDefined()
    expect(installed()).not.toBeNull()
  })

  it('T-COMP the construction check names a missing port, so the parts above are what fill them', () => {
    const { clock, catalog, absent, test } = composition()
    const { decisions: _left, ...rest } = test.dependencies
    expect(() =>
      createToolRuntime<string, ContentBlock, unknown>(
        {
          ...rest,
          clock,
          catalog,
          resources: absent.toolResourceResponses,
          children: absent.toolChildren,
          resultPolicy: defaultResultPolicy,
        } as never,
        configuration,
      ),
    ).toThrow(/dependencies\.decisions: missing/u)
  })
})
