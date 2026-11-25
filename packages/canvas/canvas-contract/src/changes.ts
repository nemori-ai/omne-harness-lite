import type { CanvasId, TenantId } from './values.ts'

/** What an observer is told: this canvas of this tenant may have changed, never how. It reads again. */
export type CanvasChange = Readonly<{ tenant: TenantId; canvas: CanvasId }>

export type CanvasChangeListener = Readonly<{
  changed(change: CanvasChange): void
  /** The feed is gone and nothing more arrives. */
  closed(): void
}>

export interface CanvasChangeFeed {
  /** Only the changes of this tenant. A listener that subscribes after the feed closed is told so at once. */
  subscribe(tenant: TenantId, listener: CanvasChangeListener): () => void
}
