import { expect, it } from 'vitest'
import { Service } from '@deepseek-ai/cordis'
import * as entry from '@omne-harness/media-cordis-contract/cordis'

const services = [
  [entry.MediaService, entry.mediaKey, 'media'],
  [entry.MediaStoresService, entry.mediaStoresKey, 'mediaStores'],
  [entry.MediaIndexService, entry.mediaIndexKey, 'mediaIndex'],
  [entry.MediaImageService, entry.mediaImageKey, 'mediaImage'],
] as const

it('gives the custody, the store registry and each port one service identity', () => {
  for (const [service, key, name] of services) {
    expect(key).toBe(name)
    expect(service.provide).toBe(key)
    expect(service.prototype).toBeInstanceOf(Service)
  }
  expect(new Set(services.map(([, key]) => key)).size).toBe(services.length)
  expect(Object.keys(entry)).toHaveLength(services.length * 2)
})
