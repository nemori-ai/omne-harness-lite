import { isAbsolute } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { agentExtensionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import { executionScopeBindingKey } from '@omne-harness/execution-environment-cordis-contract/cordis'
import {
  loopExtensionBuiltinsKey,
  loopExtensionRunLocationsKey,
  loopExtensionViewsKey,
} from '@omne-harness/loop-extension-cordis-contract/cordis'
import { loopExtensionPlugin } from '@omne-harness/loop-extension-host-local/cordis'
import { z } from 'zod'
import { EntryRunLocations } from '../../entry/loop-extensions.ts'
import { currentScope, sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import { defineRow } from '../../row.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'

const absolutePath = z.string().refine(value => isAbsolute(value))

/** The interpreter table is an operator setting: a command extension names an interpreter, this table says which program that is. */
const rowConfig = z.strictObject({
  commands: z
    .strictObject({
      interpreters: z.record(z.string(), absolutePath),
      env: z.record(z.string(), z.string()),
      stateDirectory: absolutePath,
      workspace: absolutePath,
    })
    .optional(),
})

export const loopExtensionRow = defineRow({
  row: 'loop-extension',
  implementation: 'real',
  manifest: {
    provides: [
      loopExtensionViewsKey,
      loopExtensionBuiltinsKey,
      loopExtensionRunLocationsKey,
      agentExtensionsKey,
    ],
    injects: [],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'loopExtension',
    Config: rowConfig,
    async apply(ctx: Context, config: z.infer<typeof rowConfig>) {
      const commands = config.commands
      const scopePorts = {
        readWork: sessionWorkReaderOf(ctx),
        scopeBinding: () => ctx.get(executionScopeBindingKey),
      }
      new EntryRunLocations(ctx, {
        verifier: () => toolRuntimeHolder(ctx).verifier(),
        scope: (tenant, principal, session) => currentScope(scopePorts, tenant, principal, session),
        workspace: () => commands?.workspace,
      })
      if (commands === undefined) return void (await ctx.plugin(loopExtensionPlugin, {}))
      const { workspace: _workspace, ...host } = commands
      await ctx.plugin(loopExtensionPlugin, { commands: host })
    },
  },
})
