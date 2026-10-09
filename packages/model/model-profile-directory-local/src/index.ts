// Independent directory construction. Cordis facades use ./cordis; restricted credential construction uses ./local-credentials.

export type { ModelProfileDirectoryConfig, LocalCredentialLookupConfig } from './types.ts'
export { createLocalModelDirectory, type LocalModelDirectoryOptions } from './local.ts'
