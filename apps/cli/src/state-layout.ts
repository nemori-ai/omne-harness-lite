import { createHash } from 'node:crypto'
import { isAbsolute, join, parse, resolve } from 'node:path'
import {
  StateLayoutFailure,
  checkedTenantBinding,
  type HomeInput,
  type TenantBinding,
  type TenantPaths,
} from './state-layout-values.ts'
export {
  StateLayoutFailure,
  type HomeInput,
  type TenantBinding,
  type TenantPaths,
} from './state-layout-values.ts'
import { preparePrivateDirectory, installTenantBinding } from './state-layout-files.ts'

export function resolveStateHome(input: HomeInput): string {
  const selected = input.explicitHome ?? input.environmentHome ?? join(input.osHome, '.omne')
  if (selected.length === 0 || selected.includes('\0') || !isAbsolute(selected))
    throw new StateLayoutFailure('invalid-home')
  const home = resolve(selected)
  if (home === parse(home).root) throw new StateLayoutFailure('invalid-home')
  return home
}

export function tenantPaths(home: string, binding: TenantBinding): TenantPaths {
  const root = resolveStateHome({ explicitHome: home, osHome: home })
  const identity = checkedTenantBinding(binding)
  const key = createHash('sha256')
    .update(
      JSON.stringify([identity.centerId, identity.tenant.organization, identity.tenant.account]),
    )
    .digest('hex')
  const directory = join(root, 'tenants', key)
  return {
    home: root,
    directory,
    binding: join(directory, 'tenant.json'),
    auth: join(directory, 'auth'),
    clientState: join(directory, 'auth', 'client.sqlite'),
    credentials: join(directory, 'auth', 'credentials'),
    data: join(directory, 'data'),
    runtime: join(directory, 'data', 'runtime.sqlite'),
    sessions: join(directory, 'sessions'),
    assets: join(directory, 'assets'),
    logs: join(directory, 'logs'),
    cache: join(directory, 'cache'),
    run: join(directory, 'run'),
  }
}

export interface StateLayoutPolicy {
  readonly maxBindingBytes: number
}
export const defaultStateLayoutPolicy: StateLayoutPolicy = Object.freeze({
  maxBindingBytes: 64 * 1024,
})

export async function prepareTenantDirectory(
  home: string,
  binding: TenantBinding,
  policy: StateLayoutPolicy = defaultStateLayoutPolicy,
): Promise<TenantPaths> {
  const identity = checkedTenantBinding(binding)
  const paths = tenantPaths(home, identity)
  const bytes = Buffer.from(JSON.stringify(identity) + '\n')
  if (
    !Number.isSafeInteger(policy.maxBindingBytes) ||
    policy.maxBindingBytes < 1 ||
    bytes.length > policy.maxBindingBytes
  )
    throw new StateLayoutFailure('invalid-binding')
  await prepareStateDirectory(paths.home, paths.directory)
  await installTenantBinding(paths.binding, bytes, policy.maxBindingBytes)
  return paths
}

/** Create a private namespace inside the checked application home. */
export async function prepareStateDirectory(home: string, directory: string = home): Promise<void> {
  const root = resolveStateHome({ explicitHome: home, osHome: home })
  const target = resolve(directory)
  if (target !== root && !target.startsWith(root + '/')) throw new StateLayoutFailure('unsafe-path')
  let at = parse(root).root
  await preparePrivateDirectory(at, false, false)
  for (const part of target.slice(at.length).split('/')) {
    at = join(at, part)
    const privateRequired = at === root || at.startsWith(root + '/')
    await preparePrivateDirectory(at, true, privateRequired)
  }
}
