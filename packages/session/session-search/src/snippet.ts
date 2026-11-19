import type { Span } from './regex.ts'

export type Snippet = Readonly<{ before: string; match: string; after: string }>

export const SNIPPET_CONTEXT = 48
export const SNIPPET_MATCH = 160

// Cuts by code points: a cut never splits a surrogate pair.
function head(text: string, points: number): string {
  let end = 0
  for (let taken = 0; taken < points && end < text.length; taken += 1)
    end += text.codePointAt(end)! > 0xffff ? 2 : 1
  return text.slice(0, end)
}

function tail(text: string, points: number): string {
  let start = text.length
  for (let taken = 0; taken < points && start > 0; taken += 1) {
    const low = text.charCodeAt(start - 1)
    start -= low >= 0xdc00 && low <= 0xdfff && start > 1 ? 2 : 1
  }
  return text.slice(start)
}

export function snippetOf(match: Readonly<{ block: string; span: Span }>): Snippet {
  const { block, span } = match
  return {
    before: tail(block.slice(0, span.start), SNIPPET_CONTEXT),
    match: head(block.slice(span.start, span.end), SNIPPET_MATCH),
    after: head(block.slice(span.end), SNIPPET_CONTEXT),
  }
}
