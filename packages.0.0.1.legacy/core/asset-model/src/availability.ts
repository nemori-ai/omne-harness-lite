import type { BodyContract, BodyContractSupply } from './types.ts'

/** An implementation-scope boundary, outside the frozen asset rejection vocabulary. */
export class BodyProviderUnavailableError extends Error {
  readonly category: 'connector' = 'connector'

  constructor() {
    super('body provider unavailable: connector')
    this.name = 'BodyProviderUnavailableError'
  }
}

export function connectorContract(bodies: BodyContractSupply): BodyContract<'connector'> {
  const port = bodies.connector
  if (port === undefined) throw new BodyProviderUnavailableError()
  return port
}
