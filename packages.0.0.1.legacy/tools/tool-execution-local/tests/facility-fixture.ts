import type { CommandFacility, FileFacility } from '@omne-harness-lite/execution-environments'
const unsupported = async () => ({ kind: 'rejected', reason: 'unsupported' }) as const
/** Complete contract doubles. These are not native host providers. */
export function commandFixture(overrides: Partial<CommandFacility>): CommandFacility {
  return {
    start: unsupported,
    createTerminal: unsupported,
    executeTerminal: unsupported,
    closeTerminal: unsupported,
    terminals: unsupported,
    ...overrides,
  }
}
export function fileFixture(overrides: Partial<FileFacility>): FileFacility {
  return {
    read: unsupported,
    write: unsupported,
    stat: unsupported,
    list: unsupported,
    search: unsupported,
    move: unsupported,
    copy: unsupported,
    remove: unsupported,
    mkdir: unsupported,
    commitBatch: unsupported,
    recoverBatch: unsupported,
    ...overrides,
  }
}
