import type { Context, Plugin } from '@deepseek-ai/cordis'
import { accessRegistryKey, defineAccessPlugin } from '@omne-harness/access-cordis-contract/cordis'
import { sessionDiagnosticsProtocol } from '@omne-harness/session-diagnostics-protocol'
import { createSessionDiagnosticsContribution } from './contribution.ts'
import type {
  DiagnosticsPrincipals,
  SessionDiagnosticsFaces,
  SessionDiagnosticsSettings,
} from './ports.ts'

export type SessionDiagnosticsAccessPluginInput = Readonly<{
  principals: (ctx: Context) => DiagnosticsPrincipals
  faces: (ctx: Context) => SessionDiagnosticsFaces | undefined
}>

const SESSION_DIAGNOSTICS_ACCESS_PLUGIN = 'session-diagnostics-access'

export function createSessionDiagnosticsAccessPlugin<
  S extends SessionDiagnosticsSettings = SessionDiagnosticsSettings,
>(input: SessionDiagnosticsAccessPluginInput): Plugin.Object {
  return {
    name: SESSION_DIAGNOSTICS_ACCESS_PLUGIN,
    inject: [accessRegistryKey],
    apply(ctx: Context, settings: S) {
      ctx.plugin(
        defineAccessPlugin({
          name: `${SESSION_DIAGNOSTICS_ACCESS_PLUGIN}.contribution`,
          protocol: sessionDiagnosticsProtocol,
          handlers: () =>
            createSessionDiagnosticsContribution({
              faces: () => input.faces(ctx),
              principals: input.principals(ctx),
              settings,
            }),
        }),
      )
    },
  }
}
