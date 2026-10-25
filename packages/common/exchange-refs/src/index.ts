// Three plain values that cross domain boundaries as data. Each one has a single definition here,
// and the contract members re-export it. Meaning and the rules that stay with each domain are in
// SPEC.md. This module has types only: it exports no runtime value.

/**
 * A reference to one exact adoption that a consumer can recover. `digest` checks that the content
 * is the same. Its encoding and algorithm belong to the party that mints the value and to the
 * judgment of the domain that receives it. A digest does not prove eligibility.
 */
export type Adoption = Readonly<{
  owner: string
  name: string
  revision: string
  digest: string
}>

/**
 * The locator of one durable record of one owner. `owner` names who interprets and checks the
 * record. `digest` only checks that the content is the same. The algorithm belongs to that owner.
 */
export type DurableEvidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>

/**
 * A stable position that a consumer owner registered. The producer keeps it as given and does not
 * interpret it. It is not a permission to execute. `purpose` is free text with no closed set.
 */
export type ConsumerRef = Readonly<{
  owner: string
  work: string
  position: string
  purpose: string
}>
