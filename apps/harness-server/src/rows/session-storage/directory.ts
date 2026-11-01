// 租户到事务域的目录（装配页「租户到事务域的目录」，sql-contract §2.4）。目录由本行持有：
// - 推导规则：`tenant/<organization>/<account>`，由租户的 tenantCodec 文本经 legal-identity 的公开 codec 推出，可逆。
// - 登记表：存储根目录下的一个 JSON 文件，只记租户的 tenantCodec 文本；整体替换用「临时文件、刷盘、改名、刷盘目录」；只增不删不改。
// - `resolve` 与 `lookup` 只查已发布的快照，不登记；登记只经 `ensureRegistered`，由组合行在放行的 `create` 之后调用。
// - 登记表损坏，或写它的规则与配置的规则不同：打开失败，行 FAILED。不以空目录启动。
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { accountCodec, organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import type {
  TenantDomain,
  TenantDomainAccess,
  TenantDomainLookup,
  TenantDomainResolution,
} from '@omne-harness/sql-contract'
import { z } from 'zod'
import { monotonicClock } from '../../shutdown.ts'
import type { StopResult } from '../../types.ts'
import { DOMAIN_RULE } from './config.ts'

export const DIRECTORY_FILE_FORMAT = 'tenant-domain-directory/1'

const fileSchema = z.strictObject({
  format: z.literal(DIRECTORY_FILE_FORMAT),
  domainRule: z.string(),
  tenants: z.array(z.string()),
})

/** 规则 `organization-account/1`。不是 legal-identity 铸出的租户文本时抛出 `TypeError`。 */
export function deriveTransactionDomain(tenantText: string): string {
  const parsed = tenantCodec.parse(tenantText)
  if (!parsed.ok) throw new TypeError('not a tenant that legal-identity minted')
  const organization = organizationCodec.encode(parsed.value.organization)
  const account = accountCodec.encode(parsed.value.account)
  if (!organization.ok || !account.ok)
    throw new TypeError('not a tenant that legal-identity minted')
  return `tenant/${organization.value}/${account.value}`
}

function entryOf(tenantText: string): TenantDomain {
  return {
    tenant: tenantText,
    domain: {
      scope: { kind: 'tenant', tenant: tenantText },
      transactionDomain: deriveTransactionDomain(tenantText),
    },
  }
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

/** 读登记表。没有文件是首次启动，得到空表。内容不合形状、规则不同或含非租户文本时抛出。 */
function readDirectoryFile(file: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('tenant domain directory file is corrupt: not JSON')
  }
  const parsed = fileSchema.safeParse(json)
  if (!parsed.success)
    throw new Error(
      `tenant domain directory file is corrupt: ${parsed.error.issues.map(issue => issue.message).join('; ')}`,
    )
  if (parsed.data.domainRule !== DOMAIN_RULE)
    throw new Error(
      `tenant domain directory file was written under rule "${parsed.data.domainRule}", this assembly uses "${DOMAIN_RULE}"`,
    )
  return parsed.data.tenants
}

function fsyncDirectory(directory: string): void {
  // Windows 没有目录刷盘：改名在 NTFS 上是原子的，目录项的断电耐久在这里不作承诺（已知限制）。
  if (process.platform === 'win32') return
  const fd = openSync(directory, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

/** 整体替换：临时文件、刷盘、改名、刷盘目录。 */
function writeDirectoryFile(file: string, tenants: readonly string[]): void {
  mkdirSync(dirname(file), { recursive: true })
  const content = JSON.stringify(
    { format: DIRECTORY_FILE_FORMAT, domainRule: DOMAIN_RULE, tenants },
    null,
    2,
  )
  const temporary = `${file}.${String(process.pid)}.tmp`
  const fd = openSync(temporary, 'w')
  try {
    writeSync(fd, `${content}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, file)
  fsyncDirectory(dirname(file))
}

export type RegisterOutcome =
  | Readonly<{ kind: 'registered' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type DirectoryOptions = Readonly<{
  file: string
  /** 向存储登记该租户的组合；返回后迁移已经完成（sql-contract §6.1）。 */
  register(entry: TenantDomain): Promise<RegisterOutcome>
}>

export type TenantDirectory = Readonly<{
  /** 交给 `createSessionStorage` 的目录能力：只查快照。 */
  access: TenantDomainAccess
  /** 受信的只读查找（`tenantDomainLookup`）。 */
  lookup: TenantDomainLookup
  holds(tenantText: string): boolean
  /** 登记并写入登记表；已登记的租户直接 `ready`。同一租户的并发调用共用一次登记。 */
  ensureRegistered(tenantText: string): Promise<TenantDomainResolution>
  /** 停止新的登记，等在途登记结束或到达期限。 */
  close(deadlineMonotonicMs: number): Promise<StopResult>
}>

const unavailable = (diagnostic: string): TenantDomainResolution => ({
  kind: 'unavailable',
  diagnostic,
})

export function openTenantDirectory(options: DirectoryOptions): TenantDirectory {
  const entries = new Map<string, TenantDomain>()
  for (const tenantText of readDirectoryFile(options.file)) {
    try {
      entries.set(tenantText, entryOf(tenantText))
    } catch {
      throw new Error('tenant domain directory file is corrupt: an entry is not a tenant text')
    }
  }
  const inFlight = new Map<string, Promise<TenantDomainResolution>>()
  let closing = false

  const snapshot = () => ({ revision: String(entries.size), entries: [...entries.values()] })

  async function registerOne(tenantText: string): Promise<TenantDomainResolution> {
    if (closing) return unavailable('the session storage composite is stopping')
    let entry: TenantDomain
    try {
      entry = entryOf(tenantText)
    } catch {
      return unavailable('not a tenant that legal-identity minted')
    }
    const registered = await options.register(entry)
    if (registered.kind === 'unavailable') return unavailable(registered.diagnostic)
    writeDirectoryFile(options.file, [...entries.keys(), tenantText])
    entries.set(tenantText, entry)
    return { kind: 'ready', entry }
  }

  return {
    access: {
      resolve: input => {
        const entry = entries.get(input.tenant)
        return Promise.resolve(
          entry === undefined
            ? unavailable('tenant is not registered in the directory')
            : { kind: 'ready', entry },
        )
      },
      snapshot: () => Promise.resolve({ kind: 'ready', value: snapshot() }),
    },
    lookup: {
      lookup: input => {
        const entry = entries.get(input.tenant)
        return Promise.resolve(
          entry === undefined ? { kind: 'unregistered' } : { kind: 'ready', domain: entry.domain },
        )
      },
    },
    holds: tenantText => entries.has(tenantText),
    ensureRegistered: tenantText => {
      const known = entries.get(tenantText)
      if (known !== undefined) return Promise.resolve({ kind: 'ready', entry: known })
      const running = inFlight.get(tenantText)
      if (running !== undefined) return running
      const task = registerOne(tenantText).finally(() => inFlight.delete(tenantText))
      inFlight.set(tenantText, task)
      return task
    },
    close: async deadlineMonotonicMs => {
      closing = true
      if (inFlight.size === 0) return { kind: 'settled' }
      const pending = [...inFlight.values()]
      const timer = monotonicClock.after(deadlineMonotonicMs - monotonicClock.now())
      const raced = await Promise.race([
        Promise.allSettled(pending).then(() => 'done' as const),
        timer.promise.then(() => 'deadline' as const),
      ])
      timer.cancel()
      return raced === 'done'
        ? { kind: 'settled' }
        : {
            kind: 'incomplete',
            detail: `${String(pending.length)} tenant registration(s) still in flight`,
          }
    },
  }
}
