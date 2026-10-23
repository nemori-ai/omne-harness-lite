/** Non-durable doubles and framework-independent conformance cases; never assemble in production. */
export {
  NotApplicable,
  runConformanceCase,
  type ConformanceCase,
  type CaseVerdict,
} from './case.ts'
export {
  environmentProviderConformance,
  type ProviderConformanceOptions,
  type ProviderConformanceSubject,
} from './provider-conformance.ts'
export {
  executionEnvironmentConformance,
  type EnvironmentConformanceOptions,
  type EnvironmentConformanceSubject,
} from './environment-conformance.ts'
export {
  createScriptedEnvironmentProvider,
  createMemoryResourceLedger,
  createScriptedFacilityGuard,
  createScriptedRecoveryAuthority,
  type ProviderScript,
  type ScriptedEnvironmentProvider,
  type MemoryResourceLedger,
  type ScriptedFacilityGuard,
  type ScriptedRecoveryAuthority,
} from './doubles.ts'
