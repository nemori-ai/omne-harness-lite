import { assertNonNegativeInteger } from './options.ts'
import { codePointLength, indentLines, padEnd } from './text.ts'

export interface SectionOptions {
  readonly indent?: number
  readonly markdownCompatible?: boolean
}

export function formatSection(title: string, body: string, options: SectionOptions = {}): string {
  const indent = options.indent ?? 2
  assertNonNegativeInteger(indent, 'indent')
  const markdownCompatible = options.markdownCompatible ?? true
  const header = markdownCompatible ? `## ${title}` : `${title}:`
  return `${header}\n${indentLines(body, ' '.repeat(indent))}`
}

export function formatUsage(toolName: string, command: string, paramsSynopsis: string): string {
  return `USAGE: ${toolName}(command="${command}", params=${paramsSynopsis})`
}

export type CommandEntry = readonly [name: string, synopsis: string, description: string]

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
