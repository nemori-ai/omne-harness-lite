import { providers } from '../default-providers.ts'
import { openTerminal } from './terminal.ts'

export function tuiProviders() {
  return { ...providers(), terminal: openTerminal }
}
