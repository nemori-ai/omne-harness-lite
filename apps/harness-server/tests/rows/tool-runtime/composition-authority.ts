// Named doubles for this transport test: Session reads the real SQL snapshot; the adopted
// Agent exposes only Files/Shell. Target policy is allow-all; production policy has separate tests.
import type { Context } from '@deepseek-ai/cordis'
import { AgentAdoptionsService } from '@omne-harness/agent-cordis-contract/cordis'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionAccess } from '@omne-harness/session-contract'
import {
  SessionService,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import {
  installToolTargetPolicy,
  type ToolTargetPolicy,
} from '../../../src/rows/authorization/tool-target-policy.ts'
import type { EntryObjectModule } from '../../../src/types.ts'

class SessionReading extends SessionService<unknown> {
  get work(): SessionService<unknown>['work'] {
    return {
      readWork: (access: SessionAccess<unknown>) => {
        const port = this.ctx.get(sessionTransactionsKey)
        return port === undefined
          ? Promise.resolve(
              fail({ kind: 'unavailable', owner: 'fixture', diagnostic: 'SQL absent' }),
            )
          : port.readWork(access)
      },
    } as SessionService<unknown>['work']
  }
  get management(): never {
    throw new Error('The transport fixture does not expose management')
  }
  get reconciliation(): never {
    throw new Error('The transport fixture does not expose reconciliation')
  }
  get history(): never {
    throw new Error('The transport fixture does not expose history')
  }
}
class Adoptions extends AgentAdoptionsService<unknown> {
  readonly resolve: AgentAdoptionsService<unknown>['resolve'] = async () =>
    succeed({
      definition: {
        category: 'AgentDefinition',
        name: 'transport-fixture',
        attributes: [],
        references: ['Files', 'Shell'].map(name => ({ capability: { category: 'Tool', name } })),
      },
      evaluator: {
        initial() {
          throw new Error('The transport fixture does not evaluate Agent work')
        },
        next() {
          throw new Error('The transport fixture does not evaluate Agent work')
        },
        encode() {
          throw new Error('The transport fixture does not encode Agent work')
        },
        decode() {
          throw new Error('The transport fixture does not decode Agent work')
        },
      },
      extensions: [],
    })
  readonly handover: AgentAdoptionsService<unknown>['handover'] = async () => {
    throw new Error('The transport fixture does not hand over definitions')
  }
}

export function compositionAuthorityWithPolicy(
  policy: (ctx: Context, env: Parameters<EntryObjectModule['install']>[1]) => ToolTargetPolicy,
): EntryObjectModule {
  return {
    name: 'composition-authority-fixture',
    implementation: 'contract-double',
    install(ctx: Context, env) {
      new SessionReading(ctx)
      new Adoptions(ctx)
      installToolTargetPolicy(ctx, policy(ctx, env))
    },
  }
}

export const compositionAuthority = compositionAuthorityWithPolicy(() => ({
  qualify: async () => ({ kind: 'allowed' }),
}))
