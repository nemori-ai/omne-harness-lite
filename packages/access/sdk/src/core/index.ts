// The client core (`@omne-harness/sdk/core`, RFC-0015 §6「客户端核心」, #1249): one protocol
// contract and one transport give a typed client. It depends on the common contract, json-text
// and `eventsource-parser` only, imports no Node module, and runs in a browser.
export {
  ClientRequestError,
  createClient,
  type AnswerOf,
  type BodyOf,
  type CallOptions,
  type ClientOf,
  type ClientSettings,
  type EndOf,
  type FrameOf,
  type LocalOutcome,
  type ObservationEnd,
  type ObserveOptions,
  type OpenOf,
  type ReadRetry,
} from './client.ts'
export {
  createHttpProtocolTransport,
  type Credentials,
  type HttpProtocolTransportOptions,
} from './http.ts'
export { createInProcessTransport } from './in-process.ts'
export type {
  CallReport,
  CallRequest,
  ObserveEnd,
  ObserveRequest,
  ProtocolKey,
  Transport,
} from './transport.ts'
