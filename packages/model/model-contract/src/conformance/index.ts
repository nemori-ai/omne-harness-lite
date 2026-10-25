// The `./conformance` entry: the provider obligation suite that any Model provider can be checked
// with. It exports no scripted double: the scripted provider and transport live in `./testing`,
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
