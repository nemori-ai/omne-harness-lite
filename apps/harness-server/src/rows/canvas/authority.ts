import type { CanvasAuthority } from '@omne-harness/canvas-contract'

/**
 * Whoever acts for a tenant may read and change its canvas: the person, and an agent of one of its
 * sessions. The context comes from a trusted adapter that has already checked that its subject acts
 * for its tenant: the access row for a login, the tool binding for a call.
 */
export function createCanvasAuthority(): CanvasAuthority {
  return {
    async decide() {
      return 'allowed'
    },
  }
}
