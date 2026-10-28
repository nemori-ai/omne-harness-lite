import assert from 'node:assert/strict'
import { conformanceCase, succeeded, refused, type ConformanceCase } from './testing-case.ts'
import {
  adoption,
  creation,
  evidence,
  inputId,
  memoryAccess,
  memoryOtherAccess,
  operationId,
} from './testing-values.ts'
import type {
  MemoryAgentDrive,
  MemoryScopeRelease,
  MemorySessionIdleInput,
  MemorySessionNotifier,
} from './testing-providers.ts'
import type {
  MemorySessionClock,
  MemorySessionContextInput,
  MemorySessionEvidenceBridge,
  ScriptedSessionIdentityBridge,
} from './testing-ports.ts'
import type { DriveTarget, SessionCommand } from './ports.ts'
import type { AdvanceRef, ConsumptionId } from './identity.ts'

const access = memoryAccess('tester')
const command: Extract<SessionCommand, { kind: 'create' }> = {
  kind: 'create',
  input: {
    tenant: access.tenant,
    session: access.session,
    operation: operationId('provider-create'),
    creation: creation(),
  },
}

export function sessionIdentityBridgeConformance(): readonly ConformanceCase<
  ScriptedSessionIdentityBridge<string>
>[] {
  const otherTenant = memoryOtherAccess('tester')
  const otherSession = memoryAccess('tester', 'another-session')
  const changed: readonly Readonly<{
    name: string
    access: typeof access
    command: SessionCommand
  }>[] = [
    {
      name: 'tenant',
      access: otherTenant,
      command: { ...command, input: { ...command.input, tenant: otherTenant.tenant } },
    },
    {
      name: 'session',
      access: otherSession,
      command: { ...command, input: { ...command.input, session: otherSession.session } },
    },
    {
      name: 'operation',
      access,
      command: {
        ...command,
        input: { ...command.input, operation: operationId('another-operation') },
      },
    },
    {
      name: 'command kind',
      access,
      command: { kind: 'control', input: { ...command.input, intent: { kind: 'archive' } } },
    },
    {
      name: 'command contents',
      access,
      command: {
        ...command,
        input: {
          ...command.input,
          creation: {
            ...command.input.creation,
            requiredIdentities: [{ capability: 'login', name: 'another-identity' }],
          },
        },
      },
    },
  ]
  return [
    conformanceCase(
      'SessionIdentityBridge',
      'identity preparation preserves qualified scope and refuses denied or unavailable sources',
      async port => {
        assert.equal(succeeded(await port.prepare(access, command), 'prepare').owner, 'identity')
        port.controls.script('deny')
        assert.equal(refused(await port.prepare(access, command), 'denied').kind, 'denied')
        port.controls.script('unavailable')
        assert.equal(refused(await port.prepare(access, command), 'down').kind, 'unavailable')
      },
    ),
    ...changed.map(target =>
      conformanceCase<ScriptedSessionIdentityBridge<string>>(
        'SessionIdentityBridge',
        `identity material changes with its ${target.name}`,
        async port => {
          const original = succeeded(await port.prepare(access, command), 'original')
          const replacement = succeeded(
            await port.prepare(target.access, target.command),
            target.name,
          )
          assert.notDeepEqual(
            replacement,
            original,
            `identity material reused across ${target.name}`,
          )
        },
      ),
    ),
  ]
}
export function sessionEvidenceBridgeConformance(): readonly ConformanceCase<MemorySessionEvidenceBridge>[] {
  return [
    conformanceCase(
      'SessionEvidenceBridge',
      'evidence preparation supplies materials and preserves source failure',
      async port => {
        assert.ok(succeeded(await port.prepare(command), 'prepare').length > 0)
        port.controls.unavailable(true)
        assert.equal(refused(await port.prepare(command), 'down').kind, 'unavailable')
      },
    ),
  ]
}
export function sessionContextInputConformance(): readonly ConformanceCase<
  MemorySessionContextInput<string>
>[] {
  return [
    conformanceCase(
      'SessionContextInput',
      'Context preparation supplies registration material without hiding unavailable',
      async port => {
        assert.ok(
          succeeded(await port.prepare(access, command), 'prepare').some(
            item => item.owner === 'runtime-context',
          ),
        )
        port.controls.unavailable(true)
        assert.equal(refused(await port.prepare(access, command), 'down').kind, 'unavailable')
      },
    ),
  ]
}
export function sessionClockConformance(): readonly ConformanceCase<MemorySessionClock>[] {
  return [
    conformanceCase(
      'SessionClock',
      'clock waits observe elapsed and cancellation and sample retains evidence',
      async port => {
        assert.ok(succeeded(await port.sample(), 'sample').source.digest)
        const first = new AbortController()
        const elapsed = port.waitUntil(port.controls.instantAfter(10), first.signal)
        port.controls.advance(10)
        assert.equal(await elapsed, 'elapsed')
        const second = new AbortController()
        const cancelled = port.waitUntil(port.controls.instantAfter(100), second.signal)
        second.abort()
        assert.equal(await cancelled, 'cancelled')
        port.controls.unavailable(true)
        assert.equal(refused(await port.sample(), 'down').kind, 'unavailable')
      },
    ),
  ]
}
export function sessionIdleInputConformance(): readonly ConformanceCase<
  MemorySessionIdleInput<string>
>[] {
  return [
    conformanceCase(
      'SessionIdleInput',
      'idle inspect and prepare retain unknown coverage and unavailable',
      async port => {
        const time = {
          at: '2026-01-01T00:00:00Z',
          protocol: adoption('clock'),
          source: evidence('clock'),
        }
        const observation = succeeded(await port.inspect({ ...access, time }), 'inspect')
        assert.equal(observation.kind, 'unknown')
        const record: Extract<SessionCommand, { kind: 'recordIdle' }> = {
          kind: 'recordIdle',
          input: {
            ...command.input,
            expected: '1' as import('./identity.ts').SessionRevision,
            observation,
          },
        }
        assert.ok(succeeded(await port.prepare(access, record), 'prepare').length > 0)
        port.controls.unavailable(true)
        assert.equal(refused(await port.inspect({ ...access, time }), 'down').kind, 'unavailable')
        assert.equal(
          refused(await port.prepare(access, record), 'down prepare').kind,
          'unavailable',
        )
      },
    ),
  ]
}
export function sessionNotifierConformance(): readonly ConformanceCase<MemorySessionNotifier>[] {
  return [
    conformanceCase(
      'SessionNotifier',
      'notification is an optional wake-up and can be dropped',
      async port => {
        const notification = {
          tenant: access.tenant,
          session: access.session,
          revision: '1' as import('./identity.ts').SessionRevision,
          source: evidence('commit'),
          kinds: ['session.created'],
        }
        await port.committed(notification)
        assert.deepEqual(port.controls.notifications(), [notification])
        port.controls.drop(true)
        await port.committed(notification)
        assert.deepEqual(port.controls.notifications(), [notification])
      },
    ),
  ]
}
export function scopeReleaseConformance(): readonly ConformanceCase<MemoryScopeRelease>[] {
  return [
    conformanceCase(
      'ScopeReleasePort',
      'scope release preserves original task and mixed readback',
      async port => {
        const input = {
          tenant: access.tenant,
          session: access.session,
          task: operationId('archive'),
          scope: 'scope',
        }
        for (const disposition of [
          'pending',
          'unsupported',
          'unavailable',
          'not-authorized',
          'released',
        ] as const) {
          port.controls.dispositions(['released', disposition])
          assert.deepEqual((await port.release(input)).dispositions, ['released', disposition])
        }
        assert.ok(
          port.controls
            .requests()
            .every(request => request.task === input.task && request.scope === input.scope),
        )
      },
    ),
  ]
}
export function agentDriveConformance(): readonly ConformanceCase<MemoryAgentDrive>[] {
  return [
    conformanceCase(
      'AgentDrivePort',
      'drive recalls operations and exposes inspect and prewarm closed failures',
      async port => {
        const target: DriveTarget = {
          tenant: access.tenant,
          session: access.session,
          execution: 'execution',
          operation: 'invoke',
        }
        const missing = await port.inspect(target)
        assert.ok('ok' in missing && missing.ok.state === 'missing')
        const input = {
          ...target,
          first: inputId('first'),
          source: evidence('input'),
          grant: evidence('grant'),
        }
        const invoked = await port.invoke(input)
        assert.ok('ok' in invoked)
        assert.deepEqual(await port.invoke(input), invoked)
        const conflict = await port.invoke({ ...input, first: inputId('other') })
        assert.ok('failure' in conflict && conflict.failure.kind === 'conflict')
        assert.deepEqual(await port.query(target), { ok: 'committed' })
        assert.deepEqual(await port.query({ ...target, operation: 'unseen' }), { ok: 'unknown' })
        assert.ok(
          'ok' in
            (await port.submit({
              ...target,
              operation: 'submit',
              input: inputId('next'),
              source: evidence('next'),
            })),
        )
        const advance = {
          run: 'run',
          attempt: 'attempt',
          instance: { owner: 'agent', id: 'instance' },
        } as AdvanceRef
        assert.ok('ok' in (await port.detach({ ...target, operation: 'detach', advance })))
        assert.ok(
          'ok' in
            (await port.resume({
              ...target,
              operation: 'resume',
              recovery: evidence('recovery'),
              grant: evidence('grant'),
            })),
        )
        assert.ok(
          'ok' in
            (await port.control({
              ...target,
              operation: 'control',
              control: operationId('control'),
              intent: { kind: 'archive' },
            })),
        )
        assert.ok(
          'ok' in
            (await port.recordResult({
              ...target,
              operation: 'result',
              consumption: 'consumption' as ConsumptionId,
              result: {
                producer: { kind: 'tool', call: 'call' },
                version: '1',
                delivery: null,
                source: evidence('result'),
              },
              transfer: { kind: 'none' },
              release: { kind: 'pending' },
            })),
        )
        const warm = {
          tenant: target.tenant,
          session: target.session,
          adoption: adoption('agent'),
          counters: evidence('counters'),
        }
        assert.deepEqual(await port.prewarm(warm), { failure: { kind: 'unsupported' } })
        port.controls.denied(true)
        assert.deepEqual(await port.inspect(target), { failure: { kind: 'denied' } })
        assert.deepEqual(await port.prewarm(warm), { failure: { kind: 'denied' } })
        port.controls.denied(false)
        port.controls.unavailable(true)
        const down = await port.inspect(target)
        assert.ok('failure' in down && down.failure.kind === 'unavailable')
      },
    ),
  ]
}
