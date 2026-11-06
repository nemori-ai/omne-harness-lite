import type { Card, ListPool, PoolItem } from '@omne-harness/human-intervention'
import type { RequestRecord } from './request-schema.ts'
import type { PoolPosition } from './pool-schema.ts'

export function requestMatches(request: RequestRecord, filter: ListPool['filter']) {
  return (
    (filter.originKind === undefined || request.origin.kind === filter.originKind) &&
    (filter.sessionRef === undefined || request.origin.sessionRef === filter.sessionRef)
  )
}
function cardMatches(card: Card, filter: ListPool['filter']) {
  return (
    filter.states.includes(card.kind) &&
    (filter.delivery === undefined ||
      (card.kind === 'decided' && card.delivery.kind === filter.delivery))
  )
}
export function selectPoolCards(
  input: Readonly<{
    request: RequestRecord
    sequence: string
    position: PoolPosition
    filter: ListPool['filter']
    remaining: number
  }>,
) {
  const { request, sequence, position, filter, remaining } = input
  const items: PoolItem[] = []
  for (const [index, card] of request.cards.entries()) {
    if (index < position.offset || !cardMatches(card, filter)) continue
    items.push({ card, origin: request.origin, displayContext: request.displayContext })
    if (items.length === remaining)
      return {
        items,
        position:
          index + 1 === request.cards.length
            ? { after: sequence, offset: 0 }
            : { after: position.after, offset: index + 1 },
      }
  }
  return { items, position: { after: sequence, offset: 0 } }
}
