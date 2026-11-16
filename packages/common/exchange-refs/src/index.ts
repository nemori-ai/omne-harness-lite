export type Adoption = Readonly<{
  owner: string
  name: string
  revision: string
  digest: string
}>

export type DurableEvidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

export type ConsumerRef = Readonly<{
  owner: string
  work: string
  position: string
  purpose: string
}>
