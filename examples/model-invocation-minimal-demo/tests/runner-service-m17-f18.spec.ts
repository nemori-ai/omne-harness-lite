import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import type { ExtensionInput } from '@omne-harness-lite/loop-extension'
import { createRunnerImplementationRegistry } from '@omne-harness-lite/loop-extension-runner-local'
import { type RunnerLogBinding } from '@omne-harness-lite/loop-extension-runner'
import { parseTenantId } from '@omne-harness-lite/identity-values'
import { projectRunnerRetryGuard } from '../src/runner-service-host.ts'
import { RUN, ready } from './runner-service-fixture.ts'
import { failurePort } from './readme-literals/failure-port.ts'
import { inspectFailure } from './readme-literals/inspect-failure.ts'
import { registerDefaultRetry } from './readme-literals/register-default-retry.ts'

// v17 M17-V8/V11/V12 and v18 F18-V5/V7 against the built runtime/runner packages, the real
// Cordis runner service, SQLite, SQL journal and local TLS. The controlled Run reader is a
// test source; it does not certify the production G28 Run terminal owner.

const root = new URL('../../../', import.meta.url)
async function block(readme: string, marker: string): Promise<string> {
  const text = await readFile(new URL(readme, root), 'utf8')
  const found = [...text.matchAll(/^```ts\n([\s\S]*?)^```$/gm)]
    .map(match => match[1] ?? '')
    .filter(body => body.includes(marker))
  expect(found).toHaveLength(1)
  return found[0] ?? ''
}

describe('F18-V7/M17-V12 README consumption literals are the compiled and executed code', () => {
  it('keeps each literal byte-identical in the English and Chinese package READMEs', async () => {
    const literals = [
      ['packages/model/model-request-runtime-local', 'inspectFailure', 'inspect-failure.ts'],
      [
        'packages/model/model-request-runtime-local',
        'registerDefaultRetry',
        'register-default-retry.ts',
      ],
      ['packages/agent-loop/loop-extension-runner-local', 'failurePort', 'failure-port.ts'],
    ] as const
    for (const [pkg, marker, file] of literals) {
      const compiled = await readFile(new URL(`./readme-literals/${file}`, import.meta.url), 'utf8')
      expect(await block(`${pkg}/README.md`, marker)).toBe(compiled)
      expect(await block(`${pkg}/README_ZH.md`, marker)).toBe(compiled)
    }
  })

  it('registers the P5 literal once with a real runner registry and withdraws only its generation', async () => {
    const registry = createRunnerImplementationRegistry()
    const dispose = registerDefaultRetry(registry)
    expect(() => registerDefaultRetry(registry)).toThrow('already registered')
    const lease = registry.capture('omne-official:default-retry')
    if ('absent' in lease) throw Error('registered contribution absent')
    const log = unwrap(parseOpaqueIdentifier('literal-log', 'LogHandle'))
    const environment = unwrap(parseOpaqueIdentifier('literal-environment', 'EnvironmentHandle'))
    const adaptation = {
      implementation: { name: 'literal', revision: '1' },
      definition: { modelId: 'literal/model', revision: '1' },
      configuration: { revision: '1', values: {} },
    }
    const profile = {
      adaptation,
      providers: ['A', 'B'],
      allowFallback: true,
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
    }
    const input = {
      position: 'after_model_call',
      dimension: { ending: 'failure' },
      subject: {
        failure: 'upstream_unavailable',
        profile,
        dispatches: [
          {
            kind: 'model_call_dispatched',
            call: 'literal-call',
            dispatch: 1,
            response: 'literal-response',
            provider: 'A',
            adaptation,
            profile: { origin: 'official', routeName: 'literal/model' },
            profileSnapshot: profile,
            parameters: {},
            selectedBy: 'session',
            credentialScope: { layer: 'factory' },
          },
        ],
        retryConclusions: [],
      },
      run: 'literal-run',
      attempt: 1,
      earlier: [],
      log,
      environment,
    } as ExtensionInput
    // full jitter at sample 0.25 of min(1s*2^0, 30s) = 0.25s; the literal owns no timer.
    expect(await lease.invoke(input, new AbortController().signal, { kind: 'fresh' })).toEqual({
      kind: 'output',
      value: { kind: 'retry', plan: { provider: 'B', after: 'PT0.25S' } },
    })
    dispose()
    dispose()
    expect(registry.capture('omne-official:default-retry')).toEqual({ absent: true })
    const next = registerDefaultRetry(registry)
    next()
  })
})

describe('M17-V11/V12 and F18-V5/V7 on the real withRun P5 failure', () => {
  it('projects every real canDispatchAgain branch and consumes the source through the literals', async () => {
    const f = await ready('m17-f18-real-guard')
    let closed = false
    try {
      const key = { session: f.session, callId: f.callId }
      const guard = async (plan: unknown, callId = f.callId) =>
        projectRunnerRetryGuard(
          await f.service.canDispatchAgain({ session: f.session, callId, plan: plan as never }),
        )
      expect(await guard(f.plan)).toEqual({ kind: 'accepted' })
      expect(await guard({ provider: 'not-a-profile-provider' })).toEqual({
        kind: 'rejected',
        reason: 'provider_not_allowed',
      })
      expect(await guard(f.plan, 'call-that-never-existed')).toEqual({
        kind: 'rejected',
        reason: 'callNotFound',
      })
      expect(await guard({ provider: '' })).toEqual({ kind: 'invalidInput' })

      // M17-V12: an ordinary call carries no resource; the technical form is not serializable.
      const ordinary = await f.service.readAttempts(key)
      expect(Object.hasOwn(ordinary, 'consumption')).toBe(false)
      expect(JSON.parse(JSON.stringify(ordinary))).toMatchObject({ state: 'awaiting_decision' })
      const borrowed = await f.service.readAttempts(key, { consumeFailure: true })
      if (borrowed.consumption.kind !== 'failure') throw Error('failure source absent')
      const retained = borrowed.consumption.source
      expect(() => structuredClone(retained)).toThrow()
      const serialized = JSON.parse(JSON.stringify(borrowed))
      expect(serialized.consumption.source.verify).toBeUndefined()
      expect(serialized.consumption.source.release).toBeUndefined()

      // F18-V7: the runtime README literal against the actual execution.
      expect(await inspectFailure(f.service, key, { run: RUN, attempt: 1 })).toHaveProperty(
        'authoritativeSubject',
      )
      expect(await inspectFailure(f.service, key, { run: RUN, attempt: 2 })).toHaveProperty(
        'authoritativeSubject',
      )
      expect(await inspectFailure(f.service, key, { run: 'another-run', attempt: 1 })).toEqual({
        invalidInput: true,
      })

      // F18-V7: the runner README literal forwards only the actual execution.
      const tenant = parseTenantId({ organization: 'literal-org', account: 'literal-account' })
      if (!('ok' in tenant)) throw Error('literal tenant')
      const paired: RunnerLogBinding = Object.freeze({
        session: f.session,
        tenant: tenant.ok,
        logGeneration: 'literal-generation',
      })
      const portSource = await f.service.readAttempts(key, { consumeFailure: true })
      if (portSource.consumption.kind !== 'failure') throw Error('port source absent')
      const source = portSource.consumption.source
      const port = failurePort(source, paired)
      const positioned = {
        position: 'after_model_call',
        dimension: { ending: 'failure' },
        subject: source.subject,
      } as const
      expect(await port(positioned, paired, { kind: 'noRun' })).toEqual({ kind: 'invalidInput' })
      expect(
        await port(positioned, { ...paired }, { kind: 'withRun', run: RUN, attempt: 1 }),
      ).toEqual({ kind: 'unavailable' })
      expect(
        await port(positioned, paired, { kind: 'withRun', run: 'another-run', attempt: 1 }),
      ).toEqual({ kind: 'invalidInput' })
      const verified = await port(positioned, paired, { kind: 'withRun', run: RUN, attempt: 2 })
      if (verified.kind !== 'verified') throw Error(`literal port: ${JSON.stringify(verified)}`)
      expect(verified.subject).toEqual(positioned)
      verified.release()
      source.release()
      expect(await port(positioned, paired, { kind: 'withRun', run: RUN, attempt: 1 })).toEqual({
        kind: 'unavailable',
      })

      // A cancelled runner request acquires no failure source, external owner or model send.
      if (!('failureSubject' in ordinary) || ordinary.failureSubject === undefined)
        throw Error('failed subject absent')
      const aborted = new AbortController()
      aborted.abort()
      const beforeCancelled = await f.app.readSessionLog(f.who, f.session)
      expect(
        await f.app.dispatchRunner(
          f.who,
          f.session,
          {
            position: 'after_model_call',
            dimension: { ending: 'failure' },
            subject: ordinary.failureSubject,
            manifest: f.session,
            anchor: f.callId,
            run: RUN,
            attempt: 1,
          },
          aborted.signal,
        ),
      ).toEqual({ failure: 'cancelled' })
      expect(await f.app.readSessionLog(f.who, f.session)).toEqual(beforeCancelled)

      // The runtime still rechecks the guard on dispatchAgain; release ends the call first.
      expect(await f.service.releaseCall(key)).toEqual({ callId: f.callId, state: 'handed_up' })
      expect(await guard(f.plan)).toEqual({ kind: 'rejected', reason: 'alreadyEnded' })
      expect(f.tls.requests).toHaveLength(1)
      expect(retained.verify(retained.subject, { run: RUN, attempt: 1 })).toHaveProperty(
        'authoritativeSubject',
      )
      await f.close()
      closed = true
      expect(await guard(f.plan)).toEqual({ kind: 'unavailable' })
      // Closing the runtime revokes a borrow its caller never released.
      expect(retained.verify(retained.subject, { run: RUN, attempt: 1 })).toEqual({
        unavailable: true,
      })
      retained.release()
    } finally {
      if (!closed) await f.close()
    }
  })
})
