/** A generation's shared admission signal; a fulfilled wait is not ongoing permission. */
export interface EntryOpeningSignal {
  wait(): Promise<void>
  isOpen(): boolean
}

export class EntryOpeningStopped extends Error {
  override readonly name = 'EntryOpeningStopped'
  constructor() {
    super('Entry opening has stopped')
  }
}

export { isGovernanceCenterId, type GovernanceCenterId } from './center-id.ts'
export {
  PUBLIC_HEALTH_ROUTE,
  ROUTE_IDS,
  ACCEPTED_PROTOCOL_VERSIONS,
  type RouteId,
} from './routes.ts'
