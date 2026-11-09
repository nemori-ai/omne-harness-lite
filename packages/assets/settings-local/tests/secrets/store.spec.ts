// The file custody of secret bindings (SPEC「Secret custody」): the pre-version file, the four
// write results, the exact key match of the use face, what the read faces show, and the three
// causes of an unavailable file. Every case runs on a real file in a temporary directory, and
// every visible result is scanned for the secret sentinels.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import {
  accountCodec,
  organizationCodec,
  tenant,
  tenantEquals,
  type TenantId,
} from '@omne-harness/legal-identity'
import {
  parseSecretText,
  type SecretBindingKey,
  type SecretScope,
  type SecretText,
} from '@omne-harness/settings'
import { parseInstant, type Instant } from '@omne-harness/utc-instant'
import { lockSync } from 'proper-lockfile'
import { afterEach, describe, expect, it, vi } from 'vitest'

let injectedRename: ((from: string, to: string) => void) | undefined

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  globalThis.__secretVaultActualFs = actual
  return {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (injectedRename) return injectedRename(from, to)
      return actual.renameSync(from, to)
    },
  }
})

import { createSecretVault, openSecretVault } from '../../src/secrets/index.ts'

const FACTORY = 'sk-sentinel-factory-55d0'
const SECRET_A = 'sk-sentinel-tenant-a-7f3a'
const SECRET_B = 'sk-sentinel-tenant-b-91c2'
const SECRET_SETTING = 'sk-sentinel-setting-2c8e'
const SENTINELS = [FACTORY, SECRET_A, SECRET_B, SECRET_SETTING]

function identity(suffix: string): TenantId {
  const account = accountCodec.parse(`acc_abcdefghjkmnpqrstvwxyz234${suffix}`)
  const organization = organizationCodec.parse(`org_abcdefghjkmnpqrstvwxyz234${suffix}`)
  if (!account.ok || !organization.ok) throw new Error('fixture identity')
  return tenant(organization.value, account.value)
}
const tenantA = identity('5')
const tenantB = identity('6')
const official: SecretScope = { layer: 'official' }
const scopeOf = (who: TenantId): SecretScope => ({ layer: 'tenant', tenant: who })

/** The targets the pre-version file maps to: the Model owner, its factory key and its credential ids. */
const MODEL_TARGET = (key: string) => ({ owner: 'model', key })
const FACTORY_KEY: SecretBindingKey = {
  scope: official,
  target: MODEL_TARGET('factory default'),
  purpose: 'model-send',
}
const modelKey = (who: TenantId, id: string): SecretBindingKey => ({
  scope: scopeOf(who),
  target: MODEL_TARGET(id),
  purpose: 'model-send',
})
const settingKey = (who: TenantId, item: string): SecretBindingKey => ({
  scope: scopeOf(who),
  target: { owner: 'tool', key: item },
  purpose: 'setting',
})

function text(raw: string): SecretText {
  const parsed = parseSecretText(raw)
  if (!parsed.ok) throw new Error(`fixture secret ${parsed.reason}`)
  return parsed.value
}
function instant(raw: string): Instant {
  const parsed = parseInstant(raw)
  if (!parsed.ok) throw new Error('fixture instant')
  return parsed.value
}
const AT = instant('2026-11-04T08:00:00Z')
const LATER = instant('2026-11-04T09:30:00Z')

const directories: string[] = []
afterEach(() => {
  injectedRename = undefined
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function scratch(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'secret-vault-')))
  directories.push(directory)
  return join(directory, 'model-vault.json')
}

/** A file in the format the Model host wrote before the version field existed. */
function writeV1(path: string, factorySecret = FACTORY): void {
  const tenantRow = (who: TenantId, id: string, secret: string, configuredAt?: string) => ({
    id,
    tenant: { organization: who.organization.text, account: who.account.text },
    purpose: 'model-send',
    secret,
    life: 'active',
    ...(configuredAt === undefined ? {} : { configuredAt }),
  })
  writeFileSync(
    path,
    JSON.stringify({
      closed: false,
      factorySecret,
      bindings: [
        tenantRow(tenantA, 'tenant-model-send:a', SECRET_A, '2026-11-04T08:00:00Z'),
        tenantRow(tenantB, 'tenant-model-send:b', SECRET_B),
      ],
    }),
  )
}

function opened(path: string) {
  const result = openSecretVault({ path })
  if (result.kind !== 'open') throw new Error(`vault ${result.kind}: ${result.cause}`)
  return result.vault
}
function created(path: string) {
  const result = createSecretVault({ path })
  if (result.kind !== 'open') throw new Error(`vault not created: ${result.kind}`)
  return result.vault
}

/** Everything a result could show, as text. `inspect` renders an Instant without calling toJSON. */
const shown = (value: unknown) => inspect(value, { depth: null })
function leaks(value: unknown): boolean {
  const seen = shown(value)
  return SENTINELS.some(sentinel => seen.includes(sentinel))
}

describe('the pre-version file', () => {
  it('reads the factory secret as the official Model binding and the rows as tenant Model bindings', () => {
    const path = scratch()
    writeV1(path)
    const vault = opened(path)
    expect(vault.describe(FACTORY_KEY)).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: null,
    })
    expect(vault.use(FACTORY_KEY)).toEqual({ kind: 'secret', value: FACTORY })
    expect(vault.describe(modelKey(tenantA, 'tenant-model-send:a'))).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: AT,
    })
    expect(vault.use(modelKey(tenantA, 'tenant-model-send:a'))).toEqual({
      kind: 'secret',
      value: SECRET_A,
    })
    expect(vault.describe(modelKey(tenantB, 'tenant-model-send:b'))).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: null,
    })
    expect(vault.use(modelKey(tenantB, 'tenant-model-send:b'))).toEqual({
      kind: 'secret',
      value: SECRET_B,
    })
  })

  it('does not read the factory secret as a tenant binding, nor a tenant row as the official one', () => {
    const path = scratch()
    writeV1(path)
    const vault = opened(path)
    expect(vault.use(modelKey(tenantA, 'factory default'))).toBe('missing')
    expect(
      vault.use({
        scope: official,
        target: MODEL_TARGET('tenant-model-send:a'),
        purpose: 'model-send',
      }),
    ).toBe('missing')
  })

  it('an empty factory secret is no official binding', () => {
    const path = scratch()
    writeV1(path, '')
    const vault = opened(path)
    expect(vault.describe(FACTORY_KEY)).toEqual({ kind: 'unbound' })
    expect(vault.use(FACTORY_KEY)).toBe('missing')
    expect(vault.use(modelKey(tenantA, 'tenant-model-send:a'))).toEqual({
      kind: 'secret',
      value: SECRET_A,
    })
  })

  it('the first write publishes the whole file as version 2, and a fresh open reads the same bindings', () => {
    const path = scratch()
    writeV1(path)
    const vault = opened(path)
    expect(vault.bind(settingKey(tenantA, 'Web/exa.apiKey'), text(SECRET_SETTING), AT)).toBe(
      'written',
    )
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    expect(stored.version).toBe(2)
    expect(stored).not.toHaveProperty('factorySecret')
    expect(stored).not.toHaveProperty('closed')
    expect(stored.bindings).toHaveLength(4)
    const again = opened(path)
    expect(again.use(FACTORY_KEY)).toEqual({ kind: 'secret', value: FACTORY })
    expect(again.describe(modelKey(tenantA, 'tenant-model-send:a'))).toEqual({
      kind: 'bound',
      life: 'active',
      configuredAt: AT,
    })
    expect(again.use(modelKey(tenantB, 'tenant-model-send:b'))).toEqual({
      kind: 'secret',
      value: SECRET_B,
    })
    expect(again.use(settingKey(tenantA, 'Web/exa.apiKey'))).toEqual({
      kind: 'secret',
      value: SECRET_SETTING,
    })
  })

  it.each([
    ['a row whose purpose is not model-send', { purpose: 'other' }],
    ['a row without an id', { id: undefined }],
    ['a row without a secret', { secret: undefined }],
    ['a row with an unknown life', { life: 'paused' }],
    ['a row whose time is not text', { configuredAt: 42 }],
    ['a row whose time is not an instant', { configuredAt: 'yesterday' }],
  ])('%s makes the pre-version file corrupt', (_name, overrides) => {
    const path = scratch()
    writeFileSync(
      path,
      JSON.stringify({
        closed: false,
        factorySecret: FACTORY,
        bindings: [
          {
            id: 'cred-a',
            tenant: { organization: tenantA.organization.text, account: tenantA.account.text },
            purpose: 'model-send',
            secret: SECRET_A,
            life: 'active',
            ...overrides,
          },
        ],
      }),
    )
    expect(openSecretVault({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
  })

  it('two rows for the same holder make the pre-version file corrupt', () => {
    const path = scratch()
    const row = {
      id: 'cred-a',
      tenant: { organization: tenantA.organization.text, account: tenantA.account.text },
      purpose: 'model-send',
      secret: SECRET_A,
      life: 'active',
    }
    writeFileSync(
      path,
      JSON.stringify({
        closed: false,
        factorySecret: FACTORY,
        bindings: [row, { ...row, life: 'revoked' }],
      }),
    )
    expect(openSecretVault({ path })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
  })
})

describe('the four results of a write', () => {
  it('a bind is written, and binding the same value again is written too', () => {
    const vault = created(scratch())
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    expect(vault.bind(key, text(SECRET_SETTING), AT)).toBe('written')
    expect(vault.bind(key, text(SECRET_SETTING), AT)).toBe('written')
    expect(vault.describe(key)).toEqual({ kind: 'bound', life: 'active', configuredAt: AT })
    expect(vault.bind(key, text(SECRET_A), LATER)).toBe('written')
    expect(vault.describe(key)).toEqual({ kind: 'bound', life: 'active', configuredAt: LATER })
    expect(vault.use(key)).toEqual({ kind: 'secret', value: SECRET_A })
  })

  it('a lock that is not free within the wait is not-written, and the old snapshot stays', () => {
    const path = scratch()
    created(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    const before = readFileSync(path, 'utf8')
    const release = lockSync(path, { realpath: false })
    try {
      const vault = opened(path)
      const started = performance.now()
      const result = openSecretVault({ path, lockWaitMs: 100, lockBackoffMs: 10 })
      if (result.kind !== 'open') throw new Error('vault missing')
      expect(result.vault.bind(key, text(SECRET_SETTING), AT)).toBe('not-written')
      expect(performance.now() - started).toBeLessThan(2_000)
      expect(result.vault.unbind(key)).toBe('not-written')
      expect(vault.describe(key)).toEqual({ kind: 'unbound' })
    } finally {
      release()
    }
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('a replace whose confirmation fails is unconfirmed, and describe then shows the real state', () => {
    const path = scratch()
    const vault = created(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    // The rename lands, then the call reports a failure: the publish may be visible.
    injectedRename = (from, to) => {
      globalThis.__secretVaultActualFs.renameSync(from, to)
      throw new Error('injected failure after the rename')
    }
    expect(vault.bind(key, text(SECRET_SETTING), AT)).toBe('unconfirmed')
    injectedRename = undefined
    expect(vault.describe(key)).toEqual({ kind: 'bound', life: 'active', configuredAt: AT })
    expect(opened(path).use(key)).toEqual({ kind: 'secret', value: SECRET_SETTING })
  })

  it('a tenant that was never minted is denied before the file is touched', () => {
    const path = scratch()
    const vault = created(path)
    const before = readFileSync(path, 'utf8')
    const copied = { ...tenantA } as TenantId
    const key: SecretBindingKey = {
      ...settingKey(tenantA, 'x'),
      scope: { layer: 'tenant', tenant: copied },
    }
    expect(vault.bind(key, text(SECRET_SETTING), AT)).toBe('denied')
    expect(vault.unbind(key)).toBe('denied')
    expect(vault.describe(key)).toBe('denied')
    expect(vault.use(key)).toBe('denied')
    expect(vault.list({ layer: 'tenant', tenant: copied }, null, 10)).toBe('denied')
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it('unbind removes the binding, and a second unbind is absent', () => {
    const vault = created(scratch())
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    expect(vault.unbind(key)).toBe('absent')
    vault.bind(key, text(SECRET_SETTING), AT)
    expect(vault.unbind(key)).toBe('removed')
    expect(vault.describe(key)).toEqual({ kind: 'unbound' })
    expect(vault.use(key)).toBe('missing')
  })

  it('a secret that is not a parsed secret text is refused as a programming error', () => {
    const vault = created(scratch())
    expect(() => vault.bind(settingKey(tenantA, 'x'), '' as SecretText, AT)).toThrow(TypeError)
    expect(() => vault.bind(settingKey(tenantA, 'x'), 'a\nb' as SecretText, AT)).toThrow(TypeError)
  })
})

describe('the use face takes exactly one binding', () => {
  function seeded() {
    const vault = created(scratch())
    vault.bind(settingKey(tenantA, 'Web/exa.apiKey'), text(SECRET_A), AT)
    vault.bind(settingKey(tenantB, 'Web/exa.apiKey'), text(SECRET_B), AT)
    vault.bind(modelKey(tenantA, 'tenant-model-send:a'), text(SECRET_SETTING), AT)
    return vault
  }

  it("a tenant's key does not take another tenant's secret", () => {
    const vault = seeded()
    expect(vault.use(settingKey(tenantA, 'Web/exa.apiKey'))).toEqual({
      kind: 'secret',
      value: SECRET_A,
    })
    expect(vault.use(settingKey(tenantB, 'Web/exa.apiKey'))).toEqual({
      kind: 'secret',
      value: SECRET_B,
    })
    expect(vault.use(settingKey(identity('7'), 'Web/exa.apiKey'))).toBe('missing')
    expect(vault.use({ ...settingKey(tenantA, 'Web/exa.apiKey'), scope: official })).toBe('missing')
  })

  it('a purpose does not take the secret of another purpose on the same target', () => {
    const vault = seeded()
    const model = modelKey(tenantA, 'tenant-model-send:a')
    expect(vault.use(model)).toEqual({ kind: 'secret', value: SECRET_SETTING })
    expect(vault.use({ ...model, purpose: 'setting' })).toBe('missing')
    expect(vault.describe({ ...model, purpose: 'setting' })).toEqual({ kind: 'unbound' })
  })

  it('a target does not take the secret of another target', () => {
    const vault = seeded()
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    expect(vault.use({ ...key, target: { owner: 'tool', key: 'Web/other' } })).toBe('missing')
    expect(vault.use({ ...key, target: { owner: 'model', key: 'Web/exa.apiKey' } })).toBe('missing')
  })

  it('a revoked binding is denied and an unreadable one is unavailable to the use face; both show as bound', () => {
    const vault = seeded()
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    expect(
      vault.revise(bindings =>
        bindings.map(item =>
          item.key.target.key === 'Web/exa.apiKey' &&
          item.key.scope.layer === 'tenant' &&
          tenantEquals(item.key.scope.tenant, tenantA)
            ? { ...item, life: 'revoked' }
            : item,
        ),
      ),
    ).toBe('written')
    expect(vault.use(key)).toBe('denied')
    expect(vault.describe(key)).toEqual({ kind: 'bound', life: 'revoked', configuredAt: AT })
    vault.revise(bindings =>
      bindings.map(item => (item.life === 'revoked' ? { ...item, life: 'unreadable' } : item)),
    )
    expect(vault.use(key)).toBe('unavailable')
    expect(vault.describe(key)).toEqual({ kind: 'bound', life: 'unreadable', configuredAt: AT })
  })
})

describe('what the read faces show', () => {
  it('describe and list carry no secret', () => {
    const vault = created(scratch())
    vault.bind(settingKey(tenantA, 'Web/exa.apiKey'), text(SECRET_A), AT)
    vault.bind(settingKey(tenantA, 'Web/other'), text(SECRET_SETTING), null)
    vault.bind(FACTORY_KEY, text(FACTORY), null)
    const view = vault.describe(settingKey(tenantA, 'Web/exa.apiKey'))
    const page = vault.list(scopeOf(tenantA), null, 10)
    expect(view).toEqual({ kind: 'bound', life: 'active', configuredAt: AT })
    expect(page).toEqual({
      entries: [
        {
          target: { owner: 'tool', key: 'Web/exa.apiKey' },
          purpose: 'setting',
          presence: { kind: 'bound', life: 'active', configuredAt: AT },
        },
        {
          target: { owner: 'tool', key: 'Web/other' },
          purpose: 'setting',
          presence: { kind: 'bound', life: 'active', configuredAt: null },
        },
      ],
      next: null,
    })
    expect(leaks(view)).toBe(false)
    expect(leaks(page)).toBe(false)
    expect(leaks(vault.list(official, null, 10))).toBe(false)
    expect(leaks(vault.snapshot())).toBe(true) // negative control: the snapshot is the one face that carries values
  })

  it('list is scoped and pages in a stable order through an opaque cursor', () => {
    const vault = created(scratch())
    for (const item of ['c', 'a', 'b']) vault.bind(settingKey(tenantA, item), text(SECRET_A), null)
    vault.bind(settingKey(tenantB, 'z'), text(SECRET_B), null)
    const first = vault.list(scopeOf(tenantA), null, 2)
    if (typeof first === 'string') throw new Error(first)
    expect(first.entries.map(entry => entry.target.key)).toEqual(['a', 'b'])
    expect(first.next).not.toBeNull()
    expect(JSON.parse(JSON.stringify(first.next))).toEqual(first.next)
    const second = vault.list(scopeOf(tenantA), first.next, 2)
    if (typeof second === 'string') throw new Error(second)
    expect(second.entries.map(entry => entry.target.key)).toEqual(['c'])
    expect(second.next).toBeNull()
    expect(() => vault.list(scopeOf(tenantA), null, 0)).toThrow(TypeError)
    expect(() => vault.list(scopeOf(tenantA), { after: 'not a cursor' }, 2)).toThrow(TypeError)
  })

  it('describe reads the file now: a binding removed by hand is unbound at once', () => {
    const path = scratch()
    const vault = created(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    vault.bind(key, text(SECRET_A), AT)
    expect(vault.describe(key)).toMatchObject({ kind: 'bound' })
    const stored = JSON.parse(readFileSync(path, 'utf8'))
    stored.bindings = []
    writeFileSync(path, JSON.stringify(stored))
    expect(vault.describe(key)).toEqual({ kind: 'unbound' })
    expect(vault.use(key)).toBe('missing')
    expect(vault.list(scopeOf(tenantA), null, 10)).toEqual({ entries: [], next: null })
  })

  it('a change by another handle is seen by this one', () => {
    const path = scratch()
    const first = created(path)
    const second = opened(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    second.bind(key, text(SECRET_A), AT)
    expect(first.use(key)).toEqual({ kind: 'secret', value: SECRET_A })
    second.unbind(key)
    expect(first.use(key)).toBe('missing')
  })
})

describe('an unavailable file', () => {
  it('missing', () => {
    expect(openSecretVault({ path: join(tmpdir(), 'no-such-dir', 'vault.json') })).toEqual({
      kind: 'unavailable',
      cause: 'missing',
    })
  })

  it('corrupt: not JSON, not a vault shape, or a version this code does not know', () => {
    for (const body of [
      'not-json',
      JSON.stringify({ version: 2, bindings: 'none' }),
      JSON.stringify({ version: 3, bindings: [] }),
      '',
    ]) {
      const path = scratch()
      writeFileSync(path, body)
      expect(openSecretVault({ path }), body).toEqual({ kind: 'unavailable', cause: 'corrupt' })
      expect(readFileSync(path, 'utf8')).toBe(body)
    }
  })

  it('io: a directory on the path', () => {
    const path = scratch()
    mkdirSync(path)
    expect(openSecretVault({ path })).toEqual({ kind: 'unavailable', cause: 'io' })
  })

  it('a live handle answers unavailable and not-written once the file is unreadable, and keeps its bytes', () => {
    const path = scratch()
    const vault = created(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    writeFileSync(path, 'not-json')
    expect(vault.describe(key)).toBe('unavailable')
    expect(vault.use(key)).toBe('unavailable')
    expect(vault.list(scopeOf(tenantA), null, 10)).toBe('unavailable')
    expect(vault.snapshot()).toBe('unavailable')
    expect(vault.bind(key, text(SECRET_A), AT)).toBe('not-written')
    expect(vault.unbind(key)).toBe('not-written')
    expect(readFileSync(path, 'utf8')).toBe('not-json')
  })

  it('creation adopts a readable file and refuses an unreadable one', () => {
    const path = scratch()
    writeV1(path)
    const adopted = createSecretVault({ path })
    expect(adopted).toMatchObject({ kind: 'open', created: false })
    if (adopted.kind !== 'open') throw new Error('adopt')
    expect(adopted.vault.use(FACTORY_KEY)).toEqual({ kind: 'secret', value: FACTORY })
    const corrupt = scratch()
    writeFileSync(corrupt, 'not-json')
    expect(createSecretVault({ path: corrupt })).toEqual({ kind: 'unavailable', cause: 'corrupt' })
    expect(readFileSync(corrupt, 'utf8')).toBe('not-json')
    expect(existsSync(`${corrupt}.lock`)).toBe(false)
  })

  it('creation seeds the bindings it is given only when it builds the file', () => {
    const path = scratch()
    const built = createSecretVault({
      path,
      seed: [{ key: FACTORY_KEY, secret: text(FACTORY), configuredAt: null }],
    })
    expect(built).toMatchObject({ kind: 'open', created: true })
    if (built.kind !== 'open') throw new Error('build')
    expect(built.vault.use(FACTORY_KEY)).toEqual({ kind: 'secret', value: FACTORY })
    const again = createSecretVault({
      path,
      seed: [{ key: FACTORY_KEY, secret: text(SECRET_B), configuredAt: null }],
    })
    expect(again).toMatchObject({ kind: 'open', created: false })
    if (again.kind !== 'open') throw new Error('adopt')
    expect(again.vault.use(FACTORY_KEY)).toEqual({ kind: 'secret', value: FACTORY })
  })
})

describe('close', () => {
  it('after close every face answers denied or unavailable, and the file is untouched', () => {
    const path = scratch()
    const vault = created(path)
    const key = settingKey(tenantA, 'Web/exa.apiKey')
    vault.bind(key, text(SECRET_A), AT)
    const before = readFileSync(path, 'utf8')
    vault.close()
    expect(vault.bind(key, text(SECRET_B), LATER)).toBe('denied')
    expect(vault.unbind(key)).toBe('denied')
    expect(vault.describe(key)).toBe('denied')
    expect(vault.use(key)).toBe('denied')
    expect(vault.list(scopeOf(tenantA), null, 10)).toBe('denied')
    expect(vault.snapshot()).toBe('unavailable')
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(opened(path).use(key)).toEqual({ kind: 'secret', value: SECRET_A })
  })
})

describe('options', () => {
  it('rejects a lock wait or backoff that is not a non-negative safe integer, before the file is read', () => {
    const path = join(tmpdir(), 'no-such-dir', 'vault.json')
    for (const bad of [Number.NaN, Infinity, -1, 1.5, '100', null]) {
      expect(() => openSecretVault({ path, lockWaitMs: bad as number })).toThrow(TypeError)
      expect(() => openSecretVault({ path, lockBackoffMs: bad as number })).toThrow(TypeError)
    }
    expect(() => openSecretVault({ path: '' })).toThrow(TypeError)
  })
})

declare global {
  // The real fs, kept for the one case that lets a rename land and then fail.
  var __secretVaultActualFs: typeof import('node:fs')
}
