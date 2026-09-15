/** Static public attribution rendering selected from dsh-llm. */

import { createRequire } from 'node:module'

const { version } = createRequire(import.meta.url)('../package.json') as { version: string }

export interface AppIdentity {
  product: string
  version: string
  url: string
}

/** Baseline identity names this fork and links to the fixed upstream source repository. */
export const APP_IDENTITY: AppIdentity = {
  product: 'omne-harness-lite-llm',
  version,
  url: 'https://github.com/deepseek-ai/deepseek-harness',
}

export function userAgent(identity: AppIdentity = APP_IDENTITY): string {
  return `${identity.product}/${identity.version} (+${identity.url})`
}

export function attributionHeaders(identity: AppIdentity = APP_IDENTITY): Record<string, string> {
  return { 'user-agent': userAgent(identity) }
}
