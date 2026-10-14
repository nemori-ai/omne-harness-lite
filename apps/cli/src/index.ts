export { parseArgv, type ParsedCommand } from './argv.ts'
export { defineCatalog, productionCatalog, renderHelp } from './catalog.ts'
export type {
  Catalog,
  CliOutput,
  CliRuntime,
  CommandEnvironment,
  CommandSpec,
  DocumentedOption,
  ExitCode,
  FlagSpec,
} from './cli-types.ts'
export { readBuildIdentity, type BuildIdentityResult } from './identity.ts'
export { run } from './run.ts'
export {
  ensureStateDirectory,
  resolveStateDirectory,
  type StateDirectoryInput,
  type StateDirectoryReadiness,
  type StateDirectoryResolution,
  type StateDirectorySource,
} from './state-directory.ts'
