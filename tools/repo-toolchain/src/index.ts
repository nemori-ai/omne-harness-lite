export type { Rule, SourceFile, Violation } from './core/rule.ts'
export {
  readActualArchitecture,
  actualArchitectureOf,
  compareActualArchitectures,
  readArchitectureSource,
} from './arch/actual.ts'
export type {
  ActualArchitectureInput,
  ActualArchitectureDocument,
  ActualArchitecture,
  ActualArchitectureDifference,
  ObservedFact,
  ObservedImport,
  ObservedUnknown,
  ActualMember,
  SourceCoordinates,
  Fact,
  FactKind,
  Site,
  PackageImport,
  Unknown,
  ImportUnknown,
  ArchitectureSource,
} from './arch/actual.ts'
export { isTestPath, scanLines } from './core/rule.ts'
export { collectSources, runRules } from './core/scan.ts'
