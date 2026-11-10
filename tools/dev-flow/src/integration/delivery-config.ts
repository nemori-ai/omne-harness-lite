import { InputError, record, text } from '../shared/input.ts'

export const DELIVERY_CONFIG_PATH = 'docs/engineering/github-delivery.json'

export type DeliveryConfig = { schemaVersion: 3; kind: 'github-delivery-config'; repository: string }

/** Parses the delivery configuration: the GitHub repository that `gate-cli` reads runs from. */
export function parseConfig(value: unknown): DeliveryConfig {
  const v = record(value, 'config')
  if (v.schemaVersion !== 3) throw new InputError('config.schemaVersion must be 3')
  if (v.kind !== 'github-delivery-config')
    throw new InputError('config.kind must be github-delivery-config')
  const repository = text(v.repository, 'config.repository')
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(repository) ||
    ['.', '..'].includes(repository.split('/')[1] ?? '')
  )
    throw new InputError('config.repository must be a GitHub owner/name without traversal segments')
  return { schemaVersion: 3, kind: 'github-delivery-config', repository }
}
