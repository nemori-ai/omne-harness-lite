import type { FilesScope } from '@omne-harness/execution-environment-contract'
import type { ToolCallDirectory } from './definitions.ts'

/** The files a call pinned to a directory may read and write: its pinned scope, or both sides below its path. */
export function pinnedFiles(directory: ToolCallDirectory): FilesScope {
  return directory.files ?? { read: directory.path, write: directory.path }
}
