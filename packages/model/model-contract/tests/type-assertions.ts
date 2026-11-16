import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from '@typescript/typescript6'

export const MINT_MARKER = 'brand-mint:'

export const MAX_MINT_SITES = 1

export type AssertionSite = Readonly<{
  file: string
  line: number
  text: string
  marked: boolean
}>

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return /\.(ts|mts|cts|tsx)$/u.test(entry.name) ? [path] : []
    })
}

function isConst(node: ts.AsExpression | ts.TypeAssertion): boolean {
  return ts.isTypeReferenceNode(node.type) && node.type.typeName.getText() === 'const'
}

export function findTypeAssertions(roots: readonly string[]): AssertionSite[] {
  const sites: AssertionSite[] = []
  for (const file of roots.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true)
    const visit = (node: ts.Node): void => {
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && !isConst(node)) {
        const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line
        const nearby = `${lines[line - 1] ?? ''}\n${lines[line] ?? ''}`
        sites.push({
          file,
          line: line + 1,
          text: node.getText(parsed),
          marked: nearby.includes(MINT_MARKER),
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return sites
}

export function assertionViolations(sites: readonly AssertionSite[], source: string): string[] {
  const where = (site: AssertionSite) => `${site.file}:${site.line} ${site.text}`
  const marked = sites.filter(site => site.marked)
  const outsideSource = (site: AssertionSite) => {
    const from = relative(source, site.file)
    return from.startsWith('..') || from.startsWith('testing')
  }
  return [
    ...sites.filter(site => !site.marked).map(site => `unmarked assertion ${where(site)}`),
    ...marked
      .filter(outsideSource)
      .map(site => `mint marker outside product source ${where(site)}`),
    ...marked
      .slice(MAX_MINT_SITES)
      .map(site => `mint marker beyond the ${MAX_MINT_SITES} allowed ${where(site)}`),
  ]
}
