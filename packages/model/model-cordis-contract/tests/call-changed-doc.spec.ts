import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from '@typescript/typescript6'
import { expect, it } from 'vitest'

// The event contract is a JSDoc on the built declaration: a consumer reads the dispatch mode and
// the payload names from it, so the check reads the compiled file, not the source.
const declaration = fileURLToPath(new URL('../dist/cordis.d.ts', import.meta.url))

function eventTags(name: string): { mode: string[]; params: string[] } | undefined {
  const file = ts.createSourceFile(
    declaration,
    readFileSync(declaration, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
  )
  for (const statement of file.statements) {
    if (!ts.isModuleDeclaration(statement) || statement.name.text !== '@deepseek-ai/cordis')
      continue
    if (statement.body === undefined || !ts.isModuleBlock(statement.body)) continue
    for (const inner of statement.body.statements) {
      if (!ts.isInterfaceDeclaration(inner) || inner.name.text !== 'Events') continue
      for (const member of inner.members) {
        if (!ts.isMethodSignature(member) || !ts.isStringLiteral(member.name)) continue
        if (member.name.text !== name) continue
        const tags = ts.getJSDocTags(member)
        return {
          mode: tags
            .filter(tag => tag.tagName.text === 'mode')
            .map(tag => ts.getTextOfJSDocComment(tag.comment) ?? ''),
          params: tags.filter(ts.isJSDocParameterTag).map(tag => tag.name.getText(file)),
        }
      }
    }
  }
  return undefined
}

it('documents model-cordis-contract/call-changed as a parallel event with its three payload names', () => {
  expect(eventTags('model-cordis-contract/call-changed')).toEqual({
    mode: ['parallel'],
    params: ['tenant', 'call', 'revision'],
  })
})
