# @omne-harness/schedule-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `ScheduleProtocol` · `schedule-protocol.d.ts`
- `scheduleProtocol` · `schedule-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { scheduleProtocol, type ScheduleProtocol } from './schedule-protocol.ts';
```

## 声明文件 `schedule-protocol.d.ts`

```ts
export declare const scheduleProtocol: {
    readonly operations: {
        readonly 'list-schedules': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly author: {
                            readonly kind: "human";
                        } | {
                            readonly kind: "agent";
                            readonly session: string;
                        } | {
                            readonly kind: "system";
                        };
                        readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                        readonly label: string | null;
                        readonly next: {
                            readonly at: import("@omne-harness/utc-instant").Instant;
                            readonly calendar: string | null;
                            readonly local: string;
                            readonly version: string | null;
                        } | null;
                        readonly revision: number;
                        readonly schedule: string;
                        readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                    }[];
                    readonly next: string | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded" | null;
                readonly cursor: string | null;
                readonly limit: number;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly terminal: boolean;
            }>;
        };
        readonly 'read-schedule': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly author: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                    readonly createdAt: import("@omne-harness/utc-instant").Instant;
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly label: string | null;
                    readonly next: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    } | null;
                    readonly revision: number;
                    readonly schedule: string;
                    readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly schedule: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-revisions': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly action: string;
                        readonly actor: "agent" | "human" | "system";
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly revision: number;
                    }[];
                    readonly next: string | null;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: string | null;
                readonly limit: number;
                readonly schedule: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'read-agenda': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly items: readonly {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly kind: "history" | "prediction";
                        readonly local: string;
                        readonly schedule: string;
                    }[];
                    readonly next: string | null;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: string | null;
                readonly from: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
                readonly timezone: string;
                readonly to: string;
            }>;
        };
        readonly preview: {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly complete: boolean;
                    readonly upcoming: readonly {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    }[];
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly count: number;
                readonly source: {
                    readonly kind: "schedule";
                    readonly schedule: string;
                } | {
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "definition";
                };
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'create-schedule': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly author: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                    readonly createdAt: import("@omne-harness/utc-instant").Instant;
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly label: string | null;
                    readonly next: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    } | null;
                    readonly revision: number;
                    readonly schedule: string;
                    readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly createId: string;
                readonly definition: import("@omne-harness/json-text").JsonValue;
                readonly reason: string | null;
                readonly state: "active" | "draft";
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-create-schedule': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly author: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                    readonly createdAt: import("@omne-harness/utc-instant").Instant;
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly label: string | null;
                    readonly next: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    } | null;
                    readonly revision: number;
                    readonly schedule: string;
                    readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly createId: string;
                readonly definition: import("@omne-harness/json-text").JsonValue;
                readonly reason: string | null;
                readonly state: "active" | "draft";
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'manage-schedule': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly author: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                    readonly createdAt: import("@omne-harness/utc-instant").Instant;
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly label: string | null;
                    readonly next: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    } | null;
                    readonly revision: number;
                    readonly schedule: string;
                    readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly unsupported: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly conflict: import("@omne-harness/public-contract").Codec<{
                    readonly code: string;
                }>;
                readonly limited: import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
                readonly unknown: true;
            };
            readonly identity: 'login';
            readonly effect: 'commit';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly action: {
                    readonly kind: "rename";
                    readonly label: string;
                } | {
                    readonly instruction: string;
                    readonly kind: "edit";
                } | {
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "replace" | "revise";
                    readonly reason: string;
                } | {
                    readonly kind: "discard" | "pause" | "promote" | "resume" | "stop";
                    readonly reason: string | null;
                };
                readonly actionId: string;
                readonly revision: number;
                readonly schedule: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
        readonly 'query-manage-schedule': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly author: {
                        readonly kind: "human";
                    } | {
                        readonly kind: "agent";
                        readonly session: string;
                    } | {
                        readonly kind: "system";
                    };
                    readonly control: "active" | "discarded" | "draft" | "exhausted" | "paused" | "stopped" | "superseded";
                    readonly createdAt: import("@omne-harness/utc-instant").Instant;
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly label: string | null;
                    readonly next: {
                        readonly at: import("@omne-harness/utc-instant").Instant;
                        readonly calendar: string | null;
                        readonly local: string;
                        readonly version: string | null;
                    } | null;
                    readonly revision: number;
                    readonly schedule: string;
                    readonly standing: "blocked" | "ready" | "terminallyInvalidated";
                }>;
                readonly 'not-committed': import("@omne-harness/public-contract").Codec<{}>;
                readonly 'not-visible': import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: 'login';
            readonly effect: 'read';
            readonly limit: 'small';
            readonly countsAsAccess: true;
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly action: {
                    readonly kind: "rename";
                    readonly label: string;
                } | {
                    readonly instruction: string;
                    readonly kind: "edit";
                } | {
                    readonly definition: import("@omne-harness/json-text").JsonValue;
                    readonly kind: "replace" | "revise";
                    readonly reason: string;
                } | {
                    readonly kind: "discard" | "pause" | "promote" | "resume" | "stop";
                    readonly reason: string | null;
                };
                readonly actionId: string;
                readonly revision: number;
                readonly schedule: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
        };
    };
    readonly name: "schedule";
    readonly major: 1;
    readonly observations: {};
};
export type ScheduleProtocol = typeof scheduleProtocol;
```
