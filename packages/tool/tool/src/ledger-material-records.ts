import type {
  Adoption,
  DurableEvidence,
  ToolOperationId,
  ToolResultVersion,
  ToolDeliveryId,
} from '@omne-harness/tool-contract'
import type {
  ToolMaterialFingerprint,
  ToolMaterialInstant,
  ToolMaterialRef,
  ToolMaterialSeal,
} from '@omne-harness/tool-contract/provider'

export type MaterialTimeRecord = Readonly<{ highWatermark: ToolMaterialInstant }>

export type MaterialRecord = Readonly<{
  purpose: 'raw' | 'final' | 'result'
  material: ToolMaterialRef
  writeOperation: ToolOperationId
  input: ToolMaterialFingerprint
  codec: Adoption
  state:
    | Readonly<{ kind: 'preparing' }>
    | Readonly<{ kind: 'sealed'; seal: ToolMaterialSeal }>
    | Readonly<{ kind: 'deleting'; operation: ToolOperationId; fence: DurableEvidence }>
    | Readonly<{ kind: 'deleted'; operation: ToolOperationId; receipt: DurableEvidence }>
}>

export type MaterialUseRecord = Readonly<{
  id: string
  material: ToolMaterialRef
  basis: DurableEvidence
}> &
  (
    | Readonly<{ kind: 'preparation'; operation: ToolOperationId }>
    | Readonly<{
        kind: 'delivery'
        result: ToolResultVersion
        delivery: ToolDeliveryId
        writeOperation: ToolOperationId
      }>
  )

export type MaterialCleanupRecord = Readonly<{
  material: ToolMaterialRef
  writeOperation: ToolOperationId
  basis: DurableEvidence
}>
