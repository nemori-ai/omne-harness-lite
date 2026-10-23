import type { DeliveryLines } from '../../src/delivery/lines.ts'
import { parsePolicy } from '../../src/integration/policy.ts'
import { policyDocument, trackEntry } from './integration.ts'

const base = 'a'.repeat(40)
/** A registry with the integration track, one line track and two tracks a line must not use. */
export const registry = parsePolicy(
  policyDocument(base, 'origin', [
    trackEntry('legacy-refactor', base),
    trackEntry('model', base, 'legacy-refactor'),
    trackEntry('old', base, 'legacy-refactor', 'retired'),
    trackEntry('side', base),
  ]),
)
/** A valid line table over the fixture members; `patch` edits a fresh copy. */
export function table(patch: (lines: DeliveryLines) => void = () => {}): DeliveryLines {
  const lines: DeliveryLines = {
    schemaVersion: 1,
    integration: { track: 'legacy-refactor', paths: ['apps', 'docs/architecture'] },
    shared: ['pnpm-lock.yaml'],
    lines: [
      {
        id: 'model',
        title: '模型调用',
        owner: 'model-owner',
        track: 'model',
        paths: ['packages/model'],
        contracts: ['packages/model/model-contract'],
      },
      {
        id: 'session-agent',
        title: '会话推进',
        owner: 'session-owner',
        track: null,
        paths: ['packages/session'],
        contracts: [],
      },
      {
        id: 'engineering-toolchain',
        title: '工程工具链',
        owner: 'tool-owner',
        track: null,
        paths: ['tools', 'pnpm-lock.yaml'],
        contracts: [],
      },
    ],
  }
  patch(lines)
  return lines
}
