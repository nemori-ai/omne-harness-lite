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
  type EnvironmentConformancePorts,
} from './environment-conformance.ts'
export {
  createScriptedEnvironmentProvider,
  createMemoryResourceLedger,
  createScriptedFacilityGuard,
  createScriptedRecoveryAuthority,
  createScriptedEnvironmentAuthority,
  createScriptedScopeBindings,
  type EnvironmentAuthorityScript,
  type ScriptedEnvironmentAuthority,
  type ScriptedScopeBindings,
  type ProviderScript,
  type ScriptedEnvironmentProvider,
  type MemoryResourceLedger,
  type ScriptedFacilityGuard,
  type ScriptedRecoveryAuthority,
} from './doubles.ts'
export {
  createMemoryFileSystem,
  type MemoryFileSystem,
  type MemoryFileSystemOptions,
} from './memory-files.ts'
export {
  createScriptedCommandFacility,
  type CommandScript,
  type ScriptedCommandAnswer,
  type ScriptedCommandFacility,
} from './scripted-command.ts'
