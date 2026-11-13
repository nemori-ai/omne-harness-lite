import ts from '@typescript/typescript6'

const TOOL_MARKERS = /eslint-|oxlint-|@ts-|v8 ignore|c8 ignore|istanbul ignore|Stryker|@vitest-/u

const FORBIDDEN_COMMENT: readonly RegExp[] = [
  /R\d+-D\d+|\bD-\d+|RFC-\d+|#\d{3,}|阶段 ?\d/u,
  /\b(?:TODO|FIXME|XXX|HACK)\b/u,
]

const HEADER_BLOCK_LINES = 5

export interface SourceMeasure {
  readonly lines: number
  readonly comments: { readonly count: number; readonly firstLine: number }
  readonly functions: {
    readonly count: number
    readonly longest: number
    readonly longestLine: number
  }
}

interface Comment {
  readonly pos: number
  readonly end: number
  readonly startLine: number
  readonly endLine: number
  readonly text: string
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

function headerBlocks(comments: readonly Comment[], firstTokenPos: number): Comment[][] {
  const header = comments.filter(comment => comment.end <= firstTokenPos)
  const blocks: Comment[][] = []
  for (const comment of header) {
    const block = blocks.at(-1)
    if (block !== undefined && comment.startLine <= (block.at(-1)?.endLine ?? 0) + 1)
      block.push(comment)
    else blocks.push([comment])
  }
  return blocks
}

function commentViolations(syntax: ts.SourceFile): { count: number; firstLine: number } {
  const all = commentsOf(syntax).filter(comment => !TOOL_MARKERS.test(comment.text))
  const firstToken =
    syntax.statements[0]?.getStart(syntax) ?? syntax.endOfFileToken.getStart(syntax)
  const inBlock = new Set<Comment>()
  const lines: number[] = []
  for (const block of headerBlocks(all, firstToken)) {
    const span = (block.at(-1)?.endLine ?? 0) - (block[0]?.startLine ?? 0) + 1
    if (span < HEADER_BLOCK_LINES) continue
    for (const comment of block) inBlock.add(comment)
    lines.push(block[0]?.startLine ?? 1)
  }
  for (const comment of all)
    if (!inBlock.has(comment) && FORBIDDEN_COMMENT.some(pattern => pattern.test(comment.text)))
      lines.push(comment.startLine)
  return { count: lines.length, firstLine: lines.length === 0 ? 0 : Math.min(...lines) }
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

export function measureSource(path: string, text: string, functionLines: number): SourceMeasure {
  const syntax = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path))
  const mayHaveComments = text.includes('//') || text.includes('/*')
  return {
    lines: lineCount(text),
    comments: mayHaveComments ? commentViolations(syntax) : { count: 0, firstLine: 0 },
    functions: functionBand(syntax, functionLines),
  }
}
