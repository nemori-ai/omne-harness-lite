export interface Row {
  singleton: number
  format_version: number
  store_id: string
  revision: number
  operation_id: string | null
  value_json: string
}
export type PhysicalReading =
  { kind: 'invalid-layout'; emptyCatalog: boolean } | { kind: 'rows'; rows: readonly Row[] }
export interface StateRead {
  inspect(): Promise<PhysicalReading>
}
export interface StateWrite extends StateRead {
  replace(row: Row): Promise<void>
}
export interface StatePersistence {
  read<T>(work: (records: StateRead) => Promise<T>): Promise<T>
  atomic<T>(work: (records: StateWrite) => Promise<T>): Promise<T>
  close(): Promise<void>
}
