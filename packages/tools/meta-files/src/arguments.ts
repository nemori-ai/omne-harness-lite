import { z } from 'zod'
const path = z
  .string()
  .min(1)
  .regex(/^[^\u0000]+$/)
  .describe('Path in the selected environment. Relative paths use Runtime Context cwd.')
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const positive = integer.min(1)
const version = z
  .string()
  .min(1)
  .describe('Exact metadata version returned by read or info. This is not an external-write lock.')
const encoding = z
  .enum(['utf8', 'base64'])
  .describe('Content encoding. Base64 must use canonical padded encoding.')
const replacement = z.string().describe('Exact replacement text. Empty text removes the match.')
const offset = integer
  .optional()
  .describe('Zero-based entry offset for the next page. Omit to start at zero.')
const limit = positive
  .optional()
  .describe('Maximum entries in this page. The configured limit still applies.')
const replace = z
  .boolean()
  .describe('Allow replacement of the destination. Supply this decision explicitly.')
export const match = z
  .object({
    text: z
      .string()
      .min(1)
      .describe(
        'Exact nonempty text to match in the original file. No normalization or fuzzy matching occurs.',
      ),
    occurrence: positive
      .optional()
      .describe('One-based occurrence. Required when the text has multiple matches.'),
  })
  .strict()
  .describe('One original-text match selector.')
export const edit = z
  .object({ match, replacement })
  .strict()
  .describe('One exact edit against the original text.')
export const batch = z
  .object({
    id: z.string().min(1).describe('Original batch id returned by the file facility.'),
    generation: z.string().min(1).describe('Original generation paired with that batch id.'),
  })
  .strict()
  .describe('Original batch reference. Recognition does not replay or undo it.')
export const patchFile = z
  .object({
    path,
    expectedVersion: version,
    edits: z
      .array(edit)
      .nonempty()
      .describe('Nonoverlapping edits against this same original file text.'),
  })
  .strict()
  .describe('One existing target and its precheck version.')
export const argumentSchemas = {
  help: z
    .object({
      command: z
        .enum([
          'help',
          'read',
          'open',
          'write',
          'edit',
          'patch',
          'list',
          'find',
          'info',
          'move',
          'copy',
          'delete',
          'mkdir',
        ])
        .optional()
        .describe('Command whose help you need. Omit for the overview.'),
    })
    .strict(),
  read: z
    .object({
      path,
      offsetBytes: integer.optional().describe('Zero-based byte offset. Omit to start at zero.'),
      limitBytes: positive
        .optional()
        .describe('Maximum bytes to return. The configured byte limit still applies.'),
      encoding: encoding
        .optional()
        .describe('UTF-8 text by default. Use base64 explicitly for binary bytes.'),
    })
    .strict(),
  open: z.object({ path }).strict(),
  write: z
    .object({
      path,
      content: z.string().describe('Complete file contents in the selected encoding.'),
      encoding,
      mode: z
        .enum(['create', 'replace'])
        .describe('Create requires an absent target. Replace permits replacing a target.'),
      expectedVersion: version.optional().describe('Optional metadata version precondition.'),
    })
    .strict(),
  edit: z.object({ path, match, replacement, expectedVersion: version }).strict(),
  patch: z
    .object({
      files: z
        .array(patchFile)
        .nonempty()
        .optional()
        .describe('All target edits. Supply files or recovery, never both.'),
      recovery: batch
        .optional()
        .describe('Recognize this original batch instead of submitting files.'),
    })
    .strict(),
  list: z.object({ path, offset, limit }).strict(),
  find: z
    .object({
      root: path,
      mode: z.enum(['name', 'content']).describe('Search file names or file contents.'),
      pattern: z.string().min(1).describe('Literal text to find. No regex or glob interpretation.'),
      recursive: z.boolean().describe('Search child directories. Supply this decision explicitly.'),
      offset,
      limit,
    })
    .strict(),
  info: z.object({ path }).strict(),
  move: z
    .object({
      from: path.describe('Source path in the selected environment.'),
      to: path.describe('Destination path in the selected environment.'),
      replace,
      expectedVersion: version
        .optional()
        .describe('Optional source metadata version precondition.'),
    })
    .strict(),
  copy: z
    .object({
      from: path.describe('Source file path in the selected environment.'),
      to: path.describe('Destination file path in the selected environment.'),
      replace,
      expectedVersion: version
        .optional()
        .describe('Optional source metadata version precondition.'),
    })
    .strict(),
  delete: z
    .object({
      path,
      recursive: z.boolean().describe('Allow recursive removal. Supply this decision explicitly.'),
      expectedVersion: version
        .optional()
        .describe('Optional target metadata version precondition.'),
    })
    .strict(),
  mkdir: z
    .object({
      path,
      parents: z
        .boolean()
        .describe('Create absent parent directories. Supply this decision explicitly.'),
    })
    .strict(),
}
export type Edit = z.infer<typeof edit>
export type PatchFile = z.infer<typeof patchFile>
