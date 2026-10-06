import type { AssemblyManifestService } from '@omne-harness-lite/assembly-manifest'

export interface AssemblyManifestStore extends AssemblyManifestService {
  close(): Promise<void>
}
export interface ManifestDb {
  assembly_manifest_record: {
    session: string
    seq: number
    evaluation_kind: 'given' | 'mint' | 'reuse'
    evaluation_ref: string
    owned_ref: string | null
    content: string
  }
  assembly_manifest_table: {
    session: string
    seq: number
    category: string
    filled_at: number
    composition: string
  }
}
