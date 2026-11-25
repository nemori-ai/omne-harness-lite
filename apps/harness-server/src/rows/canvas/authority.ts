import type { CanvasAuthority } from '@omne-harness/canvas-contract'

/** Whoever acts for the tenant may read and change its canvas. The trusted adapter that built the
 * context has checked that: the access row for a login, the tool binding for a call. */
export function createCanvasAuthority(): CanvasAuthority {
  return {
    async decide() {
      return 'allowed'
    },
  }
}
