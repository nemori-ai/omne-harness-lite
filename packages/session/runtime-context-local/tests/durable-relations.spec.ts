import { expect, test } from 'vitest'
import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { ContextSessionSeed } from '@omne-harness-lite/runtime-context'
import { createRuntimeContext, projectContext, ContextHistoryInvalid } from '../src/index.ts'
import type { ContextEvent } from '../src/journal-types.ts'
import { host, init, seed, scope, at, identityRegistration, source } from './fixture.ts'

const invalidSeeds: readonly [string, ContextSessionSeed][] = [
  ['required downgrade', { ...seed, required: [{ ...identityRegistration, required: false }] }],
  [
    'unregistered initial key',
    { ...seed, initial: [{ ...seed.initial[0]!, key: 'unregistered' }] },
  ],
  ['fixed value mismatch', { ...seed, fixed: [{ key: 'identity', value: 'different' }] }],
  ['duplicate initial key', { ...seed, initial: [seed.initial[0]!, seed.initial[0]!] }],
]

test.each(invalidSeeds)(
  'initialization rejects %s without creating a durable fact',
  async (_, invalid) => {
    const h = await host()
    try {
      expect(await h.owner.initializer.initializeContextSession(scope, invalid)).toMatchObject({
        reason: 'invalidInput',
      })
      expect(await h.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
    } finally {
      await h.close()
    }
  },
)

function invalidMutation(fault: string, previous: string): ContextEvent {
  const shell = {
    codec: 'runtime-context/1' as const,
    scope,
    revision: `invalid-${fault}`,
    previous,
  }
  const cases: Readonly<Record<string, ContextEvent>> = {
    reinitialize: { ...shell, kind: 'session_initialized', previous: 'absent', seed },
    registrationRevision: {
      ...shell,
      kind: 'registered',
      previous: 'wrong-registration-revision',
      registration: { ...identityRegistration, key: 'public', required: false },
    },
    contentRevision: {
      ...shell,
      kind: 'updated',
      previous: 'wrong-content-revision',
      content: {
        key: 'identity',
        revision: shell.revision,
        observedAt: at,
        value: seed.initial[0]!.value,
      },
    },
    fixedUpdate: {
      ...shell,
      kind: 'updated',
      previous: 'initial',
      content: {
        key: 'identity',
        revision: shell.revision,
        observedAt: at,
        value: 'changed fixed identity',
      },
    },
    requiredRemoval: { ...shell, kind: 'removed', key: 'identity' },
  }
  const event = cases[fault]
  if (!event) throw new Error('unknown fixture fault')
  return event
}

test.each([
  'reinitialize',
  'registrationRevision',
  'contentRevision',
  'fixedUpdate',
  'requiredRemoval',
])('a durably appended %s cannot become a successful current view', async fault => {
  const h = await host()
  let next: ReturnType<typeof createRuntimeContext> | undefined
  try {
    const revision = await init(h)
    h.owner.closeAdmission()
    await h.owner.drain()
    const event = invalidMutation(fault, revision),
      payload = copyJsonValue(event)
    if (!('ok' in payload)) throw new Error('fixture event is not JSON')
    const appended = await h.log.append(
      scope.session,
      [
        {
          tenant: scope.tenant,
          readKeys: ['runtime-context'],
          dedupeKey: `context:${event.revision}`,
          payload: payload.ok,
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    expect(appended).toMatchObject({ positions: [2], tail: 2 })
    const prefix = await h.log.readSince(scope.session, 0)
    if ('failure' in prefix) throw new Error('durable prefix unavailable')
    expect(() => projectContext(scope, prefix.entries, prefix.tail)).toThrow(ContextHistoryInvalid)
    next = createRuntimeContext({
      log: h.log,
      storage: h.storage,
      access: h.auth.operations,
      now: () => at,
    })
    next.sources.registerSource(source())
    expect(await next.operations.registrations(h.access, scope)).toMatchObject({
      reason: 'unavailable',
    })
    const bound = await next.operations.bind(h.tool, scope, 'tool')
    if (bound.kind !== 'bound') throw new Error('authorized reader did not bind')
    expect(await bound.reader.read(['identity'])).toMatchObject({ reason: 'unavailable' })
  } finally {
    next?.closeAdmission()
    await next?.drain()
    await h.close()
  }
})
