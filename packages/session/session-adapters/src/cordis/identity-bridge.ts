import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { principalVerifierKey } from '@omne-harness/identity/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  GuardCommand,
  SessionCommand,
  SessionIdentityBridge,
} from '@omne-harness/session-contract'
import { SessionIdentityBridgeService } from '@omne-harness/session-cordis-contract/cordis'

const IDENTITY_OWNER = 'identity'

const PROTOCOL = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: 'identity-bridge-material',
  revision: '1',
  digest: `sha256:${createHash('sha256').update('identity-bridge-material/1').digest('hex')}`,
})

type Prepared = ReturnType<SessionIdentityBridge<unknown>['prepare']>
type Verdict = Awaited<ReturnType<PrincipalVerifier['verify']>>

function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, member: unknown) => {
    if (typeof member !== 'object' || member === null || Array.isArray(member)) return member
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(member).sort())
      sorted[key] = (member as Readonly<Record<string, unknown>>)[key]
    return sorted
  })
}

export class SessionIdentityBridgeProvider extends SessionIdentityBridgeService<unknown> {
  static readonly inject = [principalVerifierKey]
  private readonly verifier: PrincipalVerifier
  private closed = false

  constructor(ctx: Context) {
    super(ctx)
    this.verifier = ctx.principalVerifier
    ctx.effect(() => () => {
      this.closed = true
    })
  }

  readonly prepare: SessionIdentityBridge<unknown>['prepare'] = async (input, command) => {
    const refused = () => fail({ kind: 'denied' as const, action: command.kind })
    const down = (diagnostic: string) =>
      fail({ kind: 'unavailable' as const, owner: IDENTITY_OWNER, diagnostic })
    if (this.closed) return down('the identity bridge has stopped')

    if (
      !tenantEquals(command.input.tenant, input.tenant) ||
      command.input.session !== input.session
    )
      return refused()

    let verdict: Verdict
    try {
      verdict = await this.verifier.verify(input.principal)
    } catch (cause) {
      return down(`the identity verifier failed: ${describe(cause)}`)
    }
    if (typeof verdict !== 'object' || verdict === null) return down('malformed verdict')
    switch (verdict.kind) {
      case 'rejected':
        return refused()
      case 'unavailable':
        return down(`the identity source is unavailable: ${String(verdict.diagnostic)}`)
      case 'verified':
        break
      default:
        return down('malformed verdict')
    }
    const principal: unknown = verdict.principal
    if (principal !== input.principal || typeof principal !== 'object' || principal === null)
      return down('the verifier answered for another value than the one it was given')
    const kind = (principal as { kind?: unknown }).kind
    if (kind === 'acting-for-tenant') {
      const acting = (principal as { tenant?: unknown }).tenant
      if (
        typeof acting !== 'object' ||
        acting === null ||
        !tenantEquals(acting as TenantId, input.tenant)
      )
        return refused()
    } else if (kind !== 'system') return down('malformed verdict')

    return materialOf(command)
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function materialOf(command: SessionCommand): Awaited<Prepared> {
  let digest: string
  try {
    digest = createHash('sha256').update(canonicalText(command)).digest('hex')
  } catch {
    return fail({
      kind: 'invalid' as const,
      field: 'command',
      reason: 'the command cannot be encoded for the identity material',
    })
  }
  const material: GuardCommand = {
    owner: IDENTITY_OWNER,
    participant: 'identity-bridge',
    protocol: PROTOCOL,
    facts: { kind: 'string', value: digest },
  }
  return succeed(material)
}
