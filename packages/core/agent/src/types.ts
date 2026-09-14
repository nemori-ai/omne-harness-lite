/**
 * Local compilation projection of DSH agent types. This is not a product
 * Session/Agent data contract; see the package README and fork plan.
 * Derived from DeepSeek source (c) 2026, MIT; see LICENSE and provenance.json.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Scoped } from '@omne-harness-lite/scope/baseline'

/** Only the fields read by the retained source mechanisms. */
export interface Agent {
  readonly id: string
  readonly session: { readonly id: string }
  readonly ctx: Context
}

/** Optional validation/commit hook supplied to an external factory. */
export interface AgentSetupCommit {
  commit(): void
}
export type AgentSetup = (
  agentCtx: Context,
  agent: Agent,
) => AgentSetupCommit | Promise<AgentSetupCommit | void> | void

/** Baseline factory input; no Session creation, seed or model protocol is adopted. */
export interface CreateAgentOptions {
  readonly sessionId: string
  readonly parentAgent?: Agent
  readonly signal?: AbortSignal
  readonly setup?: AgentSetup
}

/** Delegation input only; this package contains no persistent-session loader. */
export interface ResumeAgentOptions {
  readonly resumeSessionId: string
  readonly parentAgent?: Agent
  readonly signal?: AbortSignal
  readonly setup?: AgentSetup
}

/** Factory-owned result. The factory implements disposal; the registry delegates. */
export interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}

/** External factory receives the calling Context; no concrete driver is included. */
export interface AgentFactory {
  createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>
  resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Source announcement: synchronous listener failure may veto registration. */
    'agent/created'(this: Scoped<Agent>, payload: { agent: Agent }): void
    /** Source detach notification, not evidence of full OMNE runtime quiescence. */
    'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
  }
}
