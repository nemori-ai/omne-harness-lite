export interface SourceComment {
  readonly pos: number
  readonly end: number
  readonly startLine: number
  readonly endLine: number
  readonly text: string
}

const WHOLE_COMMENT_DIRECTIVES: readonly RegExp[] = [
  /^eslint(-disable(-next-line|-line)?|-enable)(\s|$)/u,
  /^oxlint(-disable(-next-line|-line)?|-enable)(\s|$)/u,
  /^(v8|c8) ignore\b/u,
  /^istanbul ignore\b/u,
  /^Stryker (disable|restore)\b/u,
  /^(prettier|oxfmt)-ignore\b/u,
  /^@vite-ignore\b/u,
  /^webpack[A-Z]\w*\s*:/u,
  /^[#@]__(PURE|NO_SIDE_EFFECTS)__/u,
  /^wall-clock:/u,
  /^covers\s*:/u,
  /^brand-mint:/u,
]

const TAG_DIRECTIVES = /^@(owner|mode|contract|identityDecision|accountRecord|scopedRecord)\b/u

const LINE_DIRECTIVES: readonly RegExp[] = [
  /^@ts-(expect-error|ignore|nocheck|check)\b/u,
  /^@(vitest|jest)-environment\b/u,
  /^@jsx(ImportSource|Runtime|Frag)?\b/u,
  /^@module-tag\b/u,
]

const TRIPLE_SLASH = /^\/\/\/\s*<(reference|amd-module|amd-dependency)\b/u
const JS_FILE = /\.(js|mjs|cjs)$/u
const JS_TYPE_TAG =
  /@(type|param|returns|return|typedef|template|satisfies|import|callback|property)\b/u
const LICENCE = /SPDX-License-Identifier|Copyright\s*(\(c\)|©)?\s*(\d{4}|[A-Z])/u

function contents(comment: SourceComment): string[] {
  const rows = comment.text.split('\n')
  return rows.map((row, index) => {
    let body = index === 0 ? row.replace(/^\/(\/+|\*+)/u, '') : row.replace(/^\s*\*+(?!\/)/u, '')
    if (index === rows.length - 1 && comment.text.startsWith('/*'))
      body = body.replace(/\*+\/$/u, '')
    return body.trim()
  })
}

function isDirective(content: string, comment: SourceComment, index: number): boolean {
  return (
    (index === 0 && TRIPLE_SLASH.test(comment.text)) ||
    TAG_DIRECTIVES.test(content) ||
    WHOLE_COMMENT_DIRECTIVES.some(pattern => pattern.test(content)) ||
    LINE_DIRECTIVES.some(pattern => pattern.test(content))
  )
}

export function plainLineCount(path: string, comment: SourceComment): number {
  if (JS_FILE.test(path) && comment.text.startsWith('/**') && JS_TYPE_TAG.test(comment.text))
    return 0
  const rows = contents(comment)
  const marked = new Set(
    rows.flatMap((row, index) => (isDirective(row, comment, index) ? [index] : [])),
  )
  if (marked.size === 0) return rows.length
  const first = rows[0] ?? ''
  if (
    rows.length === 1 ||
    rows.some((row, index) => marked.has(index) && TAG_DIRECTIVES.test(row)) ||
    WHOLE_COMMENT_DIRECTIVES.some(pattern => pattern.test(first))
  )
    return 0
  return rows.filter((row, index) => !marked.has(index) && row !== '').length
}

export function licenceComments(
  text: string,
  header: readonly SourceComment[],
): ReadonlySet<SourceComment> {
  const paragraphs: SourceComment[][] = []
  let current: SourceComment[] = []
  const close = () => {
    if (current.length > 0) paragraphs.push(current)
    current = []
  }
  for (const comment of header) {
    const previous = current.at(-1)
    const adjacent =
      previous !== undefined &&
      previous.text.startsWith('//') &&
      comment.text.startsWith('//') &&
      comment.startLine === previous.endLine + 1 &&
      /^\s*$/u.test(text.slice(previous.end, comment.pos))
    if (!adjacent) close()
    if (contents(comment).join(' ').trim() === '') close()
    else current.push(comment)
  }
  close()
  return new Set(
    paragraphs
      .filter(paragraph => LICENCE.test(paragraph.map(item => contents(item).join(' ')).join(' ')))
      .flat(),
  )
}
