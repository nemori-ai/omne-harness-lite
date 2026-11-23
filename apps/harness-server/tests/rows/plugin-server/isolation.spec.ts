import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { pluginParent } from '../../../src/rows/plugin-server/index.ts'
import { trustedScopes } from '../../../src/s0/rows.ts'
import { createTrust } from '../../../src/trust.ts'
import type { RowId } from '../../../src/types.ts'

const visibility = new Map(trustedScopes.map(({ row, names }) => [row, names]))
const TRUSTED = [...new Set(trustedScopes.flatMap(({ names }) => names))].sort()

/** A root where every trusted name of the release is provided, each in its own scope, as the release does. */
function released() {
  const trust = createTrust(
    TRUSTED.map(name => ({ id: name, names: [name] })),
    visibility,
  )
  const root = new Context()
  for (const name of TRUSTED) trust.contextForName(root, name).provide(name, { name })
  return trust.contextForRow(root, 'plugin-server' as RowId)
}

const resolved = (ctx: Context): readonly string[] =>
  TRUSTED.filter(name => ctx.get(name) !== undefined)

describe('where the fibers of plugins grow on the server', () => {
  it('the release lists storage, the issuer, the custody of secrets and the domain lookup as trusted', () => {
    expect(TRUSTED).toEqual(
      expect.arrayContaining([
        'storage',
        'principalIssuer',
        'settingsSecretCustody',
        'tenantDomainLookup',
      ]),
    )
  })

  it('the row sees one trusted name, to list the tenants; where plugins grow, none resolves', async () => {
    const row = released()
    expect(resolved(row)).toEqual(['tenantDomainScannerPrincipal'])
    const parent = pluginParent(row)
    expect(resolved(parent)).toEqual([])
    const seen: string[][] = []
    const fiber = parent.plugin({
      name: 'plugin:tidy@v1',
      apply: (inner: Context) => void seen.push([...resolved(inner)]),
    })
    await fiber.await()
    expect(seen).toEqual([[]])
    await fiber.dispose()
  })
})
