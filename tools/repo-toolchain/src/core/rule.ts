export interface SourceFile {
  readonly path: string
  readonly text: string
  readonly resolvedModules?: Readonly<Record<string, string>>
}

export interface Violation {
  readonly rule: string
  readonly path: string
  readonly line: number
  readonly message: string
}

export interface Rule {
  readonly id: string
  readonly source: string
  readonly description: string
  check(files: readonly SourceFile[]): Violation[]
}

export function isTestPath(path: string): boolean {
  return path.includes('/tests/') || /\.(spec|test)(-d)?\.ts$/.test(path)
}

export function scanLines(
  rule: Rule,
  files: readonly SourceFile[],
  pattern: RegExp,
  message: string,
  exempt: (path: string) => boolean,
): Violation[] {
  const out: Violation[] = []
  for (const file of files) {
    if (exempt(file.path)) continue
    const lines = file.text.split('\n')
    lines.forEach((line, index) => {
      if (pattern.test(line)) out.push({ rule: rule.id, path: file.path, line: index + 1, message })
    })
  }
  return out
}
