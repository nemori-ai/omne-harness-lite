import { homedir } from 'node:os'
import { createClientAssembly } from './assembly.ts'
import { buildIntent, readSecrets } from './input.ts'
import { versionText } from './version.ts'
import type { CliRuntime } from './application.ts'

export function providers(): Pick<
  CliRuntime,
  'home' | 'createAssembly' | 'intent' | 'secrets' | 'version'
> {
  return {
    home: homedir(),
    version: versionText,
    createAssembly: createClientAssembly,
    intent: buildIntent,
    secrets: readSecrets,
  }
}
