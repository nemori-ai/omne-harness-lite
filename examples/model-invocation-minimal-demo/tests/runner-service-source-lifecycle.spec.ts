import { mkdir, mkdtemp } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { AfterModelCallFailureSubject } from '@omne-harness-lite/loop-extension'
import type {
  RunnerDispatchRequest,
  RunnerDispatchScope,
} from '@omne-harness-lite/loop-extension-runner'
import type { SettlementLogBinding } from '@omne-harness-lite/model-request-runtime'
import type {
  ModelFailureSource,
  ModelRuntimeOperations,
} from '@omne-harness-lite/model-request-runtime'
import { openSqlLogFixture } from './sql-log-fixture.ts'
import { createDemoRunnerHost } from '../src/runner-host.ts'
import {
  createDemoRunnerServiceHost,
  type DemoRunnerExternalExecution,
} from '../src/runner-service-host.ts'
import type { AuthenticatedActor } from '../src/types.ts'

// v17 M17-V8 / v18 F18-V5: the example host owns the source borrow on every exit path.
// The runtime service and source here are counting doubles; the real service is exercised by
// runner-service-assembly and runner-service-m17-f18. These rows do not prove runtime behavior.

const session = unwrap(parseOpaqueIdentifier('source-lifecycle-session', 'SessionRef'))
const tenant = unwrap(parseTenantId({ organization: 'lifecycle-org', account: 'lifecycle-acct' }))
const adaptation = {
  implementation: { name: 'lifecycle', revision: '1' },
  definition: { modelId: 'lifecycle/model', revision: '1' },
  configuration: { revision: '1', values: {} },
}
const profile = {
  adaptation,
  providers: ['A'],
  allowFallback: false,
  inputModalities: ['text'],
  outputModalities: ['text'],
  maxInputTokens: 100,
  maxOutputTokens: 20,
  inputConstraints: {},
  upstreamInputLimits: {
    maxInputTokens: { status: 'unknown' },
    maxRequestBytes: { status: 'unknown' },
  },
  updatedAt: '2026-09-29T00:00:00Z',
} as const
const subject: AfterModelCallFailureSubject = {
  failure: 'upstream_unavailable',
  profile,
  dispatches: [
    {
      kind: 'model_call_dispatched',
      call: 'lifecycle-call',
      dispatch: 1,
      response: 'lifecycle-response',
      provider: 'A',
      adaptation,
      profile: { origin: 'official', routeName: 'lifecycle/model' },
      profileSnapshot: profile,
      parameters: {},
      selectedBy: 'session',
      credentialScope: { layer: 'factory' },
    },
  ],
  retryConclusions: [],
}
const request: RunnerDispatchRequest = {
  position: 'after_model_call',
  dimension: { ending: 'failure' },
  subject,
  manifest: session,
  anchor: 'lifecycle-call',
  run: 'lifecycle-run',
  attempt: 2,
}
const external: DemoRunnerExternalExecution = {
  readAskState: async () => ({ kind: 'unavailable' }),
  openHandles: async () => ({ unavailable: true }),
  mintReminder: () => ({ unavailable: true }),
  fallbackNeedsProjection: async () => false,
  commandPresence: async () => 'unavailable',
  invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
}

async function fixture(
  label: string,
  verify: ModelFailureSource['verify'],
  externalPort: () => Promise<DemoRunnerExternalExecution | { readonly unavailable: true }>,
) {
  const root = resolve(process.cwd(), '../../tmp/runner-service-source-lifecycle')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(root, `${label}-`))
  const options = {
    dir,
    processOwnership: { current: label, observeExit: async () => 'exited' as const },
  }
  const log = await openSqlLogFixture({ dir: options.dir })
  const generation = Object.freeze({})
  const binding: SettlementLogBinding = {
    session,
    tenant,
    log,
    generation,
    currentGeneration: () => generation,
  }
  const runnerHost = createDemoRunnerHost(log, log.backing.ownerGeneration)
  const released = { source: 0, verify: 0, external: 0 }
  const source: ModelFailureSource = {
    subject,
    verify(candidate, execution) {
      released.verify++
      return verify(candidate, execution)
    },
    release() {
      released.source++
    },
  }
  const model = {
    readAttempts: vi.fn(async (_key: unknown, options?: { readonly consumeFailure: true }) => {
      const result = { state: 'awaiting_decision', dispatches: [], failureSubject: subject }
      return options === undefined ? result : { result, consumption: { kind: 'failure', source } }
    }),
    canDispatchAgain: vi.fn(async () => ({ allowed: true })),
  }
  const host = createDemoRunnerServiceHost({
    runnerHost,
    // A counting double for the two methods this adapter consumes.
    model: () => model as unknown as ModelRuntimeOperations,
    manifest: {} as never,
    history: { read: async () => ({ unavailable: true }) } as never,
    sessionTenancy: {} as never,
    authorize: async () => ({ actor: { tenant } as unknown as AuthenticatedActor, binding }),
    external: async () => {
      released.external++
      return await externalPort()
    },
    now: () => '2026-09-29T00:00:00Z',
    selectedRun: () => undefined,
  })
  return {
    host,
    model,
    released,
    async close() {
      expect((await runnerHost.close()).complete).toBe(true)
    },
  }
}

const authoritative: ModelFailureSource['verify'] = () => ({ authoritativeSubject: subject })

describe('M17-V8/F18-V5 the example host releases the failure source on every path', () => {
  it('releases before external acquisition when the actual execution does not verify', async () => {
    const f = await fixture(
      'invalid',
      () => ({ invalidInput: true }),
      async () => external,
    )
    try {
      expect(await f.host.acquireDispatch(request, new AbortController().signal)).toEqual({
        failure: 'invalidInput',
      })
      expect(f.released).toEqual({ source: 1, verify: 1, external: 0 })
    } finally {
      await f.close()
    }
  })

  it('releases when the external owner is unavailable or throws after cancellation', async () => {
    const unavailable = await fixture('external-unavailable', authoritative, async () => ({
      unavailable: true,
    }))
    const controller = new AbortController()
    try {
      controller.abort()
      expect(await unavailable.host.acquireDispatch(request, controller.signal)).toEqual({
        failure: 'unavailable',
      })
      expect(unavailable.released).toEqual({ source: 1, verify: 1, external: 1 })
    } finally {
      await unavailable.close()
    }
    const throwing = await fixture('external-throws', authoritative, async () => {
      throw new Error('external owner failed')
    })
    try {
      await expect(
        throwing.host.acquireDispatch(request, new AbortController().signal),
      ).rejects.toThrow('external owner failed')
      expect(throwing.released).toEqual({ source: 1, verify: 1, external: 1 })
    } finally {
      await throwing.close()
    }
  })

  it('forwards only the prepared actual execution and releases once the runner scope ends', async () => {
    const f = await fixture('verified', authoritative, async () => external)
    try {
      const scope = await f.host.acquireDispatch(request, new AbortController().signal)
      if ('failure' in scope) throw Error(`scope unavailable: ${JSON.stringify(scope)}`)
      const dispatchScope: RunnerDispatchScope = scope
      const positioned = {
        position: 'after_model_call',
        dimension: { ending: 'failure' },
        subject,
      } as const
      const verify = dispatchScope.ports.verifyFailure
      expect(await verify(positioned, dispatchScope.binding, { kind: 'noRun' })).toEqual({
        kind: 'invalidInput',
      })
      expect(
        await verify(positioned, dispatchScope.binding, {
          kind: 'withRun',
          run: 'lifecycle-run',
          attempt: 3,
        }),
      ).toEqual({ kind: 'invalidInput' })
      expect(
        await verify(
          positioned,
          { ...dispatchScope.binding },
          {
            kind: 'withRun',
            run: 'lifecycle-run',
            attempt: 2,
          },
        ),
      ).toEqual({ kind: 'unavailable' })
      expect(f.released.verify).toBe(1)
      expect(
        await verify(positioned, dispatchScope.binding, {
          kind: 'withRun',
          run: 'lifecycle-run',
          attempt: 2,
        }),
      ).toMatchObject({ kind: 'verified', subject: positioned })
      expect(f.released).toEqual({ source: 0, verify: 2, external: 1 })
      dispatchScope.release()
      dispatchScope.release()
      expect(f.released.source).toBeGreaterThanOrEqual(1)
      expect(
        await verify(positioned, dispatchScope.binding, {
          kind: 'withRun',
          run: 'lifecycle-run',
          attempt: 2,
        }),
      ).toEqual({ kind: 'unavailable' })
      expect(f.released.verify).toBe(2)
    } finally {
      await f.close()
    }
  })
})
