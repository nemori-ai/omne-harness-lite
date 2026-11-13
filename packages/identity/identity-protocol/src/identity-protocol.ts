import { defineProtocol, ruleCodec } from '@omne-harness/public-contract'
import { empty, needDecision, noChanges, requests, successes } from './rules.ts'

const emptyBody = ruleCodec(empty)

/**
 * `identity/v1`: the identity operations a client may call. Every operation may answer
 * `stage-not-provided`, because a deployment may declare any identity operation unprovided.
 * An operation needs no login (`none`), a login (`login`), or a login acting for a tenant
 * (`acting-tenant`); a `query-*` operation and `judge-admission` read, the others commit.
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
    'replace-credential': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['replace-credential']),
      outcomes: {
        succeeded: ruleCodec(successes['replace-credential']),
        'stage-not-provided': true,
      },
    },
    'query-own-valid-logins': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-own-valid-logins']),
      outcomes: {
        succeeded: ruleCodec(successes['query-own-valid-logins']),
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
    'query-received-invitations': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-received-invitations']),
      outcomes: {
        succeeded: ruleCodec(successes['query-received-invitations']),
        'stage-not-provided': true,
      },
    },
    // A read whose result may stay unknown: it reads back an earlier create call.
    'query-create-organization': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-create-organization']),
      outcomes: {
        succeeded: ruleCodec(successes['query-create-organization']),
        conflict: emptyBody,
        unknown: true,
        'stage-not-provided': true,
      },
    },
    'issue-member-invitation': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['issue-member-invitation']),
      outcomes: {
        succeeded: ruleCodec(successes['issue-member-invitation']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'open-affiliation-request': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['open-affiliation-request']),
      outcomes: {
        succeeded: ruleCodec(successes['open-affiliation-request']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'query-organization-members': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-organization-members']),
      outcomes: {
        succeeded: ruleCodec(successes['query-organization-members']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'accept-member-invitation': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['accept-member-invitation']),
      outcomes: {
        succeeded: ruleCodec(successes['accept-member-invitation']),
        'no-change': ruleCodec(noChanges['accept-member-invitation']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'reject-member-invitation': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['reject-member-invitation']),
      outcomes: {
        succeeded: ruleCodec(successes['reject-member-invitation']),
        'no-change': ruleCodec(noChanges['reject-member-invitation']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'withdraw-member-invitation': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['withdraw-member-invitation']),
      outcomes: {
        succeeded: ruleCodec(successes['withdraw-member-invitation']),
        'no-change': ruleCodec(noChanges['withdraw-member-invitation']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'query-invitation': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-invitation']),
      outcomes: {
        succeeded: ruleCodec(successes['query-invitation']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'create-organization': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['create-organization']),
      outcomes: {
        succeeded: ruleCodec(successes['create-organization']),
        conflict: emptyBody,
        'stage-not-provided': true,
      },
    },
    'leave-organization': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['leave-organization']),
      outcomes: {
        succeeded: ruleCodec(successes['leave-organization']),
        'stage-not-provided': true,
      },
    },
    'remove-member': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['remove-member']),
      outcomes: {
        succeeded: ruleCodec(successes['remove-member']),
        'not-visible': emptyBody,
        conflict: emptyBody,
        'stage-not-provided': true,
      },
    },
    'change-member-role': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['change-member-role']),
      outcomes: {
        succeeded: ruleCodec(successes['change-member-role']),
        'not-visible': emptyBody,
        conflict: emptyBody,
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
    'query-organization': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-organization']),
      outcomes: {
        succeeded: ruleCodec(successes['query-organization']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'query-issued-invitations': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-issued-invitations']),
      outcomes: {
        succeeded: ruleCodec(successes['query-issued-invitations']),
        'stage-not-provided': true,
      },
    },
    'accept-affiliation-request': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['accept-affiliation-request']),
      outcomes: {
        succeeded: ruleCodec(successes['accept-affiliation-request']),
        'no-change': ruleCodec(noChanges['accept-affiliation-request']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'reject-affiliation-request': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['reject-affiliation-request']),
      outcomes: {
        succeeded: ruleCodec(successes['reject-affiliation-request']),
        'no-change': ruleCodec(noChanges['reject-affiliation-request']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'withdraw-affiliation-request': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['withdraw-affiliation-request']),
      outcomes: {
        succeeded: ruleCodec(successes['withdraw-affiliation-request']),
        'no-change': ruleCodec(noChanges['withdraw-affiliation-request']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'release-affiliation': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['release-affiliation']),
      outcomes: {
        succeeded: ruleCodec(successes['release-affiliation']),
        'no-change': ruleCodec(noChanges['release-affiliation']),
        'not-visible': emptyBody,
        conflict: emptyBody,
        'stage-not-provided': true,
      },
    },
    'query-received-affiliation-requests': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-received-affiliation-requests']),
      outcomes: {
        succeeded: ruleCodec(successes['query-received-affiliation-requests']),
        'stage-not-provided': true,
      },
    },
    'query-issued-affiliation-requests': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-issued-affiliation-requests']),
      outcomes: {
        succeeded: ruleCodec(successes['query-issued-affiliation-requests']),
        'stage-not-provided': true,
      },
    },
    'query-affiliation-request': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['query-affiliation-request']),
      outcomes: {
        succeeded: ruleCodec(successes['query-affiliation-request']),
        'not-visible': emptyBody,
        'stage-not-provided': true,
      },
    },
    'judge-admission': {
      identity: 'acting-tenant',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(requests['judge-admission']),
      outcomes: {
        succeeded: ruleCodec(successes['judge-admission']),
        'not-visible': emptyBody,
        'need-decision': ruleCodec(needDecision),
        'stage-not-provided': true,
      },
    },
    'submit-authorization-expression': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['submit-authorization-expression']),
      outcomes: {
        succeeded: ruleCodec(successes['submit-authorization-expression']),
        'no-change': ruleCodec(noChanges['submit-authorization-expression']),
        'stage-not-provided': true,
      },
    },
    'withdraw-authorization-expression': {
      identity: 'acting-tenant',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(requests['withdraw-authorization-expression']),
      outcomes: {
        succeeded: ruleCodec(successes['withdraw-authorization-expression']),
        'stage-not-provided': true,
      },
    },
  },
  observations: {},
})

export type IdentityProtocol = typeof identityProtocol
