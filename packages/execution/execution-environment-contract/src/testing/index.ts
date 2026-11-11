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
  createScriptedRetentionStore,
  type CommandScript,
  type ScriptedCommandAnswer,
  type ScriptedCommandFacility,
  type ScriptedCommandOptions,
  type ScriptedRetentionStore,
} from './scripted-command.ts'
export {
  createScriptedTerminalFacility,
  type TerminalScript,
  type ScriptedTerminalAnswer,
  type ScriptedTerminalFacility,
} from './scripted-terminal.ts'
export {
  terminalFacilityConformance,
  type TerminalConformanceAcquisition,
  type TerminalConformanceSubject,
  type TerminalConformanceOptions,
} from './terminal-conformance.ts'
export {
  commandRetentionConformance,
  type CommandRetentionAcquisition,
  type CommandRetentionBody,
  type CommandRetentionOptions,
  type CommandRetentionSubject,
} from './command-retention-conformance.ts'
