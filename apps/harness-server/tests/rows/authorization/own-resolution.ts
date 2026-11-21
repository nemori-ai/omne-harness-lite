import { IMPLICIT_TOOL_GATE, type ToolActionResolution } from '@omne-harness/tool-contract'

/** Every call is its own action under the one gate of a tool that declares none. */
export const ownResolution = (): ToolActionResolution<unknown> => ({
  resolve: async () => ({ ok: { kind: 'own', gate: { kind: 'gate', gate: IMPLICIT_TOOL_GATE } } }),
})
