/** 一条结构检查规则：对一组源码文件给出违反点。规则只看文本与路径，不做类型分析——便宜、可自测。 */
export interface SourceFile {
  /** 相对于扫描根（`packages/`）的 POSIX 路径。 */
  readonly path: string
  readonly text: string
}

export interface Violation {
  readonly rule: string
  readonly path: string
  readonly line: number
  readonly message: string
}

export interface Rule {
  readonly id: string
  /** 来源条款（契约或节点 verification 的编号），供报告引用。 */
  readonly source: string
  readonly description: string
  check(files: readonly SourceFile[]): Violation[]
}

export function isTestPath(path: string): boolean {
  return path.includes('/tests/') || /\.(spec|test)(-d)?\.ts$/.test(path)
}

/** 逐行扫描：`pattern` 命中且 `exempt(path)` 为假 ⇒ 违反。 */
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
