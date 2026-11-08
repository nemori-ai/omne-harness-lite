import { noArguments, type SystemActionAuthorization } from '@omne-harness/authorization'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolHistoryAuthority } from '@omne-harness/tool'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { classify } from './principals.ts'

const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'history-upgrade-authorization',
    diagnostic: 'historical upgrade authorization is unavailable',
  })
const denied = () => fail({ kind: 'denied' as const, action: 'upgrade-history' })

export function createToolHistoryAuthority(
  read: () => SystemActionAuthorization | undefined,
): ToolHistoryAuthority<unknown> {
  return {
    async qualify(input) {
      try {
        const who = classify(input.principal)
        if (
          who?.column !== 'system' ||
          !tenantCodec.encode(input.tenant).ok ||
          'failure' in decodeToolCallId(input.call)
        )
          return denied()
        const authorization = read()
        if (authorization === undefined) return unavailable()
        const answer = await authorization.check({
          principal: who.principal,
          scope: 'system',
          operation: { owner: 'tool', name: 'upgrade-history' },
          target: {
            kind: 'tenant',
            tenant: input.tenant,
            resource: { owner: 'tool', kind: 'call', key: input.call },
          },
          arguments: noArguments(),
        })
        switch (answer.kind) {
          case 'allowed':
            return succeed(undefined)
          case 'denied':
            return denied()
          default:
            return unavailable()
        }
      } catch {
        return unavailable()
      }
    },
  }
}
