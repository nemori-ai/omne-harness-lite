import { MAIN_CANVAS, type KindListing } from '@omne-harness/canvas-contract'
import type { Reached } from './port.ts'
import type { ArgumentsOf, CanvasCommandName } from './protocol.ts'
import { changeAnswer, placeAnswer, readAnswer, reading, writing, type Answer } from './results.ts'

/** The canvas of the tenant: the tool has one, so the model never names it. */
const canvas = MAIN_CANVAS
const AWAY_PAGE = 20

export type Handler<K extends CanvasCommandName> = (
  reached: Reached,
  params: ArgumentsOf<K>['params'],
) => Promise<Answer>

/** Each kind with the sentence of its owner on how its ref is written. */
const kindOf = (listing: KindListing) =>
  listing.kind === 'declared'
    ? { name: listing.name, label: listing.label, summary: listing.summary, ref: listing.reference }
    : { name: listing.name, conflict: listing.by }

const look: Handler<'look'> = ({ face, context }) =>
  reading('look', async () => readAnswer('look', await face.look(context, { canvas }), v => v))

const away: Handler<'away'> = ({ face, context }, params) =>
  reading('away', async () => {
    const request = { canvas, ...params, limit: params.limit ?? AWAY_PAGE }
    return readAnswer('away', await face.lookAway(context, request), page => page)
  })

const kinds: Handler<'kinds'> = ({ face, context }) =>
  reading('kinds', async () =>
    readAnswer('kinds', await face.kinds(context), found => ({ kinds: found.map(kindOf) })),
  )

const place: Handler<'place'> = ({ face, context }, params) =>
  writing('place', async () => placeAnswer(await face.place(context, { canvas, ...params })))

const arrange: Handler<'arrange'> = ({ face, context }, params) =>
  writing('arrange', async () =>
    changeAnswer('arrange', await face.arrange(context, { canvas, ...params })),
  )

const take: Handler<'take'> = ({ face, context }, params) =>
  writing('take', async () => changeAnswer('take', await face.take(context, { canvas, ...params })))

const pile: Handler<'pile'> = ({ face, context }, params) =>
  writing('pile', async () => changeAnswer('pile', await face.pile(context, { canvas, ...params })))

const scatter: Handler<'scatter'> = ({ face, context }, params) =>
  writing('scatter', async () =>
    changeAnswer('scatter', await face.scatter(context, { canvas, ...params })),
  )

/** Lock and unlock are the one operation of the canvas, in its two directions. */
const lockTo =
  <K extends 'lock' | 'unlock'>(locked: boolean, command: K): Handler<K> =>
  ({ face, context }, params) =>
    writing(command, async () =>
      changeAnswer(command, await face.lock(context, { canvas, items: params.items, locked })),
    )

export type Reaching = Exclude<CanvasCommandName, 'help'>
export const HANDLERS: { readonly [K in Reaching]: Handler<K> } = {
  look,
  away,
  kinds,
  place,
  arrange,
  take,
  pile,
  scatter,
  lock: lockTo(true, 'lock'),
  unlock: lockTo(false, 'unlock'),
}
