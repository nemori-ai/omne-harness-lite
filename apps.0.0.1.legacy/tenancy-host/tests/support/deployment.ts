// 一份测试部署：临时目录里的库文件、四份部署密钥（经 keygen 生成，0600）、TLS 材料、套接字目录、一个空闲端口，
// 以及对应的环境变量。日志汇收在内存里，按行解析成 JSON。
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ENV, type HostEnv, type LogLine, type LogSink, generateKeyFiles } from '../../src/index.ts'
import { TLS_FIXTURES, freePort } from './wire.ts'

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

/** 五项部署参数（毫秒）与 OG 的创建键保留期。 */
export const PARAMETERS = {
  unactivatedRetention: 7 * DAY,
  invitationTtlDefault: 14 * DAY,
  affiliationRequestTtlDefault: 14 * DAY,
  copyNoticeTtlDefault: 7 * DAY,
  sharingInvitationTtlDefault: 7 * DAY,
} as const

/** 等钟可读的上界：须大于时钟租约宽度 10 s。 */
export const CLOCK_READY_TIMEOUT_MS = 10_500

export function tempDirectory(label: string): string {
  return mkdtempSync(join(tmpdir(), `omne-host-${label}-`))
}

export interface Deployment {
  readonly root: string
  readonly file: string
  readonly keysDirectory: string
  readonly socketDirectory: string
  readonly socketPath: string
  readonly port: number
  env: Record<string, string | undefined>
}

export async function deployment(label: string, root = tempDirectory(label)): Promise<Deployment> {
  const keysDirectory = join(root, 'keys')
  const files = await generateKeyFiles(keysDirectory)
  const tlsKeyFile = join(root, 'tls-key.pem')
  writeFileSync(tlsKeyFile, TLS_FIXTURES.leafKeyPem, { mode: 0o600 })
  const socketDirectory = mkdtempSync(join(root, 'ops-'))
  const port = await freePort()
  const file = join(root, 'center.sqlite')
  const env: Record<string, string | undefined> = {
    [ENV.storageFile]: file,
    ...files,
    [ENV.unactivatedRetention]: String(PARAMETERS.unactivatedRetention),
    [ENV.invitationTtlDefault]: 'P14D',
    [ENV.affiliationRequestTtlDefault]: String(PARAMETERS.affiliationRequestTtlDefault),
    [ENV.teamCreationKeyRetention]: 'P1D',
    [ENV.copyNoticeTtlDefault]: String(PARAMETERS.copyNoticeTtlDefault),
    [ENV.sharingInvitationTtlDefault]: 'P7D',
    [ENV.clockReadyTimeout]: String(CLOCK_READY_TIMEOUT_MS),
    [ENV.credentialPolicy]: JSON.stringify({ minLength: 8 }),
    [ENV.entryListen]: `127.0.0.1:${String(port)}`,
    [ENV.entryTlsCertChain]: TLS_FIXTURES.chainPem,
    [`${ENV.entryTlsPrivateKey}_FILE`]: tlsKeyFile,
    [ENV.opsSocketDirectory]: socketDirectory,
  }
  Object.defineProperty(env, ENV.clockInitialize, {
    enumerable: true,
    get: () => (existsSync(`${file}.clock.sqlite.clock.json`) ? undefined : '1'),
  })
  return {
    root,
    file,
    keysDirectory,
    socketDirectory,
    socketPath: join(socketDirectory, 'governance-center-ops.sock'),
    port,
    env,
  }
}

export function asEnv(d: Deployment): HostEnv {
  return { ...d.env }
}

/** 内存里的 JSONL 日志汇。 */
export class LogCapture implements LogSink {
  readonly raw: string[] = []
  write(line: string): void {
    this.raw.push(line)
  }
  get lines(): LogLine[] {
    return this.raw.map(line => JSON.parse(line) as LogLine)
  }
  events(event: string): LogLine[] {
    return this.lines.filter(line => line['event'] === event)
  }
  text(): string {
    return this.raw.join('')
  }
}

// ---- 直接看库（绕过装配；只在中心停着时用） ----

export interface TableDump {
  readonly schema: readonly {
    readonly type: string
    readonly name: string
    readonly sql: string | null
  }[]
  readonly rows: Readonly<Record<string, readonly unknown[]>>
}

/**
 * 逐表比对用的内容快照：schema（sqlite_master）与每张表的全部行（按全部列排序）。
 * 打开会生附属文件，关闭最后一个句柄时 sqlite 检查点并删掉它们——只看内容，不看字节。
 */
export function dumpDatabase(file: string): TableDump {
  const db = new DatabaseSync(file, { readOnly: false })
  try {
    const schema = db
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all() as { type: string; name: string; sql: string | null }[]
    const rows: Record<string, unknown[]> = {}
    for (const { type, name } of schema) {
      if (type !== 'table') continue
      const columns = (
        db.prepare(`SELECT name FROM pragma_table_info('${name}')`).all() as {
          name: string
        }[]
      ).map(column => `"${column.name}"`)
      rows[name] = db.prepare(`SELECT * FROM "${name}" ORDER BY ${columns.join(', ')}`).all()
    }
    return { schema, rows }
  } finally {
    db.close()
  }
}

export function tablesOf(file: string): string[] {
  const db = new DatabaseSync(file)
  try {
    return (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    )
      .map(row => row.name)
      .sort()
  } finally {
    db.close()
  }
}

export function query<T>(file: string, text: string, ...params: (string | number | null)[]): T[] {
  const db = new DatabaseSync(file)
  try {
    return db.prepare(text).all(...params) as T[]
  } finally {
    db.close()
  }
}

export function execute(file: string, text: string, ...params: (string | number | null)[]): void {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false })
  try {
    db.prepare(text).run(...params)
  } finally {
    db.close()
  }
}

export function sidecarsOf(file: string): {
  readonly db: boolean
  readonly wal: boolean
  readonly shm: boolean
  readonly snapshot: boolean
} {
  return {
    db: existsSync(file),
    wal: existsSync(`${file}-wal`),
    shm: existsSync(`${file}-shm`),
    snapshot: existsSync(`${file}.upgrade-snapshot`),
  }
}

export function centerIdOf(file: string): string | null {
  const [row] = query<{ center_id: string | null }>(
    file,
    "SELECT center_id FROM governance_center WHERE slot = 'center'",
  )
  return row?.center_id ?? null
}
