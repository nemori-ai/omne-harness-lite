// Replacing the factory secret, and a plugin configuration that names only the vault path. A host
// setup command builds the vault, so the serializable configuration of the plugin keeps no secret.
// Every key here is a synthetic string built at run time.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  MODEL_SEND,
  decodeCredentialId,
  type CredentialReference,
} from '@omne-harness/model-contract/provider'
import { describe, expect, it, vi } from 'vitest'
import { LocalCredentialPlugin } from '../src/cordis.ts'
import { createLocalCustodian, openLocalCustodian } from '../src/index.ts'
import {
  inspectLocalCustodian,
  replaceVaultSecret,
  type EntryKind,
  type PermissionGuard,
} from '../src/vault.ts'

const OLD = ['synth', 'old', 'factory'].join('-')
const NEW = ['synth', 'new', 'factory'].join('-')
const BOUND = ['synth', 'tenant', 'bound'].join('-')

function reference(account: string, id = 'cred-a'): CredentialReference {
  const parsedAccount = accountCodec.parse(account)
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const parsedId = decodeCredentialId(id)
  if (!parsedAccount.ok || !organization.ok || !('ok' in parsedId)) throw new Error('fixture')
  return {
    id: parsedId.ok,
    tenant: tenant(organization.value, parsedAccount.value),
    purpose: MODEL_SEND,
  }
}

// A tenant without a binding gets the factory value on an official, authorized send.
const unbound = () => reference('acc_abcdefghjkmnpqrstvwxyz2345', 'cred-factory')
const bound = () => reference('acc_bbcdefghjkmnpqrstvwxyz2345')
const SEND = { authorized: true, official: true } as const

function scratchPath(): string {
  return join(realpathSync(mkdtempSync(join(tmpdir(), 'vault-replace-'))), 'vault.json')
}

function factoryValue(path: string): string | undefined {
  const opened = openLocalCustodian({ path })
  if (opened.kind !== 'open') return undefined
  const decision = opened.custodian.resolve(unbound(), SEND)
  opened.custodian.close()
  return decision.kind === 'value' ? decision.value : undefined
}

describe('LocalCustodian.replaceFactorySecret', () => {
  it('replaces the factory secret and leaves every binding as it was', () => {
    const path = scratchPath()
    const store = createLocalCustodian({ path, factorySecret: OLD })
    store.put(bound(), BOUND)
    store.replaceFactorySecret(NEW)
    store.close()

    expect(factoryValue(path)).toBe(NEW)
    const reopened = openLocalCustodian({ path })
    if (reopened.kind !== 'open') throw new Error('vault unreadable')
    expect(reopened.custodian.resolve(bound(), SEND)).toMatchObject({
      kind: 'value',
      value: BOUND,
    })
  })

  it('negative control: rotate of a binding does not touch the factory secret', () => {
    const path = scratchPath()
    const store = createLocalCustodian({ path, factorySecret: OLD })
    store.put(bound(), BOUND)
    store.rotate(bound(), NEW)
    store.close()
    expect(factoryValue(path)).toBe(OLD)
  })
})

describe('replaceVaultSecret', () => {
  it('writes the new key, confirms it, and the result holds no key', async () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const result = await replaceVaultSecret(path, { readSecret: () => `  ${NEW}\n` })
    expect(result).toEqual({ ok: true, path, rebuilt: false })
    expect(factoryValue(path)).toBe(NEW)
    expect(JSON.stringify(result)).not.toContain(NEW)
  })

  it('refuses a path without a vault before it reads the key, and creates nothing', async () => {
    const path = scratchPath()
    const readSecret = vi.fn(() => NEW)
    expect(await replaceVaultSecret(path, { readSecret })).toEqual({
      ok: false,
      reason: 'vault-unavailable',
    })
    expect(readSecret).not.toHaveBeenCalled()
    expect(existsSync(path)).toBe(false)
  })

  it('refuses a damaged vault and leaves its bytes', async () => {
    const path = scratchPath()
    writeFileSync(path, 'not-json')
    expect(await replaceVaultSecret(path, { readSecret: () => NEW })).toEqual({
      ok: false,
      reason: 'vault-unavailable',
    })
    expect(readFileSync(path, 'utf8')).toBe('not-json')
  })

  it.each([
    ['secret-empty', '   \n'],
    ['secret-malformed', `${NEW}\u0007x`],
  ] as const)('refuses an input that is %s and keeps the old key', async (reason, input) => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    expect(await replaceVaultSecret(path, { readSecret: () => input })).toEqual({
      ok: false,
      reason,
    })
    expect(factoryValue(path)).toBe(OLD)
  })

  it('writes under the guard and narrows the file', async () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const calls: string[] = []
    const guard: PermissionGuard = {
      confine: create => {
        calls.push('confine')
        return create()
      },
      narrow: (_path: string, kind: EntryKind) => calls.push(`narrow:${kind}`),
      verify: (_path: string, kind: EntryKind) => calls.push(`verify:${kind}`),
    }
    expect(await replaceVaultSecret(path, { readSecret: () => NEW, guard })).toEqual({
      ok: true,
      path,
      rebuilt: false,
    })
    expect(calls).toEqual(['confine', 'narrow:file', 'verify:file'])
  })

  it('reports written-not-private when the mode does not read back: the new key is in the file', async () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const guard: PermissionGuard = {
      confine: create => create(),
      narrow: () => undefined,
      verify: () => {
        throw new Error('mode is wide')
      },
    }
    expect(await replaceVaultSecret(path, { readSecret: () => NEW, guard })).toEqual({
      ok: false,
      reason: 'written-not-private',
    })
    // The reason says the truth: the old key is gone, the new one is stored.
    expect(factoryValue(path)).toBe(NEW)
  })
})

describe('replaceVaultSecret with rebuildUnreadable', () => {
  const home = (path: string) => () => join(path, '..', '..')

  it('builds a new vault in place of a damaged file, without reading the old content', async () => {
    const path = scratchPath()
    writeFileSync(path, '{not json')
    const result = await replaceVaultSecret(path, {
      readSecret: () => NEW,
      rebuildUnreadable: true,
      home: home(path),
    })
    // The built path is the real path, which may spell the user directory in its long form.
    expect(result).toMatchObject({ ok: true, rebuilt: true })
    expect(factoryValue(path)).toBe(NEW)
  })

  it('negative control: without the option a damaged file stays as it is', async () => {
    const path = scratchPath()
    writeFileSync(path, '{not json')
    expect(await replaceVaultSecret(path, { readSecret: () => NEW })).toEqual({
      ok: false,
      reason: 'vault-unavailable',
    })
    expect(readFileSync(path, 'utf8')).toBe('{not json')
  })

  it('keeps the damaged file when the new key is refused', async () => {
    const path = scratchPath()
    writeFileSync(path, '{not json')
    expect(
      await replaceVaultSecret(path, {
        readSecret: () => '  ',
        rebuildUnreadable: true,
        home: home(path),
      }),
    ).toEqual({ ok: false, reason: 'secret-empty' })
    expect(readFileSync(path, 'utf8')).toBe('{not json')
  })

  it('never removes a directory on the path, and reads no key', async () => {
    const path = scratchPath()
    mkdirSync(path)
    writeFileSync(join(path, 'inside.txt'), 'keep')
    const readSecret = vi.fn(() => NEW)
    expect(
      await replaceVaultSecret(path, { readSecret, rebuildUnreadable: true, home: home(path) }),
    ).toEqual({ ok: false, reason: 'vault-unavailable' })
    expect(readSecret).not.toHaveBeenCalled()
    expect(readFileSync(join(path, 'inside.txt'), 'utf8')).toBe('keep')
  })
})

describe('inspectLocalCustodian', () => {
  it('answers readable, corrupt, io (a directory) and missing', () => {
    const readable = scratchPath()
    createLocalCustodian({ path: readable, factorySecret: OLD }).close()
    expect(inspectLocalCustodian({ path: readable })).toEqual({ kind: 'readable' })
    const corrupt = scratchPath()
    writeFileSync(corrupt, 'nope')
    expect(inspectLocalCustodian({ path: corrupt })).toEqual({
      kind: 'unavailable',
      cause: 'corrupt',
    })
    const directory = scratchPath()
    mkdirSync(directory)
    expect(inspectLocalCustodian({ path: directory })).toEqual({ kind: 'unavailable', cause: 'io' })
    expect(inspectLocalCustodian({ path: scratchPath() })).toEqual({
      kind: 'unavailable',
      cause: 'missing',
    })
  })
})

describe('leftover temporary files of a crashed publish', () => {
  function planted(path: string) {
    const directory = join(path, '..')
    const own = join(directory, 'vault.json.4242.1793779771132.0.tmp')
    const others = [
      join(directory, 'vault.json.bak'),
      join(directory, 'vault.json.x.1.2.tmp'),
      join(directory, 'other.json.4242.1793779771132.0.tmp'),
    ]
    for (const file of [own, ...others]) writeFileSync(file, `{"factorySecret":"${OLD}"}`)
    return { own, others }
  }

  it("a write under the lock removes this vault's temporary files and nothing else", () => {
    const path = scratchPath()
    const store = createLocalCustodian({ path, factorySecret: OLD })
    const { own, others } = planted(path)
    store.replaceFactorySecret(NEW)
    store.close()
    expect(existsSync(own)).toBe(false)
    for (const other of others) expect(existsSync(other), other).toBe(true)
  })

  it('inspection under the lock removes them too', () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const { own, others } = planted(path)
    expect(inspectLocalCustodian({ path })).toEqual({ kind: 'readable' })
    expect(existsSync(own)).toBe(false)
    for (const other of others) expect(existsSync(other), other).toBe(true)
  })

  it('negative control: a plain open (no lock) leaves them', () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const { own } = planted(path)
    const opened = openLocalCustodian({ path })
    if (opened.kind === 'open') opened.custodian.close()
    expect(existsSync(own)).toBe(true)
  })
})

describe('LocalCredentialPlugin without a factory secret in its configuration', () => {
  it('serves the vault that is on the path', async () => {
    const path = scratchPath()
    createLocalCustodian({ path, factorySecret: OLD }).close()
    const ctx = new Context()
    const fiber = await ctx.plugin(LocalCredentialPlugin, { path })
    expect(ctx.modelCredential?.resolve(unbound(), SEND)).toMatchObject({
      kind: 'value',
      value: OLD,
    })
    // A replacement while the plugin runs is visible on the next resolution.
    expect(await replaceVaultSecret(path, { readSecret: () => NEW })).toEqual({
      ok: true,
      path,
      rebuilt: false,
    })
    expect(ctx.modelCredential?.resolve(unbound(), SEND)).toMatchObject({
      kind: 'value',
      value: NEW,
    })
    await fiber.dispose()
  })

  it('answers unavailable and builds nothing when the path holds no vault', async () => {
    const path = scratchPath()
    const ctx = new Context()
    const fiber = await ctx.plugin(LocalCredentialPlugin, { path })
    expect(ctx.modelCredential?.resolve(unbound(), SEND)).toEqual({ kind: 'unavailable' })
    expect(existsSync(path)).toBe(false)
    await fiber.dispose()
  })

  it('negative control: with a factory secret the plugin builds the vault', async () => {
    const path = scratchPath()
    const ctx = new Context()
    const fiber = await ctx.plugin(LocalCredentialPlugin, { path, factorySecret: OLD })
    expect(existsSync(path)).toBe(true)
    expect(ctx.modelCredential?.resolve(unbound(), SEND)).toMatchObject({ value: OLD })
    await fiber.dispose()
  })
})
