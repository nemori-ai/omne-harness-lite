import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { empty, noChanges, requests, successes } from './rules.ts'

const emptyBody = ruleCodec(empty)

/**
 * `identity/v1`: the identity operations a client may call. Every operation may answer
 * `stage-not-provided`, because a deployment may declare any identity operation unprovided.
 */
export const identityProtocol = defineProtocol({
  name: 'identity',
  major: 1,
  operations: {
    'register-and-activate': {
      identity: 'none',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['register-and-activate']),
      outcomes: {
        succeeded: ruleCodec(successes['register-and-activate']),
        'not-loginable': emptyBody,
        'stage-not-provided': true,
      },
    },
    'issue-login': {
      identity: 'none',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['issue-login']),
      outcomes: {
        succeeded: ruleCodec(successes['issue-login']),
        'uniform-auth-failure': true,
        'stage-not-provided': true,
      },
      carriesCredential: true,
    },
    'revoke-login': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['revoke-login']),
      outcomes: {
        succeeded: ruleCodec(successes['revoke-login']),
        'no-change': ruleCodec(noChanges['revoke-login']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'query-current-tenant': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-current-tenant']),
      outcomes: {
        succeeded: ruleCodec(successes['query-current-tenant']),
        'stage-not-provided': true,
      },
    },
    'query-own-memberships': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-own-memberships']),
      outcomes: {
        succeeded: ruleCodec(successes['query-own-memberships']),
        'stage-not-provided': true,
      },
    },
    'switch-current-tenant': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['switch-current-tenant']),
      outcomes: {
        succeeded: ruleCodec(successes['switch-current-tenant']),
        'no-change': ruleCodec(noChanges['switch-current-tenant']),
        'stage-not-provided': true,
      },
    },
  },
  observations: {},
})

export type IdentityProtocol = typeof identityProtocol
