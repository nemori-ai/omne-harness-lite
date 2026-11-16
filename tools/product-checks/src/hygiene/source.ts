import ts from '@typescript/typescript6'
import { licenceComments, plainLineCount, type SourceComment } from './annotations.ts'
import type { HygieneLimits } from './baseline.ts'
import { PUBLISHED_BYTES } from './published-bytes.ts'

const FORBIDDEN_COMMENT: readonly RegExp[] = [
  /R\d+-D\d+|\bD-\d+|RFC-\d+|#\d{3,}|阶段 ?\d/u,
  /\b(?:TODO|FIXME|XXX|HACK)\b/u,
]

export type SourceLimits = Pick<
  HygieneLimits,
  'functionLines' | 'commentRunLines' | 'commentFloorLines' | 'commentPercent'
>

export interface CommentMeasure {
  readonly count: number
  readonly firstLine: number
  readonly forms: number
  readonly runs: number
  readonly dense: number
}

export interface SourceMeasure {
  readonly lines: number
  readonly comments: CommentMeasure
  readonly functions: {
    readonly count: number
    readonly longest: number
    readonly longestLine: number
  }
}

type Comment = SourceComment

interface PlainComment {
  readonly comment: Comment
  readonly lines: number
}

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
}

function lineCount(text: string): number {
  if (text === '') return 0
  const rows = text.split('\n').length
  return text.endsWith('\n') ? rows - 1 : rows
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.body !== undefined
  )
}

function visitTokens(node: ts.Node, syntax: ts.SourceFile, visit: (node: ts.Node) => void): void {
  if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return
  visit(node)
  for (const child of node.getChildren(syntax)) visitTokens(child, syntax, visit)
}

function commentsOf(syntax: ts.SourceFile): Comment[] {
  const text = syntax.text
  const seen = new Map<number, Comment>()
  const take = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? [])
      if (!seen.has(range.pos))
        seen.set(range.pos, {
          pos: range.pos,
          end: range.end,
          startLine: syntax.getLineAndCharacterOfPosition(range.pos).line + 1,
          endLine: syntax.getLineAndCharacterOfPosition(range.end).line + 1,
          text: text.slice(range.pos, range.end),
        })
  }
  visitTokens(syntax, syntax, node => {
    take(ts.getLeadingCommentRanges(text, node.getFullStart()))
    take(ts.getTrailingCommentRanges(text, node.end))
  })
  return [...seen.values()].sort((a, b) => a.pos - b.pos)
}

function plainComments(path: string, syntax: ts.SourceFile): PlainComment[] {
  const all = commentsOf(syntax)
  const firstToken =
    syntax.statements[0]?.getStart(syntax) ?? syntax.endOfFileToken.getStart(syntax)
  const licence = licenceComments(
    syntax.text,
    all.filter(comment => comment.end <= firstToken),
  )
  return all.flatMap(comment => {
    const lines = licence.has(comment) ? 0 : plainLineCount(path, comment)
    return lines === 0 ? [] : [{ comment, lines }]
  })
}

function adjacentRuns(text: string, plain: readonly PlainComment[]): PlainComment[][] {
  const runs: PlainComment[][] = []
  for (const item of plain) {
    const run = runs.at(-1)
    const previous = run?.at(-1)?.comment
    if (
      run !== undefined &&
      previous !== undefined &&
      item.comment.startLine <= previous.endLine + 1 &&
      /^\s*$/u.test(text.slice(previous.end, item.comment.pos))
    )
      run.push(item)
    else runs.push([item])
  }
  return runs
}

function commentMeasure(
  path: string,
  syntax: ts.SourceFile,
  fileLines: number,
  limits: SourceLimits,
): CommentMeasure {
  const plain = plainComments(path, syntax)
  const exempt = PUBLISHED_BYTES.has(path)
  const hits: number[] = []
  let forms = 0
  let runs = 0
  for (const run of adjacentRuns(syntax.text, plain)) {
    const first = run[0]?.comment.startLine ?? 0
    const span = (run.at(-1)?.comment.endLine ?? 0) - first + 1
    if (span >= limits.commentRunLines) {
      if (exempt) continue
      runs += 1
      hits.push(first)
      continue
    }
    for (const { comment } of run)
      if (FORBIDDEN_COMMENT.some(pattern => pattern.test(comment.text))) {
        forms += 1
        hits.push(comment.startLine)
      }
  }
  const band = Math.max(
    limits.commentFloorLines,
    Math.floor((fileLines * limits.commentPercent) / 100),
  )
  const plainLines = plain.reduce((sum, item) => sum + item.lines, 0)
  const dense = !exempt && plainLines > band ? 1 : 0
  if (dense === 1) hits.push(plain[0]?.comment.startLine ?? 1)
  return {
    count: forms + runs + dense,
    firstLine: hits.length === 0 ? 0 : Math.min(...hits),
    forms,
    runs,
    dense,
  }
}

function functionBand(syntax: ts.SourceFile, functionLines: number): SourceMeasure['functions'] {
  let count = 0
  let longest = 0
  let longestLine = 0
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      const start = syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line
      const end = syntax.getLineAndCharacterOfPosition(node.end).line
      const span = end - start + 1
      if (span > functionLines) {
        count += 1
        if (span > longest) {
          longest = span
          longestLine = start + 1
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(syntax)
  return { count, longest, longestLine }
}

export function measureSource(path: string, text: string, limits: SourceLimits): SourceMeasure {
  const lines = lineCount(text)
  const noComments = { count: 0, firstLine: 0, forms: 0, runs: 0, dense: 0 }
  const noFunctions = { count: 0, longest: 0, longestLine: 0 }
  const needsFunctions = lines > limits.functionLines
  const needsComments = text.includes('//') || text.includes('/*')
  if (!needsFunctions && !needsComments)
    return { lines, comments: noComments, functions: noFunctions }
  const syntax = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, scriptKind(path))
  return {
    lines,
    comments: needsComments ? commentMeasure(path, syntax, lines, limits) : noComments,
    functions: needsFunctions ? functionBand(syntax, limits.functionLines) : noFunctions,
  }
}
