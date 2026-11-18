// @module-tag slow
// Forks a process that is killed with SIGKILL, then reopens its storage.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { AcceptCommand, FormResult, StoreAnswer } from '@omne-harness/notification'
import { channelNameSchema, type DeliveryUnit } from '@omne-harness/notification-contract'
import { openApplication, policy, request, T1 } from '../fixture.ts'
import { openSqlWorld, temporaryRoot } from './world.ts'

it('delivers the unit that was formed before the process was killed, unchanged, and only that one', async () => {
  const root = temporaryRoot()
  const probe = channelNameSchema.parse('probe')
  const recipients = { person: { channel: probe, minLevel: 'weak' as const }, agent: null }
  const command: AcceptCommand = {
    request: request('b1') as never,
    type: { defaults: { person: 'strong', agent: 'off' }, external: false },
    defaults: recipients,
    now: '2026-11-18T06:00:30.000Z' as never,
  }
  const child = fork(
    fileURLToPath(new URL('./crash-child.ts', import.meta.url)),
    [root, JSON.stringify(command)],
    {
      execArgv: [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  child.stderr?.on('data', chunk => {
    stderr += String(chunk)
  })
  const [message] = (await once(child, 'message')) as [{ formed: StoreAnswer<FormResult> }]
  const [, signal] = (await once(child, 'exit')) as [number | null, string | null]
  expect(signal, stderr).toBe('SIGKILL')
  const formed = message.formed
  if (formed.kind !== 'committed' || formed.value.kind !== 'formed')
    throw new Error(JSON.stringify(formed))
  const unit: DeliveryUnit = formed.value.unit

  const world = await openSqlWorld({ root })
  const app = await openApplication({ world, policy: policy({ recipients }) })
  try {
    await app.application.scan()
    await app.application.scan()
    expect(app.probe.deliveries.map(delivery => delivery.unit)).toEqual([unit])
    const page = await world.store.box(T1, {
      recipient: { kind: 'person' },
      filter: 'all',
      after: null,
      limit: 10,
    })
    expect(page.kind === 'read' && page.value.entries.map(entry => entry.title)).toEqual([
      'Build b1 failed',
    ])
  } finally {
    await app.application.close()
    await world.close()
  }
})
