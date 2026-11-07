import type { Adoption, DurableEvidence, ToolOperationId } from '@omne-harness/tool-contract'
import type {
  ToolMaterialFingerprint,
  ToolMaterialInstant,
  ToolMaterialRef,
  ToolMaterialSeal,
} from '@omne-harness/tool-contract/provider'

export type MaterialTimeRecord = Readonly<{ highWatermark: ToolMaterialInstant }>

export type MaterialRecord = Readonly<{
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
  kind: 'preparation'
  material: ToolMaterialRef
  operation: ToolOperationId
  basis: DurableEvidence
}>
