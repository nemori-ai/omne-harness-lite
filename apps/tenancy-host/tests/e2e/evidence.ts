// 证据留存：每次来往的线上原文（遮蔽后）、中心进程的工程记录、运维面体检答复、起进程用过的命令。
// 秘密（出示物、口令、私钥）一律以 `***` 遮蔽；每份原文留遮蔽前与遮蔽后两个 SHA-256，持有原文的人可据前者核对同一份。
// 写完之后按原样、base64url（带与不带填充）、十六进制（大小写）几种形式把整棵目录再搜一遍，任何一处命中都算失败。
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Exchange } from './client.ts'

export type SecretKind = 'presentation' | 'credential' | 'private-key'

export interface Secret {
  readonly value: string
  readonly kind: SecretKind
}

export const MASK = '***'

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** 一个秘密在输出里可能出现的形式（与 EC S-46、AI S-46 的搜法同一套）。 */
export function secretForms(value: string): { readonly form: string; readonly text: string }[] {
  const bytes = Buffer.from(value, 'utf8')
  const hex = bytes.toString('hex')
  return [
    { form: 'raw', text: value },
    { form: 'base64url', text: bytes.toString('base64url') },
    {
      form: 'base64url-padded',
      text: bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_'),
    },
    { form: 'hex-lower', text: hex },
    { form: 'hex-upper', text: hex.toUpperCase() },
  ]
}

/** 私钥 PEM 里能单独认出的片段：整份、拼起来的 base64 正文，以及正文的每一行。 */
function keyFragments(pem: string): string[] {
  const body = pem
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('-----'))
  return [pem.trim(), body.join(''), ...body.filter(line => line.length >= 16)]
}

/** 已知秘密的登记与遮蔽（演练打印与证据落盘共用）。 */
export class Secrets {
  readonly #secrets: Secret[] = []

  add(value: string, kind: SecretKind): void {
    if (value.length === 0) return
    for (const fragment of kind === 'private-key' ? keyFragments(value) : [value]) {
      if (this.#secrets.some(known => known.value === fragment)) continue
      this.#secrets.push({ value: fragment, kind })
    }
    // 长的先替换：一个秘密是另一个的子串时，不让短的先把长的切碎
    this.#secrets.sort((a, b) => b.value.length - a.value.length)
  }

  /** 登录成功答复里的出示物（EC S-19：全部输出里它唯一出现的一处）登记为秘密。 */
  learn(exchange: Exchange): void {
    const reply = exchange.reply
    if (reply.kind !== 'result' || typeof reply.value !== 'object' || reply.value === null) return
    const loginState: unknown = Reflect.get(reply.value, 'loginState')
    if (typeof loginState === 'string') this.add(loginState, 'presentation')
  }

  get all(): readonly Secret[] {
    return this.#secrets
  }

  mask(text: string): string {
    let masked = text
    for (const { value } of this.#secrets) masked = masked.replaceAll(value, MASK)
    return masked
  }
}

export interface ScanHit {
  readonly file: string
  readonly kind: SecretKind
  readonly form: string
}

export class Evidence {
  readonly root: string
  readonly secrets = new Secrets()
  readonly #transcripts = new Map<string, string[]>()
  #scenario = 'setup'
  #sequence = 0

  constructor(root: string) {
    this.root = root
    for (const sub of ['commands', 'output', 'transcript'])
      mkdirSync(join(root, sub), { recursive: true })
  }

  /** 之后的来往记在这个场景名下（`transcript/<场景>.jsonl`）。 */
  scenario(name: string): void {
    this.#scenario = name
  }

  /** 一次来往的原文（遮蔽后）与哈希。登录成功答复里的出示物先登记为秘密，再写。 */
  readonly observe = (exchange: Exchange): void => {
    this.secrets.learn(exchange)
    const maskedRequest = this.secrets.mask(exchange.request.toString('utf8'))
    const maskedAnswer = this.secrets.mask(exchange.wire.received.toString('utf8'))
    const line = {
      seq: ++this.#sequence,
      scenario: this.#scenario,
      label: exchange.label,
      face: exchange.face,
      read: describeReply(exchange),
      wire: {
        requestWritten: exchange.wire.requestWritten,
        tls: exchange.wire.tls?.protocol ?? null,
        peerAuthorized: exchange.wire.tls?.authorized ?? null,
        error: exchange.wire.error ?? null,
        timedOut: exchange.wire.timedOut,
        receivedBytes: exchange.wire.received.length,
      },
      request: {
        sha256: sha256(exchange.request),
        maskedSha256: sha256(maskedRequest),
        masked: maskedRequest,
      },
      answer: {
        sha256: sha256(exchange.wire.received),
        maskedSha256: sha256(maskedAnswer),
        masked: maskedAnswer,
      },
    }
    const lines = this.#transcripts.get(this.#scenario) ?? []
    lines.push(JSON.stringify(line))
    this.#transcripts.set(this.#scenario, lines)
  }

  /** 追加一行命令记录（遮蔽后）。 */
  command(line: string): void {
    appendFileSync(join(this.root, 'commands', 'commands.txt'), `${this.secrets.mask(line)}\n`)
  }

  /** 写一份输出文件（遮蔽后）；返回遮蔽掉的处数。 */
  output(path: string, content: string): number {
    const masked = this.secrets.mask(content)
    const file = join(this.root, 'output', path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, masked)
    return countMasks(masked) - countMasks(content)
  }

  /** 把已记的来往写成 `transcript/<场景>.jsonl`。 */
  flush(): void {
    for (const [scenario, lines] of this.#transcripts)
      writeFileSync(join(this.root, 'transcript', `${scenario}.jsonl`), `${lines.join('\n')}\n`)
  }

  /** 整棵证据目录按几种形式搜全部已登记的秘密。 */
  scan(): { readonly files: number; readonly hits: readonly ScanHit[] } {
    const files = listFiles(this.root)
    const hits: ScanHit[] = []
    for (const file of files) {
      const bytes = readFileSync(file)
      for (const secret of this.secrets.all)
        for (const { form, text } of secretForms(secret.value))
          if (bytes.includes(Buffer.from(text, 'utf8')))
            hits.push({ file: relative(this.root, file), kind: secret.kind, form })
    }
    return { files: files.length, hits }
  }
}

function countMasks(text: string): number {
  return text.split(MASK).length - 1
}

function describeReply(exchange: Exchange): string {
  const reply = exchange.reply
  switch (reply.kind) {
    case 'unreachable':
      return `unreachable: ${reply.why}`
    case 'entry':
      return reply.answer
    case 'result':
      return exchange.face === 'ops' ? 'full-health' : 'result'
    case 'failure':
      return `failure: ${reply.name}`
    case 'public-health':
      return 'public-health'
  }
}

export function listFiles(root: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) out.push(...listFiles(path))
    else out.push(path)
  }
  return out.sort()
}
