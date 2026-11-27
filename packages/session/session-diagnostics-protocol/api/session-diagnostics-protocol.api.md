# @omne-harness/session-diagnostics-protocol 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `SessionDiagnosticsProtocol` · `session-diagnostics-protocol.d.ts`
- `sessionDiagnosticsProtocol` · `session-diagnostics-protocol.d.ts`

## 声明文件 `index.d.ts`

```ts
export { sessionDiagnosticsProtocol, type SessionDiagnosticsProtocol, } from './session-diagnostics-protocol.ts';
```

## 声明文件 `session-diagnostics-protocol.d.ts`

```ts
export declare const sessionDiagnosticsProtocol: {
    readonly operations: {
        readonly 'read-session-diagnostics': {
            readonly outcomes: {
                readonly succeeded: import("@omne-harness/public-contract").Codec<{
                    readonly basis: {
                        readonly upper: string;
                    };
                    readonly exhausted: boolean;
                    readonly gaps: readonly {
                        readonly reason: "denied" | "not-accepted" | "not-disclosed" | "not-found" | "not-recorded" | "retention-expired" | "truncated" | "unavailable" | "unsupported";
                        readonly source: "agent" | "model" | "session" | "tool";
                        readonly subject: string;
                    }[];
                    readonly next: string | null;
                    readonly runs: readonly {
                        readonly attempts: {
                            readonly exited: string;
                            readonly released: {
                                readonly bounded: string;
                                readonly cancelled: string;
                                readonly ended: string;
                                readonly released: string;
                                readonly superseded: string;
                            };
                            readonly started: string;
                        };
                        readonly calls: {
                            readonly projected: string;
                            readonly registered: string;
                        };
                        readonly controls: readonly {
                            readonly intent: "auto-archive" | "control" | "interrupt" | null;
                            readonly kind: "progress" | "requested";
                            readonly position: string;
                            readonly state: "committed" | "propagating" | "reconciled" | null;
                            readonly target: "producer" | "run" | "session" | null;
                        }[];
                        readonly entry: "dispatch" | "interactive";
                        readonly execution: string;
                        readonly facts: readonly {
                            readonly count: string;
                            readonly kind: string;
                        }[];
                        readonly messages: readonly {
                            readonly count: string;
                            readonly kind: string;
                        }[];
                        readonly modelCalls: readonly {
                            readonly call: {
                                readonly kind: "unknown";
                                readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                            } | {
                                readonly call: string;
                                readonly kind: "found";
                                readonly phase: "accepted" | "retry-decision" | "running" | "settled";
                                readonly progress?: {
                                    readonly allowed: string;
                                    readonly last: {
                                        readonly cause: string;
                                        readonly upstreamStatus: string | null;
                                    } | null;
                                    readonly made: string;
                                };
                            };
                            readonly coverage: "complete-through-snapshot" | "expired-prefix" | "unknown";
                            readonly dispatches: readonly {
                                readonly account: {
                                    readonly kind: "unknown";
                                    readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                } | {
                                    readonly cost: readonly {
                                        readonly lexeme: string | null;
                                        readonly source: string;
                                        readonly state: "known" | "provisional" | "unknown";
                                        readonly unit: string;
                                    }[];
                                    readonly duration: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly kind: "known";
                                        readonly value: string;
                                    };
                                    readonly kind: "account";
                                    readonly receipt: "late" | "received";
                                    readonly usage: readonly {
                                        readonly lexeme: string | null;
                                        readonly name: string;
                                        readonly state: "known" | "provisional" | "unknown";
                                        readonly unit: string;
                                    }[];
                                };
                                readonly adapter: {
                                    readonly digest: string;
                                    readonly name: string;
                                    readonly owner: string;
                                    readonly revision: string;
                                };
                                readonly connectRetries?: readonly ("connect-failed" | "connect-timeout")[];
                                readonly dispatch: string;
                                readonly effort?: {
                                    readonly kind: "unknown";
                                    readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                } | {
                                    readonly basis: "preference" | "provider" | "selection";
                                    readonly value: "high" | "low" | "max" | "medium" | "none" | "xhigh" | null;
                                };
                                readonly firstContent: "none-proven" | "observed" | "uncertain";
                                readonly instants?: {
                                    readonly ended: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly instant: string;
                                        readonly kind: "known";
                                    };
                                    readonly firstContent: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly instant: string;
                                        readonly kind: "known";
                                    };
                                    readonly prepared: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly instant: string;
                                        readonly kind: "known";
                                    };
                                    readonly responseStarted: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly instant: string;
                                        readonly kind: "known";
                                    };
                                    readonly sent: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly instant: string;
                                        readonly kind: "known";
                                    };
                                };
                                readonly outcome: {
                                    readonly kind: "pending";
                                } | {
                                    readonly kind: "completed";
                                    readonly reason: "limit" | "stop" | "tool-suggestions";
                                } | {
                                    readonly kind: "interrupted";
                                } | {
                                    readonly cause: string;
                                    readonly kind: "failed";
                                    readonly upstreamStatus: string | null;
                                };
                                readonly profile?: {
                                    readonly kind: "unknown";
                                    readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                } | {
                                    readonly digest: string;
                                    readonly name: string;
                                    readonly owner: string;
                                    readonly revision: string;
                                };
                                readonly reasoning?: "carried" | "not-carried" | "unknown";
                                readonly revision: string;
                                readonly send: "not-sent" | "sent" | "unknown";
                                readonly timing: {
                                    readonly execution: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly kind: "known";
                                        readonly milliseconds: string;
                                    };
                                    readonly materialize: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly kind: "known";
                                        readonly milliseconds: string;
                                    };
                                    readonly sendToFirstContent: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly kind: "known";
                                        readonly milliseconds: string;
                                    };
                                    readonly sendToResponse?: {
                                        readonly kind: "unknown";
                                    } | {
                                        readonly kind: "known";
                                        readonly milliseconds: string;
                                    };
                                };
                            }[];
                            readonly facts: readonly {
                                readonly count: string;
                                readonly kind: string;
                            }[];
                            readonly purpose: string;
                            readonly reads: readonly {
                                readonly block: string;
                                readonly message: string;
                                readonly read: "derived" | "fitted" | "original" | "transcript";
                            }[];
                            readonly reference: string;
                        }[];
                        readonly run: string;
                        readonly started: {
                            readonly at: {
                                readonly kind: "unknown";
                            } | {
                                readonly instant: string;
                                readonly kind: "known";
                            };
                            readonly position: string;
                        };
                        readonly terminal: {
                            readonly cause: {
                                readonly record: string | null;
                                readonly structured: {
                                    readonly kind: "unknown";
                                    readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                } | {
                                    readonly category: "exception" | "invariant" | "rejected" | "unsupported-path";
                                    readonly diagnostic?: string;
                                    readonly failureKind: string;
                                    readonly kind: "node-failed";
                                    readonly node: string;
                                } | {
                                    readonly kind: "none";
                                } | {
                                    readonly conclusion: "cancelled" | "complete" | "fail";
                                    readonly kind: "no-failure";
                                } | {
                                    readonly failure: "capacity" | "denied" | "invalid" | "unsupported" | {
                                        readonly kind: "unknown";
                                        readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                    };
                                    readonly kind: "model-refused";
                                } | {
                                    readonly cause: string | null;
                                    readonly kind: "no-reply";
                                    readonly throttled?: "yes";
                                    readonly upstreamStatus: string | null;
                                } | {
                                    readonly kind: "request-rejected";
                                } | {
                                    readonly kind: "cannot-fit";
                                    readonly reason: "after-compaction" | "fixed" | "protected-floor" | {
                                        readonly kind: "unknown";
                                        readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                                    };
                                } | {
                                    readonly kind: "compaction-invalid";
                                } | {
                                    readonly kind: "compaction-failed";
                                } | {
                                    readonly kind: "message-rejected";
                                } | {
                                    readonly kind: "extension-stop";
                                } | {
                                    readonly kind: "guard";
                                };
                            };
                            readonly outcome: "cancelled" | "completed" | "failed";
                        } | null;
                        readonly toolCalls: readonly {
                            readonly account: {
                                readonly kind: "unknown";
                                readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                            } | {
                                readonly cost: readonly {
                                    readonly lexeme: string | null;
                                    readonly source: string;
                                    readonly state: "known" | "provisional" | "unknown";
                                    readonly unit: string;
                                }[];
                                readonly duration: {
                                    readonly kind: "unknown";
                                } | {
                                    readonly kind: "known";
                                    readonly value: string;
                                };
                                readonly kind: "account";
                                readonly receipt: "late" | "received";
                                readonly usage: readonly {
                                    readonly lexeme: string | null;
                                    readonly name: string;
                                    readonly state: "known" | "provisional" | "unknown";
                                    readonly unit: string;
                                }[];
                            };
                            readonly diagnostics: readonly {
                                readonly code: string;
                                readonly operation: string;
                                readonly phase: string;
                            }[] | {
                                readonly kind: "unknown";
                                readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                            };
                            readonly facts: readonly {
                                readonly count: string;
                                readonly kind: string;
                            }[];
                            readonly reference: string;
                            readonly state: {
                                readonly kind: "unknown";
                                readonly reason: "denied" | "not-accepted" | "not-found" | "not-recorded" | "retention-expired" | "unavailable" | "unsupported";
                            } | {
                                readonly call: string;
                                readonly kind: "found";
                                readonly phase: "accepted" | "preparing" | "queued" | "running" | "settled" | "starting" | "suspended";
                                readonly relation: "background" | "foreground";
                                readonly terminal: {
                                    readonly cause: string | null;
                                    readonly kind: "completed" | "failed" | "interrupted" | "no-response" | "unavailable";
                                } | null;
                            };
                        }[];
                    }[];
                    readonly scannedThrough: string;
                }>;
                readonly invalid: import("@omne-harness/public-contract").Codec<{}>;
                readonly "basis-unavailable": true;
                readonly denied: true;
                readonly "protocol-rejected": true;
            };
            readonly identity: "login";
            readonly effect: "read";
            readonly limit: "small";
            readonly body: import("@omne-harness/public-contract").Codec<{
                readonly cursor: null;
                readonly pageBytes: string;
                readonly run: string | null;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            } | {
                readonly cursor: string;
                readonly session: string;
                readonly tenant: import("@omne-harness/legal-identity").TenantId;
            }>;
            readonly countsAsAccess: true;
        };
    };
    readonly name: "session-diagnostics";
    readonly major: 1;
    readonly observations: {};
};
export type SessionDiagnosticsProtocol = typeof sessionDiagnosticsProtocol;
```
