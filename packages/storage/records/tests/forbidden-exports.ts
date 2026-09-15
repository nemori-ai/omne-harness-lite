// @ts-expect-error DomainLock remains internal to the JSONL provider
import type { DomainLock } from '../dist/index.js'
// @ts-expect-error createJsonlProvider is implemented and exported by @omne-harness-lite/jsonl
import { createJsonlProvider } from '../dist/index.js'

void (undefined as DomainLock | undefined)
void createJsonlProvider
