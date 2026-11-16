export type YamlNode = string | readonly YamlNode[] | YamlMap
export type YamlMap = ReadonlyMap<string, YamlNode>

export class LockfileSyntaxError extends Error {
  readonly line: number

  constructor(line: number, detail: string) {
    super(`第 ${line} 行：${detail}`)
    this.name = 'LockfileSyntaxError'
    this.line = line
  }
}

interface Line {
  readonly number: number
  readonly indent: number
  readonly text: string
}

function significantLines(source: string): Line[] {
  return source.split('\n').flatMap((raw, index) => {
    const number = index + 1
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^\s*(#.*)?$/u.test(line)) return []
    const indent = line.length - line.trimStart().length
    if (line.slice(0, indent).includes('\t'))
      throw new LockfileSyntaxError(number, '缩进里有制表符')
    return [{ number, indent, text: line.slice(indent).trimEnd() }]
  })
}

class FlowReader {
  private position = 0
  private readonly text: string
  private readonly line: number

  constructor(text: string, line: number) {
    this.text = text
    this.line = line
  }

  readWhole(): YamlNode {
    const value = this.readValue(new Set())
    this.skipSpaces()
    if (this.position !== this.text.length) this.fail(`值后面有多余内容：${this.rest()}`)
    return value
  }

  private readValue(stop: ReadonlySet<string>): YamlNode {
    this.skipSpaces()
    const char = this.text[this.position]
    if (char === undefined) this.fail('缺少值')
    if (char === '{') return this.readFlowMap()
    if (char === '[') return this.readFlowSequence()
    if (char === "'") return this.readSingleQuoted()
    if (char === '"') return this.readDoubleQuoted()
    return this.readPlain(stop)
  }

  private readFlowMap(): YamlMap {
    this.expect('{')
    const map = new Map<string, YamlNode>()
    this.skipSpaces()
    if (this.text[this.position] === '}') {
      this.position += 1
      return map
    }
    for (;;) {
      this.skipSpaces()
      const key = this.readKey(new Set([':']))
      this.expect(':')
      const value = this.readValue(new Set([',', '}']))
      if (map.has(key)) this.fail(`流式映射里重复的键：${key}`)
      map.set(key, value)
      this.skipSpaces()
      if (this.text[this.position] === ',') {
        this.position += 1
        continue
      }
      this.expect('}')
      return map
    }
  }

  private readFlowSequence(): readonly YamlNode[] {
    this.expect('[')
    const items: YamlNode[] = []
    this.skipSpaces()
    if (this.text[this.position] === ']') {
      this.position += 1
      return items
    }
    for (;;) {
      items.push(this.readValue(new Set([',', ']'])))
      this.skipSpaces()
      if (this.text[this.position] === ',') {
        this.position += 1
        continue
      }
      this.expect(']')
      return items
    }
  }

  private readKey(stop: ReadonlySet<string>): string {
    this.skipSpaces()
    const char = this.text[this.position]
    if (char === "'") return this.readSingleQuoted()
    if (char === '"') return this.readDoubleQuoted()
    return this.readPlain(stop)
  }

  private readPlain(stop: ReadonlySet<string>): string {
    const start = this.position
    while (this.position < this.text.length && !stop.has(this.text[this.position] ?? ''))
      this.position += 1
    const value = this.text.slice(start, this.position).trim()
    if (value === '') this.fail('缺少值')
    if (
      value.startsWith('&') ||
      value.startsWith('*') ||
      value.startsWith('|') ||
      value.startsWith('>')
    )
      this.fail(`不认识的标量写法：${value}`)
    return value
  }

  private readSingleQuoted(): string {
    this.expect("'")
    let value = ''
    for (;;) {
      const char = this.text[this.position]
      if (char === undefined) this.fail('单引号没有闭合')
      this.position += 1
      if (char !== "'") {
        value += char
        continue
      }
      if (this.text[this.position] === "'") {
        value += "'"
        this.position += 1
        continue
      }
      return value
    }
  }

  private readDoubleQuoted(): string {
    this.expect('"')
    let value = ''
    for (;;) {
      const char = this.text[this.position]
      if (char === undefined) this.fail('双引号没有闭合')
      this.position += 1
      if (char === '"') return value
      if (char !== '\\') {
        value += char
        continue
      }
      const escaped = this.text[this.position]
      this.position += 1
      if (escaped === '"' || escaped === '\\' || escaped === '/') value += escaped
      else if (escaped === 'n') value += '\n'
      else if (escaped === 't') value += '\t'
      else this.fail(`不认识的转义：\\${escaped ?? ''}`)
    }
  }

  private expect(char: string): void {
    if (this.text[this.position] !== char) this.fail(`这里应是 ${char}：${this.rest()}`)
    this.position += 1
  }

  private skipSpaces(): void {
    while (this.text[this.position] === ' ') this.position += 1
  }

  private rest(): string {
    return this.text.slice(this.position, this.position + 40)
  }

  private fail(detail: string): never {
    throw new LockfileSyntaxError(this.line, detail)
  }
}

function splitEntry(line: Line): { readonly key: string; readonly rest: string } {
  const { text } = line
  const quote = text[0]
  if (quote === "'" || quote === '"') {
    let end = 1
    for (;;) {
      end = text.indexOf(quote, end)
      if (end === -1) throw new LockfileSyntaxError(line.number, '键的引号没有闭合')
      if (quote === "'" && text[end + 1] === "'") {
        end += 2
        continue
      }
      if (quote === '"' && text[end - 1] === '\\') {
        end += 1
        continue
      }
      break
    }
    const key = new FlowReader(text.slice(0, end + 1), line.number).readWhole()
    if (typeof key !== 'string') throw new LockfileSyntaxError(line.number, '键不是字符串')
    const after = text.slice(end + 1)
    if (!after.startsWith(':')) throw new LockfileSyntaxError(line.number, '键后面应是冒号')
    return { key, rest: after.slice(1) }
  }
  const colon = /:(?: |$)/u.exec(text)
  if (colon === null) throw new LockfileSyntaxError(line.number, `这一行不是 键: 值：${text}`)
  return { key: text.slice(0, colon.index), rest: text.slice(colon.index + 1) }
}

class BlockParser {
  private index = 0
  private readonly lines: readonly Line[]

  constructor(lines: readonly Line[]) {
    this.lines = lines
  }

  parseDocument(): YamlMap {
    const first = this.lines[0]
    if (first === undefined) throw new LockfileSyntaxError(1, '文件是空的')
    if (first.indent !== 0) throw new LockfileSyntaxError(first.number, '第一行不能缩进')
    const root = this.parseBlock(0)
    if (!(root instanceof Map)) throw new LockfileSyntaxError(first.number, '顶层必须是映射')
    const leftover = this.lines[this.index]
    if (leftover !== undefined) throw new LockfileSyntaxError(leftover.number, '缩进对不上')
    return root
  }

  private parseBlock(indent: number): YamlNode {
    const first = this.lines[this.index]
    if (first === undefined || first.indent !== indent)
      throw new LockfileSyntaxError(first?.number ?? 0, '缺少缩进的块')
    return first.text.startsWith('- ') || first.text === '-'
      ? this.parseSequence(indent)
      : this.parseMap(indent)
  }

  private parseSequence(indent: number): readonly YamlNode[] {
    const items: YamlNode[] = []
    for (;;) {
      const line = this.lines[this.index]
      if (line === undefined || line.indent < indent) return items
      if (line.indent > indent) throw new LockfileSyntaxError(line.number, '序列项的缩进对不上')
      if (!line.text.startsWith('- '))
        throw new LockfileSyntaxError(line.number, '序列里混进了非序列项')
      items.push(new FlowReader(line.text.slice(2), line.number).readWhole())
      this.index += 1
    }
  }

  private parseMap(indent: number): YamlMap {
    const map = new Map<string, YamlNode>()
    for (;;) {
      const line = this.lines[this.index]
      if (line === undefined || line.indent < indent) return map
      if (line.indent > indent) throw new LockfileSyntaxError(line.number, '缩进对不上')
      if (line.text.startsWith('- '))
        throw new LockfileSyntaxError(line.number, '映射里混进了序列项')
      const { key, rest } = splitEntry(line)
      if (map.has(key)) throw new LockfileSyntaxError(line.number, `重复的键：${key}`)
      this.index += 1
      map.set(key, this.parseEntryValue(line, rest))
    }
  }

  private parseEntryValue(line: Line, rest: string): YamlNode {
    if (rest.trim() !== '') return new FlowReader(rest, line.number).readWhole()
    const next = this.lines[this.index]
    if (next === undefined || next.indent <= line.indent)
      throw new LockfileSyntaxError(line.number, '键后面没有值')
    return this.parseBlock(next.indent)
  }
}

export function parseLockfileYaml(source: string): YamlMap {
  return new BlockParser(significantLines(source)).parseDocument()
}

const isSequence = (node: YamlNode): node is readonly YamlNode[] => Array.isArray(node)

export function equalNodes(left: YamlNode, right: YamlNode): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right
  if (isSequence(left) || isSequence(right)) {
    if (!(isSequence(left) && isSequence(right)) || left.length !== right.length) return false
    return left.every((item, index) => {
      const other = right[index]
      return other !== undefined && equalNodes(item, other)
    })
  }
  if (left.size !== right.size) return false
  for (const [key, value] of left) {
    const other = right.get(key)
    if (other === undefined || !equalNodes(value, other)) return false
  }
  return true
}
