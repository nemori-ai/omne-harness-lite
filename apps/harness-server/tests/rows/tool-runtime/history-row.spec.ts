import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createDisabledTelemetry } from '@omne-harness/telemetry-node'
import { expect, it, vi } from 'vitest'
import { toolRecordsRow } from '../../../src/rows/tool-runtime/index.ts'
import { toolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { toolRowsOperatorConfig } from '../../r9/support.ts'

it('does not create or publish the runtime while tenant inspection is pending or withdrawn', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tool-history-row-'))
  const root = new Context()
  const logs: string[] = []
  root.logger.exporter({
    levels: { default: 3 },
    export: value => logs.push(JSON.stringify(value)),
  })
  const result = Promise.withResolvers<{ kind: 'ready'; revision: string; entries: [] }>()
  const enumerate = vi.fn(async () => {
    return result.promise
  })
  await root.plugin({
    apply(ctx: Context) {
      ctx.provide('storage', {})
      ctx.provide('tenantDomainLookup', {})
      ctx.provide('tenantDomains', { enumerate })
      ctx.provide('telemetry', createDisabledTelemetry().port)
      ctx.provide('tenantDomainScannerPrincipal', {})
      ctx.provide('toolHistoryUpgraderPrincipal', {})
    },
  })
  const authorization = await root.plugin({
    apply(ctx: Context) {
      ctx.provide('systemActionAuthorization', {})
    },
  })
  root.plugin(
    toolRecordsRow,
    toolRowsOperatorConfig({ storageRoot: join(directory, 'storage') }).records,
  )
  try {
    await vi.waitFor(() => expect(enumerate, logs.join('\n')).toHaveBeenCalled())
    expect(toolRuntimeHolder(root).bundle).toBeNull()
    expect(root.get('toolCommands', false)).toBeUndefined()
    const removed = authorization.dispose()
    result.resolve({ kind: 'ready', revision: '1', entries: [] })
    await removed
    expect(toolRuntimeHolder(root).bundle).toBeNull()
    expect(root.get('toolCommands', false)).toBeUndefined()
    expect(enumerate).toHaveBeenCalledTimes(1)
  } finally {
    result.resolve({ kind: 'ready', revision: '1', entries: [] })
    await root.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
