import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { type ProviderAcquireInput } from '@omne-harness/execution-environment-contract'
import {
  environmentProviderConformance,
  executionEnvironmentConformance,
  createScriptedRecoveryAuthority,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'
import { createEnvironmentRegistry } from '@omne-harness/execution-environment'
import {
  hostObjectToken,
  createHostFilesProvider,
} from '@omne-harness/execution-environment-host-local'
function tenant(account: string) {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture')
  return parsed.value
}
const access = { principal: 'suite', tenant: tenant('acc_0123456789abcdefghjkmnpqrs') }
const otherAccess = { principal: 'other', tenant: tenant('acc_0123456789abcdefghjkmnpqrt') }
function scope(): ProviderAcquireInput['scope'] {
  const ref = 'suite-scope'
  function valid(text: string): text is ProviderAcquireInput['scope']['ref'] {
    return text.length > 0
  }
  if (!valid(ref)) throw new Error('scope fixture')
  return { ref }
}
for (const test of executionEnvironmentConformance({
  subject() {
    const environment = createEnvironmentRegistry<string>({
      recovery: createScriptedRecoveryAuthority(),
    })
    return {
      environment,
      access,
      otherAccess,
      scope: scope(),
      hooks: {
        close: async () => {
          await environment.close()
        },
      },
      dispose: async () => {
        await environment.close()
      },
    }
  },
}))
  it(test.name, async () => {
    expect(await runConformanceCase(test)).toMatchObject({ status: 'pass' })
  })
for (const test of environmentProviderConformance({
  subject() {
    const provider = createHostFilesProvider()
    let root: string | undefined
    return {
      provider,
      binding: { kind: 'host_machine' },
      facility: 'files',
      scope: scope(),
      tenant: access.tenant,
      hooks: {
        async prepareHeldOperation({ lease, input }) {
          const files = lease.facility('files')
          if (!files) throw new Error('no files facility')
          root = await realpath(await mkdtemp(join(tmpdir(), 'omne-ee-retirement-suite-')))
          const path = join(root, 'held-file.txt')
          await writeFile(path, 'before-retirement')
          const named = await hostObjectToken(path)
          return {
            run: () =>
              files.write({
                requestId: 'late-public-suite',
                origin: input.origin,
                access: { principal: 'suite', tenant: input.tenant },
                binding: input.placement.binding,
                path,
                named,
                mode: 'replace',
                bytes: new TextEncoder().encode('should-not-be-written'),
              }),
            effectSnapshot: () => readFile(path, 'utf8'),
          }
        },
      },
      dispose: async () => {
        try {
          await provider.retire()
        } finally {
          if (root) await rm(root, { recursive: true, force: true })
        }
      },
    }
  },
}))
  it('host-local ' + test.name, async () => {
    const verdict = await runConformanceCase(test)
    if (test.name === 'V-EE18.retire-waits-for-in-flight')
      expect(verdict.status).toBe('not-applicable')
    else expect(verdict.status).toBe('pass')
  })

// These broken providers/registries are deliberately denied by the public cases, not by private checks.
for (const fault of ['self-signed', 'retirement', 'repeat', 'declaration', 'scope'] as const)
  it('suite denies ' + fault, async () => {
    const cases = executionEnvironmentConformance({
      subject() {
        const registry = createEnvironmentRegistry<string>({
          recovery: createScriptedRecoveryAuthority(),
        })
        const environment = new Proxy(registry, {
          get(target, key, receiver) {
            if (fault === 'self-signed' && key === 'acquire')
              return async (...args: Parameters<typeof registry.acquire>) => {
                const result = await registry.acquire(...args)
                return result.kind === 'acquired'
                  ? {
                      ...result,
                      adoption: {
                        ...result.adoption,
                        provider: { ...result.adoption.provider, version: 'forged' },
                      },
                    }
                  : result
              }
            if (fault === 'repeat' && key === 'acquire')
              return async (...args: Parameters<typeof registry.acquire>) => {
                const result = await registry.acquire(...args)
                return result.kind === 'acquired'
                  ? { ...result, lease: new Proxy(result.lease, {}) }
                  : result
              }
            if (fault === 'retirement' && key === 'registerProvider')
              return (...args: Parameters<typeof registry.registerProvider>) => {
                registry.registerProvider(...args)
                return async () => undefined
              }
            if (fault === 'declaration' && key === 'registerFacility')
              return (...args: Parameters<typeof registry.registerFacility>) => {
                try {
                  return registry.registerFacility(...args)
                } catch {
                  return async () => undefined
                }
              }
            if (fault === 'scope' && key === 'describe')
              return (...args: Parameters<typeof registry.describe>) =>
                registry.describe(args[0], scope())
            return Reflect.get(target, key, receiver)
          },
        })
        return {
          environment,
          access,
          otherAccess,
          scope: scope(),
          dispose: async () => {
            await registry.close()
          },
        }
      },
    })
    const names = {
      'self-signed': 'V-EE05.adoption-issued-from-verified-receipt',
      retirement: 'V-EE18.removal-starts-retirement',
      repeat: 'V-EE19.repeat-key-returns-same-acquisition',
      declaration: 'V-EE20.second-declaration-is-refused',
      scope: 'V-EE22.requester-scope-filters-describe',
    }
    const test = cases.find(c => c.name === names[fault])
    if (!test) throw new Error('missing conformance case')
    await expect(runConformanceCase(test)).rejects.toThrow()
  })
