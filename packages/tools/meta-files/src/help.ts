import { formatSection, formatCommandList, formatUsage } from '@omne-harness-lite/unix-format'
const styles = { markdownCompatible: false, maxWidth: 0 }
export const descriptions = {
  help: 'Read tool help or command help.',
  read: 'Read a bounded byte range as UTF-8 text or explicit base64.',
  open: 'Open a static PNG, JPEG, or WebP image as an attachment.',
  write: 'Create a file or replace its entire contents.',
  edit: 'Replace one exact match. Return the confirmed change as a unified diff.',
  patch: 'Check all edits before committing a batch, or recognize an original batch.',
  list: 'List one page of directory entries.',
  find: 'Find literal text in file names or file contents.',
  info: 'Read metadata and a bounded binary-content sample.',
  move: 'Move a path. Replacement must be explicit.',
  copy: 'Copy a file. Replacement must be explicit.',
  delete: 'Remove a path. Recursive removal must be explicit.',
  mkdir: 'Create a directory. Parent creation must be explicit.',
}
const usage = {
  help: '[command]',
  read: 'path [offsetBytes] [limitBytes] [encoding]',
  open: 'path',
  write: 'path content encoding mode [expectedVersion]',
  edit: 'path match replacement expectedVersion',
  patch: 'files | recovery',
  list: 'path [offset] [limit]',
  find: 'root mode pattern recursive [offset] [limit]',
  info: 'path',
  move: 'from to replace [expectedVersion]',
  copy: 'from to replace [expectedVersion]',
  delete: 'path recursive [expectedVersion]',
  mkdir: 'path parents',
}
const notes = {
  help: 'Omit command for the overview. This command needs no environment.',
  read: 'Offsets count bytes. A nonzero offset has fragment-local line numbers. Invalid UTF-8 is rejected. Use base64 for binary bytes.',
  open: 'The result contains an image attachment, not base64 text. Animated images and over-limit images are rejected.',
  write:
    'Use create to require an absent target. Use replace for an existing target. The version is a metadata check, not an atomic guard against external writers.',
  edit: 'match.text is literal. Multiple matches need a one-based occurrence. No fuzzy match occurs. An unknown commit displays a planned diff.',
  patch:
    'Each file needs expectedVersion and nonoverlapping edits against its original text. Duplicate paths are rejected. Precheck failure changes no targets. Commit interruption can leave partial changes. Use the returned batch id and generation in recovery. Recovery only observes the original batch. It does not replay, finish, or undo it.',
  list: 'nextOffset requests another page. Pages are not a stable directory snapshot.',
  find: 'mode is name or content. pattern is literal, not a regex or glob. The result reports byte offsets and truncation.',
  info: 'version identifies observed metadata. It is not an external-write lock. binary_sample tests NUL and UTF-8 in at most 4096 bytes. It is not a MIME guarantee.',
  move: 'from and to use the selected environment. No cross-filesystem atomic move is promised.',
  copy: 'from and to use the selected environment. No directory tree copy is promised.',
  delete:
    'Set recursive explicitly. Removal is an external effect and cannot be undone by the tool.',
  mkdir: 'Set parents explicitly. Existing-path behavior belongs to the selected file facility.',
}
export const COMMAND_HELP = Object.fromEntries(
  Object.keys(descriptions).map(name => {
    const key = name as keyof typeof descriptions
    return [key, [formatUsage('Files', key, usage[key]), descriptions[key], notes[key]].join('\n')]
  }),
)
export const FILES_HELP = [
  formatSection('NAME', 'Files - operate on files in the selected execution environment', styles),
  formatSection('USAGE', 'Files({command, args})', styles),
  formatSection(
    'COMMANDS',
    formatCommandList(
      Object.keys(descriptions).map(name => {
        const key = name as keyof typeof descriptions
        return [key, usage[key], descriptions[key]] as const
      }),
    ),
    styles,
  ),
  formatSection(
    'NOTES',
    'Relative paths use files.initial.cwd from Runtime Context. Absolute paths remain inside the selected environment semantics. A default directory grants no permission. Text results use Unix labels and tables. Files sends no progress frames. Edit results include a diff. Unknown results do not mean that nothing changed.',
    styles,
  ),
].join('\n\n')
