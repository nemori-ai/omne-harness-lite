import type { FilesScope } from '@omne-harness/execution-environment-contract'
import type { OutsideFiles } from '@omne-harness/workspace-local'

/** How far the file requests of a session working at `root` reach under the setting. */
export function filesScopeOf(outside: OutsideFiles, root: string): FilesScope {
  switch (outside) {
    case 'none':
      return { read: root, write: root }
    case 'read':
      return { write: root }
    case 'read-write':
      return {}
  }
}
