// The root entry exports the accepted pi family contribution types, the transport factory with
// its configuration types, and the network resources factory with its configuration types. The
// assembly creates and owns the network resources and gives them to the transport. The transport
// mechanisms (capacity, HTTP exchange, SSE, frames, diagnostics) stay inside the package.
export type {
  PiFamilyBinding,
  PiFamilyContributions,
  PiMaterializedMedia,
  PiProtocolFrame,
  PiResponseDecoder,
} from './family.ts'
export type { PiCredentialSlot, PiRoute, PiTransportConfig, PiTransportLimits } from './config.ts'
export { createPiTransport, type PiTransport } from './transport.ts'
export type { DiagnosticObserver } from './diagnostics.ts'
export {
  createNetworkResources,
  type NetworkConfig,
  type NetworkResources,
  type ProxyConfig,
} from './network.ts'
