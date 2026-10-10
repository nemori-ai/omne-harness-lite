import type { InputSourceDependencies } from './types.ts'
import { createRegistryInputReaderWithUnit } from './registry-input-reader.ts'
import { createCurrentRegistryReadUnit } from './registry-read-unit.ts'
export type { RegistryInputReader } from './registry-input-reader.ts'

export function createRegistryInputReader(dependencies: InputSourceDependencies) {
  return createRegistryInputReaderWithUnit(
    dependencies,
    createCurrentRegistryReadUnit(dependencies),
  )
}
