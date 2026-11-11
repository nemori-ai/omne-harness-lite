// The `./web` entry: the single-machine provider of the Web author's `WebAccess` port (Exa search
// and local fetch). It does not import Cordis; the application attaches the access per call.
export { createWebAccess } from './web/access.ts'
export type { ExaKeySource, WebAccessOptions } from './web/access.ts'
export type { WebSearchOptions } from './web/exa.ts'
export type { WebFetchOptions } from './web/fetch.ts'
