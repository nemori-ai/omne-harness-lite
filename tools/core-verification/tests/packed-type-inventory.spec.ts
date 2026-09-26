import ts from 'typescript'
import { expect, it } from 'vitest'
import { exportedTypes, typeConsumerSource } from '../src/packed-type-inventory.ts'

it('w6.inventory.follows-star-aliases-and-dual-use-types', () => {
  const files = new Map([
    ['/entry.ts', "export type * from './types'; export { Shape as Alias } from './types';"],
    [
      '/types.ts',
      'export interface Shape { size: number }; export class Value {}; export const number = 1;',
    ],
  ])
  const host = ts.createCompilerHost({})
  host.fileExists = file => files.has(file)
  host.readFile = file => files.get(file)
  host.getSourceFile = (file, languageVersion) => {
    const text = files.get(file)
    return text === undefined ? undefined : ts.createSourceFile(file, text, languageVersion, true)
  }
  const program = ts.createProgram(['/entry.ts'], { noLib: true }, host)
  expect(exportedTypes(program, '/entry.ts')).toEqual(['Alias', 'Shape', 'Value'])
  expect(typeConsumerSource([{ specifier: 'package', names: ['Alias', 'Shape'] }])).toContain(
    'export type { P0_Alias, P0_Shape }',
  )
  expect(() => exportedTypes(program, '/missing.ts')).toThrow('not in compiler program')
})
