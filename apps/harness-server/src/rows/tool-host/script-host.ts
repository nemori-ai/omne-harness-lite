import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import type { ScriptHost } from '@omne-harness/tool-definitions'
import { candidateOfRevision } from '../tenant-assets/layers.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { ownLayer } from './held-tools.ts'

/** What the operator gave Shell: a script tool runs in the same place, with the same environment and bound. */
export type ScriptSetting = Readonly<{
  env: Readonly<Record<string, string>>
  resultMaxBytes: number
}>

const settings = new WeakMap<Context, ScriptSetting>()
const FALLBACK: ScriptSetting = Object.freeze({ env: Object.freeze({}), resultMaxBytes: 65_536 })

export function setScriptSetting(ctx: Context, setting: ScriptSetting): void {
  settings.set(ctx.root, Object.freeze(setting))
}

const unplaced = (reason: string) => fail({ reason })

function runnable(path: string): boolean {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Where a program lies, searched as a shell with this environment would: the facility starts absolute paths only. */
export function programIn(env: Readonly<Record<string, string>>, name: string): string | undefined {
  if (isAbsolute(name)) return name
  if (/[\\/]/u.test(name)) return undefined
  const suffixes = process.platform === 'win32' ? (env['PATHEXT'] ?? '.EXE;.CMD').split(';') : ['']
  const directories = (env['PATH'] ?? env['Path'] ?? '').split(delimiter).filter(isAbsolute)
  for (const directory of directories)
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`)
      if (runnable(candidate)) return candidate
    }
  return undefined
}

/** Where the files of a tool a tenant holds lie on this machine, for one call of that tool. */
export function heldScriptHost(ctx: Context, tenant: TenantId, key: ToolBindingKey): ScriptHost {
  return {
    async place() {
      const { layer, asset } = key
      // The layer comes from the record of the call; the files are read as the tenant the call is made for.
      const encoded = ownLayer(layer, tenant) ? tenantCodec.encode(tenant) : undefined
      const service = ctx.get(tenantAssetsKey)
      if (encoded === undefined || !encoded.ok || service === undefined)
        return unplaced('the assets of the tenant that holds the tool are not there')
      const assets = await service.open(encoded.value)
      if (assets === undefined) return unplaced('the assets of the tenant cannot be opened')
      const held = candidateOfRevision(asset.adoption.revision, asset.adoption.digest)
      const located = await assets.packages.locate({ assetRef: held.asset, version: held.version })
      if (located.kind !== 'local-directory')
        return unplaced(
          located.kind === 'absent'
            ? 'the files of the tool are not on this machine'
            : 'the files of the tool cannot be located now',
        )
      const { env, resultMaxBytes } = settings.get(ctx.root) ?? FALLBACK
      const directory = held.within === undefined ? located.path : join(located.path, held.within)
      return succeed({ directory, env, resultMaxBytes, program: name => programIn(env, name) })
    },
  }
}
