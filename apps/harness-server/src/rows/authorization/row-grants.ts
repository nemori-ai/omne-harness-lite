import type { Context } from '@deepseek-ai/cordis'
import type { GrantHolder } from './grants.ts'

const installations = new WeakMap<Context, Map<GrantHolder, number>>()

function installedOn(ctx: Context): Map<GrantHolder, number> {
  const root = ctx.root
  const found = installations.get(root)
  if (found !== undefined) return found
  const created = new Map<GrantHolder, number>()
  installations.set(root, created)
  return created
}

/** Installs the grant of a holder for as long as the scope of the installing row lives. */
export function installRowGrant(ctx: Context, holder: GrantHolder): void {
  const installed = installedOn(ctx)
  ctx.effect(() => {
    installed.set(holder, (installed.get(holder) ?? 0) + 1)
    return () => {
      installed.set(holder, (installed.get(holder) ?? 1) - 1)
    }
  }, `authorization.grant.${holder}`)
}

export function rowGrantInstalled(ctx: Context, holder: GrantHolder): boolean {
  return (installedOn(ctx).get(holder) ?? 0) > 0
}
