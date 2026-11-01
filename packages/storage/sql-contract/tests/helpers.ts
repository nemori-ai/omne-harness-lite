// Test helpers: a fixture directory per file, a memory double per test, and loose-typed values.
import { afterAll, beforeAll } from 'vitest'
import type { SqlStorage, StorageControl } from '@omne-harness/sql-contract'
import {
  createMemorySqlStorage,
  type MemorySqlStorageLimits,
} from '@omne-harness/sql-contract/testing'
import { createFixtureMaterials, type FixtureMaterials } from '../src/testing/fixtures.ts'
import { registerAll, registerSmall } from '../src/testing/builders.ts'

export * from '../src/testing/builders.ts'

export type Harness = {
  readonly fixture: FixtureMaterials
  readonly storage: SqlStorage
  readonly control: StorageControl
}

export function useFixture(): { fixture(): FixtureMaterials } {
  let fixture: FixtureMaterials | undefined
  beforeAll(async () => {
    fixture = await createFixtureMaterials()
  })
  afterAll(async () => {
    await fixture?.remove()
  })
  return {
    fixture(): FixtureMaterials {
      if (fixture === undefined) throw new Error('fixture is not ready')
      return fixture
    },
  }
}

export async function open(
  fixture: FixtureMaterials,
  limits?: Partial<MemorySqlStorageLimits>,
): Promise<Harness> {
  const { storage, control } = await createMemorySqlStorage({
    materials: fixture.materials,
    ...(limits === undefined ? {} : { limits }),
  })
  return { fixture, storage, control }
}

export const small = (h: Harness): Promise<void> => registerSmall(h.storage, h.fixture)
export const all = (h: Harness): Promise<void> => registerAll(h.storage, h.fixture)

/** A value that is not typed as valid, for the tests of the field rules. */
export function loose<T>(value: unknown): T {
  return value as T
}
