import type { Context, Fiber } from '@deepseek-ai/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import type { SourceDeclaration } from '@omne-harness/notification-contract'
import {
  NOTIFICATION_SOURCES_POINT,
  NotificationSourcesService,
  notificationSourcesKey,
} from '@omne-harness/notification-cordis-contract/cordis'
import { accessProtocol } from '@omne-harness/public-contract'
import { createClient, createHttpProtocolTransport } from '@omne-harness/sdk/core'
import { expect, it } from 'vitest'
import { defineRow } from '../../../src/row.ts'
import { freePort } from '../../r9/support.ts'
import { startTree, waitListening } from '../server-entry/support.ts'

class Sources extends NotificationSourcesService {
  readonly lookup = () => ({ kind: 'absent' }) as const

  protected contribute(): () => void {
    return () => undefined
  }
}

const sourcesRow = defineRow({
  row: 'sources-double',
  implementation: 'contract-double',
  manifest: { provides: [notificationSourcesKey], injects: [dynamisKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'sources-double',
    inject: [dynamisKey],
    apply(ctx: Context) {
      ctx.plugin(Sources)
    },
  },
})

/** A row the case reaches into: it registers a source when told, as a module loaded later would. */
function hostRow() {
  let held: Context | undefined
  const row = defineRow({
    row: 'source-host',
    implementation: 'contract-double',
    manifest: { provides: [], injects: [notificationSourcesKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'source-host',
      inject: [notificationSourcesKey],
      apply(ctx: Context) {
        held = ctx
      },
    },
  })
  return {
    row,
    register(name: string): Fiber {
      if (held === undefined) throw new Error('the host row did not start')
      const declaration = { name, label: name, types: [] } as unknown as SourceDeclaration
      return held.plugin({
        name: `source:${name}`,
        inject: [notificationSourcesKey],
        apply(ctx: Context) {
          ;(ctx.get(notificationSourcesKey) as NotificationSourcesService).register(declaration)
        },
      })
    },
  }
}

type Frame = Readonly<{
  kind: string
  revision: number
  points?: readonly Readonly<{ name: string; keys?: readonly string[] }>[]
}>

const sourcesOf = (frame: Frame): readonly string[] | undefined =>
  frame.points?.find(point => point.name === NOTIFICATION_SOURCES_POINT)?.keys

it('a source registered and taken back on a running tree reaches a client as the keys of notification.sources', async () => {
  const port = await freePort()
  const host = hostRow()
  const tree = startTree({
    config: { listenPort: port },
    extraRows: [
      { id: 'sources-double', plugin: 'sourcesRow' },
      { id: 'source-host', plugin: 'sourceHost' },
    ],
    extraPlugins: { sourcesRow, sourceHost: host.row },
  })
  await waitListening(tree, port)
  const access = createClient(
    accessProtocol,
    createHttpProtocolTransport({ origin: `http://127.0.0.1:${port}` }),
  )
  const controller = new AbortController()
  const frames = access.observe.availability({}, { signal: controller.signal })
  const next = async (): Promise<Frame> => {
    const step = await frames.next()
    if (step.done === true) throw new Error('the availability ended')
    return step.value as Frame
  }
  try {
    const first = await next()
    expect(first.kind).toBe('snapshot')
    expect(sourcesOf(first)).toEqual([])

    const fiber = host.register('calendar.events')
    const added = await next()
    expect(added.revision).toBe(first.revision)
    expect(sourcesOf(added)).toEqual(['calendar.events'])

    await fiber.dispose()
    const removed = await next()
    expect(sourcesOf(removed)).toEqual([])
  } finally {
    controller.abort()
    await frames.return({ kind: 'aborted' }).catch(() => undefined)
  }
  const run = await tree.stop()
  expect(run.result.exitCode).toBe(0)
})
