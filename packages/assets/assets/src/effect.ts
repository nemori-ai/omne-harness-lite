import type { CapabilityId } from './identity.ts'
import type { PublishContent } from './publishing.ts'

/** One line of what a change would do to the extension tree. */
export type ImpactLine = Readonly<{
  /** + would appear; - would go away; ~ would change state; ! would not take effect or conflicts */
  mark: '+' | '-' | '~' | '!'
  /** The name of another holding this line is about; null when it is about the one asked. */
  of: string | null
  point: string
  key: string
  /** What follows the arrow, for example `→ in effect; shadows built-in`. */
  says: string
}>

/** What a change of one holding would do. The assets do not know it; the assembly adapts this port. */
export type ChangeImpact = Readonly<{
  of(
    input: Readonly<{
      tenant: string
      capability: CapabilityId
      change: 'publish' | 'enable' | 'disable' | 'remove'
      content?: PublishContent
    }>,
  ): Promise<
    | Readonly<{
        kind: 'changes'
        lines: readonly ImpactLine[]
        loads: string | null
        advice: string | null
      }>
    | Readonly<{ kind: 'unavailable'; reason: string }>
  >
}>

export type PlacedLine = Readonly<{ point: string; key: string; standing: string; says: string }>
export type ClientLine = Readonly<{ label: string; says: string }>

/** Where a holding is placed now and whether each place is in effect. The assembly adapts this port. */
export type Placement = Readonly<{
  of(input: Readonly<{ tenant: string; capability: CapabilityId }>): Promise<
    | Readonly<{
        kind: 'placed'
        places: readonly PlacedLine[]
        clients: readonly ClientLine[] | null
        advice: string | null
      }>
    | Readonly<{ kind: 'unavailable'; reason: string }>
  >
}>
