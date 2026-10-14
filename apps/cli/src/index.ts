export { helpText, parseArgv, type ParsedCommand } from './argv.ts'
export {
  productionCatalog,
  renderHelp,
  type Catalog,
  type CommandSpec,
  type DocumentedOption,
  type FlagSpec,
} from './catalog.ts'
export { readBuildIdentity, type BuildIdentityResult } from './identity.ts'
export { run, type CliOutput, type ExitCode } from './run.ts'
export {
  ensureStateDirectory,
  resolveStateDirectory,
  type StateDirectoryInput,
  type StateDirectoryReadiness,
  type StateDirectoryResolution,
  type StateDirectorySource,
} from './state-directory.ts'
