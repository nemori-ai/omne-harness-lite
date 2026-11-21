import { randomBytes } from 'node:crypto'
import { workspaceCodec } from '@omne-harness/legal-identity'
import type { Minting } from '@omne-harness/workspace'
import { instanceId } from '@omne-harness/workspace-contract'

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** Twenty-six symbols of five random bits each. */
const body = (): string => Array.from(randomBytes(26), byte => ALPHABET[byte & 31]).join('')

export function createMinting(): Minting {
  return {
    workspace() {
      const parsed = workspaceCodec.parse(`wsp_${body()}`)
      if (!parsed.ok) throw new Error('a minted workspace identity did not parse')
      return parsed.value
    },
    instance() {
      const minted = instanceId(`wsi_${body()}`)
      if (minted === null) throw new Error('a minted instance identity did not parse')
      return minted
    },
  }
}
