import type { SuperviseConfig } from '@omne-harness/assembly'

/** The keys of the publisher of page bundles that the application ships with. None yet: nothing can be installed. */
const SHIPPED_KEYS: readonly string[] = []

export const PAGE_TRIAL: SuperviseConfig = { fallLimit: 3, backoffBaseMs: 250, backoffMaxMs: 2_000 }

export type PageSettings = Readonly<{
  publisherKeys: readonly string[]
  /** How long one load may take to render something. */
  mountMs: number
  /** How long a rendered page stays up before the version counts as settled. */
  stableMs: number
}>

const RELEASE: PageSettings = { publisherKeys: SHIPPED_KEYS, mountMs: 15_000, stableMs: 10_000 }

/** The release profile reads nothing from the environment; the others take a key and shorter times for their runs. */
export function pageSettings(env: NodeJS.ProcessEnv): PageSettings {
  if (OMNE_BUILD_PROFILE === 'release') return RELEASE
  const ms = (name: string, otherwise: number): number => {
    const given = Number(env[name])
    return Number.isInteger(given) && given > 0 ? given : otherwise
  }
  const key = env['OMNE_PAGE_PUBLISHER_KEY']
  return {
    publisherKeys: key === undefined || key === '' ? SHIPPED_KEYS : [...SHIPPED_KEYS, key],
    mountMs: ms('OMNE_PAGE_MOUNT_MS', RELEASE.mountMs),
    stableMs: ms('OMNE_PAGE_STABLE_MS', RELEASE.stableMs),
  }
}
