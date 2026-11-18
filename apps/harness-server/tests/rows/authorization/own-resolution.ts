import type { ToolActionResolution } from '@omne-harness/tool-contract'

/** Every call is its own action: the double for admission tests that do not carry a target. */
export const ownResolution = (): ToolActionResolution<unknown> => ({
  resolve: async () => ({ ok: { kind: 'own' } }),
})
