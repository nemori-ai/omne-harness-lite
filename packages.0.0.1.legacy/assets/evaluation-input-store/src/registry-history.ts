import type { RegistryHistoryDependencies } from './registry-history-reader.ts'
import { createRegistryHistoryReaderWithUnit } from './registry-history-reader.ts'
import { createCurrentRegistryReadUnit } from './registry-read-unit.ts'
export type {
  RegistryHistoryDependencies,
  RegistryHistoryReader,
} from './registry-history-reader.ts'

export function createRegistryHistoryReader(dependencies: RegistryHistoryDependencies) {
  return createRegistryHistoryReaderWithUnit(
    dependencies,
    createCurrentRegistryReadUnit(dependencies),
  )
}
