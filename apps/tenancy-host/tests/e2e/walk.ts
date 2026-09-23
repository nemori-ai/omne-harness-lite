// 手动演练入口：对一个已经在跑的治理中心，把注册 → 登录 → 建组织 → 切换 → 邀请 → 接受走一遍，逐步打印请求与答复。
// 驱动器与套件同一份（journey.ts 的 walk）；出示物与口令打印前一律遮蔽成 ***。
//
//   node --experimental-strip-types apps/tenancy-host/tests/e2e/walk.ts <中心地址 host:port> <CA 文件> [选项]
//     --servername <名>   核对证书用的主机名（缺省取地址的主机部分，D-029 ②）
//     --prefix <前缀>      两个登录标识的前缀（缺省随机，免得与中心里已有的撞上）
//     --pause             每一步之前等回车
//
// 退出码：0 走完；1 某一步没得到应有的答复（打印拿到的是什么）；2 用法错误。
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { type Exchange, client, describe } from './client.ts'
import { Secrets } from './evidence.ts'
import { type Account, walk } from './journey.ts'

const USAGE =
  'usage: node --experimental-strip-types walk.ts <host:port> <ca-file> [--servername <name>] [--prefix <prefix>] [--pause]'

interface Options {
  readonly host: string
  readonly port: number
  readonly caFile: string
  readonly servername: string
  readonly prefix: string
  readonly pause: boolean
}

function parse(argv: readonly string[]): Options | undefined {
  const positional: string[] = []
  let servername: string | undefined
  let prefix: string | undefined
  let pause = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--pause') pause = true
    else if (arg === '--servername') servername = argv[++i]
    else if (arg === '--prefix') prefix = argv[++i]
    else if (arg !== undefined && !arg.startsWith('--')) positional.push(arg)
    else return undefined
  }
  const [address, caFile] = positional
  if (positional.length !== 2 || address === undefined || caFile === undefined) return undefined
  const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(address)
  if (match === null) return undefined
  const host = match[1] ?? match[2] ?? ''
  return {
    host,
    port: Number(match[3]),
    caFile,
    servername: servername ?? host,
    prefix: prefix ?? `walk-${randomBytes(3).toString('hex')}`,
    pause,
  }
}

function indent(text: string): string {
  return text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n')
}

async function main(argv: readonly string[]): Promise<number> {
  const options = parse(argv)
  if (options === undefined) {
    process.stderr.write(`${USAGE}\n`)
    return 2
  }
  const secrets = new Secrets()
  const account = (role: string): Account => {
    const credential = randomBytes(18).toString('base64url')
    secrets.add(credential, 'credential')
    return { loginIdentifier: `${options.prefix}-${role}@example.invalid`, credential }
  }
  const print = (exchange: Exchange): void => {
    secrets.learn(exchange)
    process.stdout.write(
      `  → ${exchange.label}\n${indent(secrets.mask(exchange.request.toString('utf8')))}\n` +
        `  ← ${describe(exchange).startsWith('result') ? 'result' : describe(exchange)}\n` +
        `${indent(secrets.mask(exchange.wire.received.toString('utf8')))}\n\n`,
    )
  }
  const center = client(
    {
      host: options.host,
      port: options.port,
      servername: options.servername,
      ca: readFileSync(options.caFile, 'utf8'),
    },
    { observe: print },
  )
  const prompt = options.pause
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined
  let n = 0
  try {
    const result = await walk(center, account('inviter'), account('invitee'), async title => {
      process.stdout.write(`\n[${String(++n)}] ${title}\n`)
      if (prompt !== undefined) await prompt.question('  （回车继续）')
    })
    process.stdout.write(
      `走完：中心 ${result.centerId}；组织 ${result.organization}；` +
        `被邀请者加入后的租户 ${JSON.stringify(result.joinedTenant)}；成员 ${String(result.members.length)} 位。\n`,
    )
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${secrets.mask(message)}\n`)
    return 1
  } finally {
    prompt?.close()
  }
}

process.exitCode = await main(process.argv.slice(2))
