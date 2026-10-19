// Identity and value types of the Agent contract. This file holds the names that the extension
// author protocol uses; the full chapter (README, "身份、原位置与纯求值") extends it without renaming.
declare const agentIdentity: unique symbol
export type AgentIdentity<K extends string> = string & { readonly [agentIdentity]: K }
export type ActionId = AgentIdentity<'AgentActionId'>
export type PassageId = AgentIdentity<'AgentPassageId'>
export type CardRoundId = AgentIdentity<'AgentCardRoundId'>
export type AgentExecutionId = AgentIdentity<'AgentExecutionId'>
export type Adoption = Readonly<{ owner: string; name: string; revision: string; digest: string }>
export type Evidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>
/** An RFC 3339 UTC instant, for example `2026-10-17T08:00:00Z`. */
export type AgentInstant = string
