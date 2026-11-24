import type { Canvas, Item, KindListing, Pile } from '@omne-harness/canvas-contract'
import type {
  CanvasBody,
  CanvasItemBody,
  CanvasKindBody,
  CanvasPileBody,
} from '@omne-harness/canvas-protocol'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'

/** The domain keeps instants as text; the protocol carries them as instants. */
function instantOf(text: string): Instant {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new TypeError('canvas-access: the domain kept an invalid instant')
  return parsed.value
}

export function tenantTextOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('canvas-access: tenant is not a minted TenantId')
  return encoded.value
}

const itemOf = (item: Item): CanvasItemBody => ({ ...item, when: instantOf(item.when) })
const pileOf = (pile: Pile): CanvasPileBody => ({ ...pile, when: instantOf(pile.when) })

export const canvasOf = (canvas: Canvas): CanvasBody => ({
  sheet: canvas.sheet,
  items: canvas.items.map(itemOf),
  piles: canvas.piles.map(pileOf),
  revision: canvas.revision,
})

export const kindOf = (listing: KindListing): CanvasKindBody =>
  listing.kind === 'declared'
    ? { ...listing }
    : { kind: 'conflict', name: listing.name, by: [...listing.by] }
