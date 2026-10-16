// The identity of the named default result policy (G3, P14).
import { describedAdoption } from './adoption.ts'
import type { Adoption } from './identity.ts'

/**
 * The rule set of the default result policy. The policy accepts only text blocks and shared
 * reference blocks (`ToolMessageContentBlock`). It rejects thinking blocks, inline media, inline
 * files, nested containers and unknown kinds. A change to these rules needs a new revision.
 */
export const defaultResultPolicyRules = Object.freeze({
  owner: '@omne-harness/tool',
  name: 'default-result-policy',
  revision: '1',
  accept: Object.freeze(['text', 'voice-reference', 'image-reference', 'file-reference'] as const),
  reject: Object.freeze([
    'thinking',
    'inline-media',
    'inline-file',
    'nested-container',
    'unknown-kind',
  ] as const),
})

/**
 * The adoption of the default result policy. `digest` is `sha256:` and the hexadecimal SHA-256
 * of the JSON text of `defaultResultPolicyRules`, so a reader can recompute it.
 */
export const defaultResultPolicyAdoption: Adoption = describedAdoption(defaultResultPolicyRules)
