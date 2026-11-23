import { randomUUID } from 'node:crypto'
import { accessSync, constants, existsSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import type { PackageReader } from '@omne-harness/assets'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type Access } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolBindingKey } from '@omne-harness/tool-contract/provider'
import type { ScriptHost } from '@omne-harness/tool-definitions'
import { askerLayersOf } from '../tenant-assets/asker-layers.ts'
import { candidateOfRevision, inWorkspace } from '../tenant-assets/layers.ts'
import { turnOfAccess } from '../tenant-assets/turn.ts'
import { tenantAssetsKey } from '../tenant-assets/service.ts'
import { TOOL_CATEGORY, ownLayer } from './held-tools.ts'

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

const SAFE_SEGMENT = /^[^\\/\0]+$/u

/** The files of one version, copied where a script can run them: each read by its digest, the whole set put in place at once. */
export async function placedFiles(
  reader: PackageReader,
  base: string,
  version: string,
): Promise<string | undefined> {
  const target = join(base, version.replace(/[^0-9A-Za-z]/gu, '_'))
  if (existsSync(target)) return target
  const listed = await reader.manifest()
  if (!('ok' in listed)) return undefined
  const staging = `${target}.${randomUUID()}`
  try {
    for (const entry of listed.ok.entries) {
      const segments = entry.path.split('/')
      if (!segments.every(part => SAFE_SEGMENT.test(part) && part !== '.' && part !== '..'))
        return undefined
      const bytes = await reader.open(entry.path, entry.digest)
      if (!('ok' in bytes)) return undefined
      const file = join(staging, ...segments)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, bytes.ok)
    }
    await mkdir(staging, { recursive: true })
    await rename(staging, target).catch(() => undefined)
    return existsSync(target) ? target : undefined
  } catch {
    return undefined
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Where a version a turn adopted from its workspace is run from: the files as that turn read them, not as they are now. */
async function workspaceDirectory(
  ctx: Context,
  access: Access<unknown>,
  held: Readonly<{ asset: string; version: string }>,
  env: ScriptSetting['env'],
): Promise<string | undefined> {
  const turn = await turnOfAccess(ctx, access)
  if (turn === undefined || turn === null) return undefined
  const layers = await askerLayersOf(ctx, TOOL_CATEGORY)({ tenant: access.tenant, turn })
  if (layers === undefined) return undefined
  const base = join(env['TMPDIR'] ?? tmpdir(), 'omne-workspace-tools')
  return placedFiles(layers.readerOf({ ref: held.asset, digest: held.version }), base, held.version)
}

/** Where the files of a tool lie on this machine, for one call of that tool by this access. */
export function heldScriptHost(
  ctx: Context,
  access: Access<unknown>,
  key: ToolBindingKey,
): ScriptHost {
  const { tenant } = access
  return {
    async place() {
      const { layer, asset } = key
      const { env, resultMaxBytes } = settings.get(ctx.root) ?? FALLBACK
      const placed = (directory: string) =>
        succeed({ directory, env, resultMaxBytes, program: (name: string) => programIn(env, name) })
      const held = candidateOfRevision(asset.adoption.revision, asset.adoption.digest)
      if (ownLayer(layer, tenant) && inWorkspace(held.asset)) {
        const directory = await workspaceDirectory(ctx, access, held, env)
        return directory === undefined
          ? unplaced('the files of the tool cannot be read as this turn adopted them')
          : placed(directory)
      }
      // The layer comes from the record of the call; the files are read as the tenant the call is made for.
      const encoded = ownLayer(layer, tenant) ? tenantCodec.encode(tenant) : undefined
      const service = ctx.get(tenantAssetsKey)
      if (encoded === undefined || !encoded.ok || service === undefined)
        return unplaced('the assets of the tenant that holds the tool are not there')
      const assets = await service.open(encoded.value)
      if (assets === undefined) return unplaced('the assets of the tenant cannot be opened')
      const located = await assets.packages.locate({ assetRef: held.asset, version: held.version })
      if (located.kind !== 'local-directory')
        return unplaced(
          located.kind === 'absent'
            ? 'the files of the tool are not on this machine'
            : 'the files of the tool cannot be located now',
        )
      return placed(held.within === undefined ? located.path : join(located.path, held.within))
    },
  }
}
