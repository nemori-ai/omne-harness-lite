import type { Scopes } from '@omne-harness/dynamis'

/** A point read for the whole application, not for the tenant who asks: what a tenant put would not be seen. */
export const READ_FOR_ALL: Scopes = Object.freeze({
  only: 'deployment',
  why: 'one-per-process',
  note: 'The application reads this point for everyone at once, not for the tenant who asks, so an item a tenant put here would not be seen.',
})

/** The login gate: nobody is signed in where it shows, so there is no tenant to put an item for. */
export const NO_TENANT: Scopes = Object.freeze({
  only: 'deployment',
  why: 'no-tenant',
  note: 'Nobody is signed in while the gate shows, and a person gives their credential here.',
})

/** What one module lends another, or the connection lends the modules: a plugin cannot grant itself these. */
export const GRANTS_ITSELF: Scopes = Object.freeze({
  only: 'deployment',
  why: 'grants-itself',
  note: 'This is what the application lends its own modules; a plugin cannot put what decides what it may use.',
})

/** What the system says in its own voice, such as what a release card shows: a plugin cannot speak as the system. */
export const SPEAKS_AS_SYSTEM: Scopes = Object.freeze({
  only: 'deployment',
  why: 'speaks-as-system',
  note: 'This draws what the system tells a person before they decide; a plugin cannot draw it in the voice of the system.',
})
