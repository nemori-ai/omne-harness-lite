// The agentAccountOutlet plugin: the account outlet of Agent as a Cordis service. It injects
// requestContext and contextAccountingInbox, which the request-context row provides in one fiber.
// Without either of them the plugin stays pending and provides nothing.
import type { Context } from '@deepseek-ai/cordis'
import type { AgentAccountOutlet } from '@omne-harness/agent-contract'
import { AgentAccountOutletService } from '@omne-harness/agent-cordis-contract/cordis'
import { standardSchema, type Adoption, type Decoder } from '@omne-harness/request-context-contract'
import {
  contextAccountingInboxKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { absentAccountTarget, createAgentAccountOutlet } from './account-outlet.ts'

/** The plugin configuration: the adoption identity that the outlet gives as the sender. */
export type AgentAccountOutletConfig = Readonly<{ sender: Adoption }>

const TEXT_FIELDS = ['owner', 'name', 'revision', 'digest'] as const
const decodeConfig: Decoder<AgentAccountOutletConfig> = (value, path) => {
  const fail = (message: string) => ({ ok: false as const, issues: [{ path, message }] })
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return fail('The plugin configuration must be an object')
  const keys = Object.keys(value)
  if (keys.length !== 1 || keys[0] !== 'sender')
    return fail('The plugin configuration has exactly one field: sender')
  const sender: unknown = (value as { sender: unknown }).sender
  if (typeof sender !== 'object' || sender === null || Array.isArray(sender))
    return fail('sender must be an adoption')
  const fields = sender as Record<string, unknown>
  const ok =
    Object.keys(fields).length === TEXT_FIELDS.length &&
    TEXT_FIELDS.every(name => typeof fields[name] === 'string')
  return ok
    ? { ok: true, value: value as AgentAccountOutletConfig }
    : fail('sender must be an adoption: owner, name, revision and digest, all text')
}

/**
 * Provides agentAccountOutlet. The first wave gives no target resolver (ACCT-TARGET), so every
 * delivery answers unavailable with scope-unresolved. The service ends with its fiber; a reference
 * kept past that answers unavailable, never a success.
 */
export class AgentAccountOutletProvider extends AgentAccountOutletService<unknown> {
  static readonly inject = [requestContextKey, contextAccountingInboxKey]
  /** Checked before the constructor runs; a configuration that does not fit fails the load. */
  static readonly Config = standardSchema(decodeConfig)
  private closed = false
  readonly deliver: AgentAccountOutlet<unknown>['deliver']

  constructor(ctx: Context, config: AgentAccountOutletConfig) {
    super(ctx)
    const outlet = createAgentAccountOutlet({
      inbox: ctx.contextAccountingInbox,
      sender: config.sender,
      resolveTarget: absentAccountTarget,
    })
    this.deliver = async input =>
      this.closed ? { kind: 'unavailable', diagnostic: 'outlet-closed' } : outlet.deliver(input)
    ctx.effect(() => () => {
      this.closed = true
    })
  }
}
