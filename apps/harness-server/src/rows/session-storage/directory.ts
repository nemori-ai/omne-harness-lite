import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
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

export function readDirectoryFile(file: string): string[] {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error('tenant domain directory file could not be read')
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('tenant domain directory file is corrupt: not JSON')
  }
  const parsed = fileSchema.safeParse(json)
  if (!parsed.success) throw new Error('tenant domain directory file is corrupt: invalid shape')
  if (parsed.data.domainRule !== DOMAIN_RULE)
    throw new Error('tenant domain directory file was written under a different rule')
  for (const tenant of parsed.data.tenants) {
    try {
      deriveTransactionDomain(tenant)
    } catch {
      throw new Error('tenant domain directory file is corrupt: an entry is not a tenant text')
    }
  }
  return parsed.data.tenants
}

export function fsyncDirectory(directory: string): void {
  if (process.platform === 'win32') return
  const fd = openSync(directory, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function writeDirectoryFile(file: string, tenants: readonly string[]): void {
  if (!statSync(file).isFile()) throw new Error('tenant domain directory file is missing')
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
  register(entry: TenantDomain): Promise<RegisterOutcome>
}>

export type TenantDirectory = Readonly<{
  access: TenantDomainAccess
  lookup: TenantDomainLookup
  holds(tenantText: string): boolean
  ensureRegistered(tenantText: string): Promise<TenantDomainResolution>
  close(deadlineMonotonicMs: number): Promise<StopResult>
}>

const unavailable = (diagnostic: string): TenantDomainResolution => ({
  kind: 'unavailable',
  diagnostic,
})

export function openTenantDirectory(options: DirectoryOptions): TenantDirectory {
  const entries = new Map<string, TenantDomain>()
  for (const tenantText of readDirectoryFile(options.file))
    entries.set(tenantText, entryOf(tenantText))
  const confirmed = new Set<string>()
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
    if (closing) return unavailable('the session storage composite is stopping')
    try {
      if (!entries.has(tenantText))
        writeDirectoryFile(options.file, [...entries.keys(), tenantText])
    } catch {
      return unavailable('the tenant domain directory could not be written')
    }
    entries.set(tenantText, entry)
    confirmed.add(tenantText)
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
      if (closing) return Promise.resolve(unavailable('the session storage composite is stopping'))
      const known = entries.get(tenantText)
      if (known !== undefined && confirmed.has(tenantText))
        return Promise.resolve({ kind: 'ready', entry: known })
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
