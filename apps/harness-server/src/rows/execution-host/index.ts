import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createHostFilesPlugin } from '@omne-harness/execution-environment-host-local/cordis'
import { executionEnvironmentKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import { z } from 'zod'
import { ConfigError } from '../../config-schema.ts'
import type { HostFilesRuntime } from '../../host-files.ts'
import { defineRow } from '../../row.ts'

export const hostFactoryBindings: Readonly<Record<string, string>> = {
  executionHost: 'execution-host',
}

const absolutePath = z
  .string()
  .refine(value => (process.platform === 'win32' ? /^[a-z]:[\\/]/i.test(value) : isAbsolute(value)))
const rowConfig = z
  .object({
    filesRoot: absolutePath,
    stateDirectory: absolutePath,
    maintainIntervalMs: z.number().int().positive().safe().default(60000),
  })
  .passthrough()

/** Binds the released factory once, before any row can run. */
export function createExecutionHostBinding(runtime: HostFilesRuntime) {
  const factory = createHostFilesPlugin(runtime.domain)
  function parseConfig(value: unknown) {
    const parsed = rowConfig.safeParse(value)
    if (!parsed.success)
      throw new ConfigError('invalid-config', 'invalid execution-host configuration')
    const { maintainIntervalMs, ...memberInput } = parsed.data
    const member = factory.Config['~standard'].validate(memberInput)
    if ('issues' in member)
      throw new ConfigError('invalid-config', 'invalid execution-host configuration')
    return { maintainIntervalMs, member: member.value }
  }
  const plugin = defineRow({
    row: 'execution-host',
    implementation: 'real',
    lifecycle: { kind: 'none' },
    manifest: { provides: [], injects: [executionEnvironmentKey], sameProviderGroup: null },
    plugin: {
      name: 'executionHost',
      inject: factory.inject,
      apply(ctx: Context, value: unknown) {
        const config = parseConfig(value)
        factory.apply(ctx, config.member)
        runtime.start(config.maintainIntervalMs)
      },
    },
  })
  // Preserve the factory's provider caller until the shared row wrapper carries it.
  plugin.inject = factory.inject
  return { plugin, parseConfig }
}
