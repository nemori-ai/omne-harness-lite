// The `./conformance` entry: independent suites for Model providers, credential ports and public
// streams. It exports no scripted double: scripted providers and transports live in `./testing`,
// so a production check that imports this entry does not take them into its dependencies.
export { checkModelProviderConformance } from './conformance.ts'
export { CONFORMANCE_OBLIGATIONS } from './conformance-types.ts'
export type {
  ConformanceAction,
  ConformanceCall,
  ConformanceHooks,
  ConformanceObligation,
  ConformanceOptions,
  ConformanceReport,
  ConformanceSubject,
  ConformanceTransport,
  ObligationResult,
} from './conformance-types.ts'
export { checkCredentialPortConformance } from './credential.ts'
export { CREDENTIAL_CONFORMANCE_OBLIGATIONS } from './credential-types.ts'
export type {
  CredentialConformanceControls,
  CredentialConformanceSubject,
  CredentialConformanceObligation,
  CredentialConformanceResult,
  CredentialConformanceReport,
  CredentialConformanceOptions,
  CredentialTarget,
} from './credential-types.ts'
export { checkModelStreamConformance } from './conformance-stream.ts'
export type {
  ModelStreamConformanceInput,
  ModelStreamConformanceSubject,
  ModelStreamConformanceControls,
  ModelStreamConformanceResult,
  ModelStreamConformanceReport,
} from './conformance-stream-types.ts'
