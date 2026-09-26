import ts from 'typescript'

/** Consume the compiler's resolved declaration surface, including export type *. */
export function exportedTypes(program: ts.Program, file: string): readonly string[] {
  const source = program.getSourceFile(file)
  if (source === undefined) throw new Error(`declaration not in compiler program: ${file}`)
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(source)
  if (module === undefined) throw new Error(`declaration is not a module: ${file}`)
  return checker
    .getExportsOfModule(module)
    .filter(symbol => {
      const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
      return (target.flags & ts.SymbolFlags.Type) !== 0
    })
    .map(symbol => symbol.name)
    .sort()
}

export function typeConsumerSource(
  modules: readonly { specifier: string; names: readonly string[] }[],
): string {
  return modules
    .map(({ specifier, names }, index) => {
      if (names.length === 0) return ''
      const imports = names.map(name => `${name} as P${index}_${name}`)
      const exports = names.map(name => `P${index}_${name}`)
      return `import type { ${imports.join(', ')} } from ${JSON.stringify(specifier)};\nexport type { ${exports.join(', ')} };`
    })
    .join('\n')
}
