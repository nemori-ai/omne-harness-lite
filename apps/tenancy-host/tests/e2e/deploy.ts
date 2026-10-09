// 照部署方式起治理中心（apps/tenancy-host/README.md「命令」「配置」）：
// `openssl` 生自签 CA 与服务端证书、`dist/cli.js keygen` 生部署密钥、全部配置经环境变量（文件走 `_FILE`）、
// `dist/cli.js serve` 起进程、就绪经运维面套接字的完整体检判定、`SIGTERM` 结束。
// 本模块是部署者一侧的工具，不是客户端，也不读进程内部：它只看退出码、标准输出与标准错误流（JSONL 工程记录）。
// 不 import 任何 `@omne-harness-lite/*` 包与 `src/`——被测的是构建产物 `dist/cli.js`。
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fullHealth } from './client.ts'

export const HOST_APP = resolve(import.meta.dirname, '..', '..')
export const CLI_JS = join(HOST_APP, 'dist', 'cli.js')
/** HB S-20：运维面套接字的文件名。 */
export const OPS_SOCKET_NAME = 'governance-center-ops.sock'

/** 一行命令记录（证据 `commands/`）。 */
export type CommandLog = (line: string) => void

export function assertBuilt(): void {
  if (!existsSync(CLI_JS))
    throw new Error(
      `${CLI_JS} 不存在：e2e 照部署方式运行构建产物，先在仓库根跑 pnpm run build（跳过不是通过）`,
    )
}

export function tempRoot(label: string): string {
  return mkdtempSync(join(tmpdir(), `omne-e2e-${label}-`))
}

// ---- TLS 材料：openssl（本机 1.1.1f） ----

export function openssl(args: readonly string[], cwd: string, log: CommandLog): void {
  log(`(cd ${cwd} && openssl ${args.join(' ')})`)
  execFileSync('openssl', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
}

export interface CertificateAuthority {
  readonly name: string
  readonly certFile: string
  readonly keyFile: string
  readonly certPem: string
}

/**
 * 每次 openssl 调用自带一份配置文件，不读系统的 openssl.cnf：系统缺省的 `v3_ca` 段会再加一条 basicConstraints，
 * 与这里的撞成两条同名扩展，验证方据此拒绝整个 CA（RFC 5280 §4.2）；自带配置让材料只取决于这里写下的内容。
 */
function writeConfig(dir: string, file: string, lines: readonly string[], log: CommandLog): string {
  const path = join(dir, file)
  writeFileSync(path, `${lines.join('\n')}\n`)
  log(`# ${file}: ${lines.join(' | ')}`)
  return path
}

/** 自签 CA：ECDSA P-256，根证书是客户端的配置输入（D-029 ②）。 */
export function makeCa(dir: string, name: string, log: CommandLog): CertificateAuthority {
  mkdirSync(dir, { recursive: true })
  const config = writeConfig(
    dir,
    `${name}.cnf`,
    [
      '[req]',
      'prompt = no',
      'distinguished_name = dn',
      '[dn]',
      `CN = ${name}`,
      '[v3_ca]',
      'basicConstraints = critical,CA:TRUE',
      'keyUsage = critical,keyCertSign,cRLSign',
      'subjectKeyIdentifier = hash',
    ],
    log,
  )
  openssl(
    [
      'req',
      '-x509',
      '-config',
      config,
      '-extensions',
      'v3_ca',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-pkeyopt',
      'ec_param_enc:named_curve',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.pem`,
      '-days',
      '3',
    ],
    dir,
    log,
  )
  chmodSync(join(dir, `${name}.key`), 0o600)
  const certFile = join(dir, `${name}.pem`)
  return {
    name,
    certFile,
    keyFile: join(dir, `${name}.key`),
    certPem: readFileSync(certFile, 'utf8'),
  }
}

export interface ServerCertificate {
  /** 部署配置的证书链：叶子在前、签发它的根在后。 */
  readonly chainFile: string
  /** 私钥（0600）。 */
  readonly keyFile: string
  readonly leafPem: string
  readonly keyPem: string
}

/** 由 `ca` 签发的服务端叶子证书，SAN 为 `sans`（形如 `DNS:localhost`、`IP:127.0.0.1`）。 */
export function makeServerCertificate(
  dir: string,
  name: string,
  ca: CertificateAuthority,
  sans: readonly string[],
  log: CommandLog,
): ServerCertificate {
  mkdirSync(dir, { recursive: true })
  const cn = (sans[0] ?? 'localhost').replace(/^[A-Z]+:/, '')
  const request = writeConfig(
    dir,
    `${name}.cnf`,
    ['[req]', 'prompt = no', 'distinguished_name = dn', '[dn]', `CN = ${cn}`],
    log,
  )
  openssl(
    [
      'req',
      '-new',
      '-config',
      request,
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-pkeyopt',
      'ec_param_enc:named_curve',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.csr`,
    ],
    dir,
    log,
  )
  const extensions = writeConfig(
    dir,
    `${name}.ext`,
    [
      `subjectAltName = ${sans.join(',')}`,
      'basicConstraints = critical,CA:FALSE',
      'keyUsage = critical,digitalSignature',
      'extendedKeyUsage = serverAuth',
      'subjectKeyIdentifier = hash',
      'authorityKeyIdentifier = keyid',
    ],
    log,
  )
  openssl(
    [
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      '-CA',
      ca.certFile,
      '-CAkey',
      ca.keyFile,
      '-CAcreateserial',
      '-out',
      `${name}.pem`,
      '-days',
      '2',
      '-sha256',
      '-extfile',
      extensions,
    ],
    dir,
    log,
  )
  const keyFile = join(dir, `${name}.key`)
  chmodSync(keyFile, 0o600)
  const leafPem = readFileSync(join(dir, `${name}.pem`), 'utf8')
  const chainFile = join(dir, `${name}.chain.pem`)
  writeFileSync(chainFile, `${leafPem}${ca.certPem}`)
  log(`cat ${name}.pem ${ca.name}.pem > ${name}.chain.pem`)
  return { chainFile, keyFile, leafPem, keyPem: readFileSync(keyFile, 'utf8') }
}

// ---- 进程入口 ----

export interface RunResult {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
}

/** 只交部署配置与 `PATH`：进程看到的环境就是部署配置，不继承测试进程的其余环境。 */
function processEnv(env: Readonly<Record<string, string>>): Record<string, string> {
  const path = process.env['PATH']
  return path === undefined ? { ...env } : { PATH: path, ...env }
}

/** 跑一次 `node dist/cli.js <args>` 到退出（keygen、启动失败、用法错误）。 */
export function runCli(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  log: CommandLog,
  timeoutMs = 60_000,
): Promise<RunResult> {
  log(`${envNames(env)}node ${CLI_JS} ${args.join(' ')}`)
  const child = spawn(process.execPath, [CLI_JS, ...args], {
    env: processEnv(env),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = collect(child)
  return new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`cli ${args.join(' ')} did not exit within ${String(timeoutMs)} ms`))
    }, timeoutMs)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      // 等两条流读尽
      setImmediate(() =>
        resolvePromise({ code, signal, stdout: out.stdout(), stderr: out.stderr() }),
      )
    })
  })
}

function envNames(env: Readonly<Record<string, string>>): string {
  const names = Object.keys(env).sort()
  return names.length === 0 ? '' : `env ${names.join(' ')} `
}

function collect(child: ChildProcess): { stdout: () => string; stderr: () => string } {
  let stdout = ''
  let stderr = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout += chunk
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk
  })
  return { stdout: () => stdout, stderr: () => stderr }
}

/** `keygen <dir>`：四份部署密钥；标准输出一行 JSON 给出四个 `_FILE` 变量与路径。 */
export async function keygen(dir: string, log: CommandLog): Promise<Record<string, string>> {
  const run = await runCli(['keygen', dir], {}, log)
  if (run.code !== 0) throw new Error(`keygen exited ${String(run.code)}: ${run.stderr}`)
  const line: unknown = JSON.parse(run.stdout.trim())
  if (typeof line !== 'object' || line === null || !('files' in line))
    throw new Error(`keygen printed an unexpected line: ${run.stdout}`)
  const files: unknown = line.files
  if (typeof files !== 'object' || files === null) throw new Error('keygen: no files')
  const env: Record<string, string> = {}
  for (const [name, path] of Object.entries(files)) {
    if (typeof path !== 'string') throw new Error(`keygen: ${name} is not a path`)
    env[name] = path
  }
  return env
}

// ---- 部署配置 ----

/** 五项部署参数与其余 config 的环境变量取值（README「配置」）。 */
export interface Settings {
  readonly unactivatedRetention: string
  readonly invitationTtlDefault: string
  readonly affiliationRequestTtlDefault: string
  readonly copyNoticeTtlDefault: string
  readonly sharingInvitationTtlDefault: string
  readonly teamCreationKeyRetention: string
  readonly clockReadyTimeout: string
  readonly credentialPolicy: string
}

export const SETTINGS: Settings = {
  unactivatedRetention: 'P7D',
  invitationTtlDefault: 'P14D',
  affiliationRequestTtlDefault: '1209600000',
  copyNoticeTtlDefault: '604800000',
  sharingInvitationTtlDefault: 'P7D',
  teamCreationKeyRetention: 'P1D',
  // 须大于时钟租约宽度 10 s（README）；强行结束后马上重启时要盖住等钟的那一段
  clockReadyTimeout: '15000',
  credentialPolicy: JSON.stringify({ minLength: 12 }),
}

/** 一份部署：库文件、四份部署密钥、TLS 材料、客户端一面的监听地址、运维面目录与参数。 */
export interface Deployment {
  readonly dbFile: string
  /** keygen 给出的四个 `_FILE` 变量。 */
  readonly keys: Readonly<Record<string, string>>
  readonly tls: { readonly chainFile: string; readonly keyFile: string }
  readonly host: string
  readonly port: number
  readonly opsDir: string
  readonly settings: Settings
}

export const ENV = {
  storageFile: 'OMNE_TENANCY_STORAGE_FILE',
  clockInitialize: 'OMNE_TENANCY_CLOCK_INITIALIZE',
  unactivatedRetention: 'OMNE_TENANCY_UNACTIVATED_RETENTION',
  invitationTtlDefault: 'OMNE_TENANCY_INVITATION_TTL_DEFAULT',
  affiliationRequestTtlDefault: 'OMNE_TENANCY_AFFILIATION_REQUEST_TTL_DEFAULT',
  copyNoticeTtlDefault: 'OMNE_TENANCY_COPY_NOTICE_TTL_DEFAULT',
  sharingInvitationTtlDefault: 'OMNE_TENANCY_SHARING_INVITATION_TTL_DEFAULT',
  teamCreationKeyRetention: 'OMNE_TENANCY_TEAM_CREATION_KEY_RETENTION',
  clockReadyTimeout: 'OMNE_TENANCY_CLOCK_READY_TIMEOUT',
  credentialPolicy: 'OMNE_TENANCY_CREDENTIAL_POLICY',
  entryListen: 'OMNE_TENANCY_ENTRY_LISTEN',
  entryTlsCertChainFile: 'OMNE_TENANCY_ENTRY_TLS_CERT_CHAIN_PEM_FILE',
  entryTlsPrivateKeyFile: 'OMNE_TENANCY_ENTRY_TLS_PRIVATE_KEY_PEM_FILE',
  opsSocketDir: 'OMNE_TENANCY_OPS_SOCKET_DIR',
} as const

/** 五项部署参数的变量名（PF-017「部署参数」）。 */
export const PARAMETER_VARIABLES = [
  ENV.unactivatedRetention,
  ENV.invitationTtlDefault,
  ENV.affiliationRequestTtlDefault,
  ENV.copyNoticeTtlDefault,
  ENV.sharingInvitationTtlDefault,
] as const

export function envOf(d: Deployment): Record<string, string> {
  return {
    [ENV.storageFile]: d.dbFile,
    [ENV.clockInitialize]: existsSync(`${d.dbFile}.clock.sqlite.clock.json`) ? '0' : '1',
    ...d.keys,
    [ENV.unactivatedRetention]: d.settings.unactivatedRetention,
    [ENV.invitationTtlDefault]: d.settings.invitationTtlDefault,
    [ENV.affiliationRequestTtlDefault]: d.settings.affiliationRequestTtlDefault,
    [ENV.copyNoticeTtlDefault]: d.settings.copyNoticeTtlDefault,
    [ENV.sharingInvitationTtlDefault]: d.settings.sharingInvitationTtlDefault,
    [ENV.teamCreationKeyRetention]: d.settings.teamCreationKeyRetention,
    [ENV.clockReadyTimeout]: d.settings.clockReadyTimeout,
    [ENV.credentialPolicy]: d.settings.credentialPolicy,
    [ENV.entryListen]: `${d.host}:${String(d.port)}`,
    [ENV.entryTlsCertChainFile]: d.tls.chainFile,
    [ENV.entryTlsPrivateKeyFile]: d.tls.keyFile,
    [ENV.opsSocketDir]: d.opsDir,
  }
}

export function opsSocketOf(d: Deployment): string {
  return join(d.opsDir, OPS_SOCKET_NAME)
}

/** 运维面目录：只属于运行用户（mkdtemp 建出即 0700）。 */
export function opsDirectory(parent: string): string {
  return mkdtempSync(join(parent, 'ops-'))
}

/** 取一个此刻空闲的本机端口。 */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  await new Promise<void>(done => server.close(() => done()))
  if (address === null || typeof address === 'string') throw new Error('no port')
  return address.port
}

// ---- 一个在跑的中心 ----

export interface Exit {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}

/** `node dist/cli.js serve` 起的一个进程；只看它的退出、标准输出与标准错误流。 */
export class CenterProcess {
  readonly label: string
  readonly #child: ChildProcess
  readonly #out: { stdout: () => string; stderr: () => string }
  readonly #exit: Promise<Exit>
  #exited: Exit | undefined

  private constructor(label: string, child: ChildProcess) {
    this.label = label
    this.#child = child
    this.#out = collect(child)
    this.#exit = new Promise(done => {
      child.once('exit', (code, signal) => {
        this.#exited = { code, signal }
        setImmediate(() => done({ code, signal }))
      })
    })
  }

  static serve(
    label: string,
    env: Readonly<Record<string, string>>,
    log: CommandLog,
  ): CenterProcess {
    log(`# [${label}] ${envNames(env)}node ${CLI_JS} serve`)
    const child = spawn(process.execPath, [CLI_JS, 'serve'], {
      env: processEnv(env),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return new CenterProcess(label, child)
  }

  get pid(): number | undefined {
    return this.#child.pid
  }

  get running(): boolean {
    return this.#exited === undefined
  }

  /** 标准错误流原文（JSONL 工程记录）。 */
  stderr(): string {
    return this.#out.stderr()
  }

  stdout(): string {
    return this.#out.stdout()
  }

  /** 逐行解析的工程记录；解析不了的行原样保留在 `unparsed` 里。 */
  records(): Record<string, unknown>[] {
    return parseJsonLines(this.stderr())
  }

  exited(): Promise<Exit> {
    return this.#exit
  }

  /**
   * 就绪：运维面套接字答出一份完整体检（HB S-20：只在客户端一面应答时才应答）。
   * 进程先退出或超时 ⇒ 拒绝并带上标准错误流。
   */
  async ready(socketPath: string, timeoutMs = 45_000): Promise<Record<string, unknown>> {
    const started = performance.now()
    for (;;) {
      if (!this.running)
        throw new Error(
          `[${this.label}] exited ${JSON.stringify(this.#exited)} before ready: ${this.stderr()}`,
        )
      const probe = await fullHealth(socketPath, 'readiness-probe', undefined, {}, undefined)
      if (probe.health !== undefined) return probe.health
      if (performance.now() - started > timeoutMs)
        throw new Error(
          `[${this.label}] not ready within ${String(timeoutMs)} ms: ${this.stderr()}`,
        )
      await new Promise(done => setTimeout(done, 100))
    }
  }

  /** 正常停机：SIGTERM，等它退出，返回退出码。 */
  async terminate(timeoutMs = 45_000): Promise<Exit> {
    if (this.running) this.#child.kill('SIGTERM')
    return await this.#waitExit(timeoutMs)
  }

  /** 强行结束：SIGKILL（不走任何撤除；机器照常开着）。 */
  async kill(): Promise<Exit> {
    if (this.running) this.#child.kill('SIGKILL')
    return await this.#waitExit(10_000)
  }

  async #waitExit(timeoutMs: number): Promise<Exit> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[${this.label}] did not exit within ${String(timeoutMs)} ms`)),
        timeoutMs,
      )
    })
    try {
      return await Promise.race([this.#exit, timeout])
    } finally {
      clearTimeout(timer)
    }
  }
}

export function parseJsonLines(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      try {
        const value: unknown = JSON.parse(line)
        return typeof value === 'object' && value !== null && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value))
          : { unparsed: line }
      } catch {
        return { unparsed: line }
      }
    })
}
