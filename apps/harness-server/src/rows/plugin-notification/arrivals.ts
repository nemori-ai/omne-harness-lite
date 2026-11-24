import {
  eventTypeNameSchema,
  type EventTypeDeclaration,
  type SendRequestInput,
  type SourceName,
} from '@omne-harness/notification-contract'

export const POINT_ADDED = eventTypeNameSchema.parse('point-added')
export const CATEGORY_ADDED = eventTypeNameSchema.parse('category-added')

const event = (
  over: Pick<EventTypeDeclaration, 'name' | 'label' | 'description' | 'subject'>,
): EventTypeDeclaration => ({
  kind: { kind: 'event' },
  subscribable: ['person', 'agent'],
  nameable: [],
  defaults: { person: 'weak', agent: 'off' },
  external: false,
  ...over,
})

/** What the extensions tell as one-time events: the tree grew a point, or the assets a category. */
export const ARRIVAL_TYPES: readonly EventTypeDeclaration[] = [
  event({
    name: POINT_ADDED,
    label: '多了一个可以改的地方',
    description:
      '服务端的拓展树上多了一个点：拓展可以往这里放东西。用 OmneExtensionPoints show 看它收什么、怎样写。',
    subject: { presence: 'required', hint: '点的名字' },
  }),
  event({
    name: CATEGORY_ADDED,
    label: '多了一类拓展',
    description: '资产里多了一类可以发布与持有的拓展。用 OmneExtensions categories 看它。',
    subject: { presence: 'required', hint: '类别的名字' },
  }),
]

/** The points and categories there are, each with what it says of itself. */
export type ExtensionShape = Readonly<{
  points: ReadonlyMap<string, string>
  categories: ReadonlyMap<string, string>
}>

export type Arrival = Readonly<{
  type: typeof POINT_ADDED | typeof CATEGORY_ADDED
  name: string
  says: string
}>

const TITLE_MAX = 200

/** What is there now and was not before; what went or changed what it says is no arrival. */
export function arrivals(before: ExtensionShape, now: ExtensionShape): readonly Arrival[] {
  const added = (
    type: Arrival['type'],
    was: ReadonlyMap<string, string>,
    is: ReadonlyMap<string, string>,
  ) =>
    [...is]
      .filter(([name]) => !was.has(name))
      .map(([name, says]): Arrival => ({ type, name, says }))
  return [
    ...added(CATEGORY_ADDED, before.categories, now.categories),
    ...added(POINT_ADDED, before.points, now.points),
  ]
}

/** One arrival told to one tenant. Its identity is the arrival itself: told again, it is recalled, not told twice. */
export function arrivalRequest(
  source: SourceName,
  tenant: string,
  arrival: Arrival,
  at: string,
): SendRequestInput {
  const what = arrival.type === POINT_ADDED ? '多了一个点' : '多了一类拓展'
  return {
    identity: { tenant, source, eventId: `${arrival.type}:${arrival.name}`.slice(0, 200) },
    event: {
      type: arrival.type,
      subject: arrival.name,
      at,
      content: {
        title: `${what} ${arrival.name}`.slice(0, TITLE_MAX),
        body: arrival.says,
        locator: null,
      },
      replaceKey: null,
      renotify: false,
      named: [],
      origin: null,
    },
  }
}
