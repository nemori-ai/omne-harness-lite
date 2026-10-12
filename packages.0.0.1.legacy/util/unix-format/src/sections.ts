/**
 * Man-page-style help renderers: titled sections, a one-line usage synopsis and
 * a column-aligned command overview.
 */

import { resolveUnixFormatOptions, type UnixFormatOptions } from './options.ts'
import { codePointLength, indentLines, padEnd } from './text.ts'

/** Render a titled section: `## TITLE` (or `TITLE:` when not Markdown-compatible) over the indented body. */
export function formatSection(title: string, body: string, options?: UnixFormatOptions): string {
  const resolved = resolveUnixFormatOptions(options)
  const header = resolved.markdownCompatible ? `## ${title}` : `${title}:`
  return `${header}\n${indentLines(body, ' '.repeat(resolved.indent))}`
}

/** Render `USAGE: toolName(command="command", params=paramsSynopsis)`; the synopsis is inserted verbatim. */
export function formatUsage(toolName: string, command: string, paramsSynopsis: string): string {
  return `USAGE: ${toolName}(command="${command}", params=${paramsSynopsis})`
}

/** One line of a command overview: name, parameter synopsis and description. */
export type CommandEntry = readonly [name: string, synopsis: string, description: string]

/** Render command entries as three columns aligned to the widest name and synopsis; empty input renders nothing. */
export function formatCommandList(entries: readonly CommandEntry[]): string {
  if (entries.length === 0) return ''
  const nameWidth = Math.max(...entries.map(([name]) => codePointLength(name)))
  const synopsisWidth = Math.max(...entries.map(([, synopsis]) => codePointLength(synopsis)))
  return entries
    .map(
      ([name, synopsis, description]) =>
        `  ${padEnd(name, nameWidth)}  ${padEnd(synopsis, synopsisWidth)}  — ${description}`,
    )
    .join('\n')
}
