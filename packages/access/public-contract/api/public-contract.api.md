# @omne-harness/public-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `AccessProtocol` · `access-protocol.d.ts`
- `AccountId` · 包 `@omne-harness/legal-identity`
- `AvailabilityFrame` · `access-protocol.d.ts`
- `Codec` · `rule-codec.d.ts`
- `CodecResult` · `rule-codec.d.ts`
- `DefinedProtocol` · `protocol.d.ts`
- `FixedOutcome` · `outcome.d.ts`
- `LeafKind` · `rule.d.ts`
- `LoginStateId` · 包 `@omne-harness/legal-identity`
- `OUTCOMES` · `outcome.d.ts`
- `ObservationContract` · `protocol.d.ts`
- `OperationContract` · `protocol.d.ts`
- `OrganizationId` · 包 `@omne-harness/legal-identity`
- `Outcome` · `outcome.d.ts`
- `OutcomeBodies` · `protocol.d.ts`
- `ProtocolContract` · `protocol.d.ts`
- `Rule` · `rule.d.ts`
- `RuleValue` · `rule-codec.d.ts`
- `TenantId` · 包 `@omne-harness/legal-identity`
- `UserMessage` · `user-message.d.ts`
- `accessProtocol` · `access-protocol.d.ts`
- `defineProtocol` · `protocol.d.ts`
- `encodeAccountIdText` · `identity-text.d.ts`
- `encodeLoginStateIdText` · `identity-text.d.ts`
- `encodeOrganizationIdText` · `identity-text.d.ts`
- `encodeTenantText` · `identity-text.d.ts`
- `readAccountIdText` · `identity-text.d.ts`
- `readLoginStateIdText` · `identity-text.d.ts`
- `readOrganizationIdText` · `identity-text.d.ts`
- `readTenantText` · `identity-text.d.ts`
- `ruleCodec` · `rule-codec.d.ts`
- `userTextMessage` · `user-message.d.ts`

## 声明文件 `access-protocol.d.ts`

```ts
import { type RuleValue } from './rule-codec.ts';
declare const availabilityFrame: {
    readonly kind: 'one-of';
    readonly rules: readonly [
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            'snapshot'
                        ];
                    };
                };
                readonly revision: {
                    readonly rule: {
                        readonly kind: 'positive-integer';
                    };
                };
                readonly protocols: {
                    readonly rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly name: {
                                    readonly rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly major: {
                                    readonly rule: {
                                        readonly kind: 'positive-integer';
                                    };
                                };
                            };
                        };
                    };
                };
            };
        },
        {
            readonly kind: 'object';
            readonly fields: {
                readonly kind: {
                    readonly rule: {
                        readonly kind: 'literal';
                        readonly values: readonly [
                            'change'
                        ];
                    };
                };
                readonly revision: {
                    readonly rule: {
                        readonly kind: 'positive-integer';
                    };
                };
                readonly added: {
                    readonly rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly name: {
                                    readonly rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly major: {
                                    readonly rule: {
                                        readonly kind: 'positive-integer';
                                    };
                                };
                            };
                        };
                    };
                };
                readonly removed: {
                    readonly rule: {
                        readonly kind: 'array';
                        readonly item: {
                            readonly kind: 'object';
                            readonly fields: {
                                readonly name: {
                                    readonly rule: {
                                        readonly kind: 'text';
                                    };
                                };
                                readonly major: {
                                    readonly rule: {
                                        readonly kind: 'positive-integer';
                                    };
                                };
                            };
                        };
                    };
                };
            };
        }
    ];
};
export type AvailabilityFrame = RuleValue<typeof availabilityFrame>;
export declare const accessProtocol: {
    readonly operations: {};
    readonly name: "access";
    readonly major: 1;
    readonly observations: {
        readonly availability: {
            readonly identity: "none";
            readonly open: import("./rule-codec.ts").Codec<{}>;
            readonly frame: import("./rule-codec.ts").Codec<{
                readonly kind: "snapshot";
                readonly protocols: readonly {
                    readonly major: number;
                    readonly name: string;
                }[];
                readonly revision: number;
            } | {
                readonly added: readonly {
                    readonly major: number;
                    readonly name: string;
                }[];
                readonly kind: "change";
                readonly removed: readonly {
                    readonly major: number;
                    readonly name: string;
                }[];
                readonly revision: number;
            }>;
            readonly ends: readonly [
            ];
        };
    };
};
export type AccessProtocol = typeof accessProtocol;
export {};
```

## 声明文件 `identity-text.d.ts`

```ts
import { type AccountId, type LoginStateId, type OrganizationId, type TenantId } from '@omne-harness/legal-identity';
export type { AccountId, LoginStateId, OrganizationId, TenantId };
export declare function readTenantText(text: string): TenantId | undefined;
export declare function encodeTenantText(value: TenantId): string;
export declare function readOrganizationIdText(text: string): OrganizationId | undefined;
export declare function encodeOrganizationIdText(value: OrganizationId): string;
export declare function readAccountIdText(text: string): AccountId | undefined;
export declare function encodeAccountIdText(value: AccountId): string;
export declare function readLoginStateIdText(text: string): LoginStateId | undefined;
export declare function encodeLoginStateIdText(value: LoginStateId): string;
```

## 声明文件 `index.d.ts`

```ts
export { readTenantText, encodeTenantText, readOrganizationIdText, encodeOrganizationIdText, readAccountIdText, encodeAccountIdText, readLoginStateIdText, encodeLoginStateIdText, } from './identity-text.ts';
export type { AccountId, LoginStateId, OrganizationId, TenantId } from './identity-text.ts';
export { OUTCOMES } from './outcome.ts';
export type { FixedOutcome, Outcome } from './outcome.ts';
export { ruleCodec } from './rule-codec.ts';
export type { Codec, CodecResult, RuleValue } from './rule-codec.ts';
export type { LeafKind, Rule } from './rule.ts';
export { userTextMessage } from './user-message.ts';
export type { UserMessage } from './user-message.ts';
export { defineProtocol } from './protocol.ts';
export { accessProtocol } from './access-protocol.ts';
export type { AccessProtocol, AvailabilityFrame } from './access-protocol.ts';
export type { DefinedProtocol, ObservationContract, OperationContract, OutcomeBodies, ProtocolContract, } from './protocol.ts';
```

## 声明文件 `leaf-codec.d.ts`

```ts
import { type JsonLimits, type JsonValue } from '@omne-harness/json-text';
import type { Rule } from './rule.ts';
export type Fields = Readonly<Record<string, unknown>>;
export type Converted = {
    readonly local: unknown;
    readonly wire: JsonValue;
};
export type Direction = 'encode' | 'decode';
export declare function fields(value: unknown): Fields | undefined;
export declare function exact(value: Fields, required: readonly string[], optional?: readonly string[]): boolean;
export declare function objectWire(value: JsonValue | undefined): Readonly<Record<string, JsonValue>> | undefined;
export declare function textWire(value: JsonValue | undefined): string | undefined;
export declare function stringWire(value: string): JsonValue;
export declare function wireObject(value: Readonly<Record<string, JsonValue>>): JsonValue;
export declare function nodeOf(input: unknown): JsonValue | undefined;
export declare function convert(rule: Rule, input: unknown, direction: Direction, limits: JsonLimits): Converted | undefined;
```

## 声明文件 `outcome.d.ts`

```ts
export declare const OUTCOMES: readonly [
    "succeeded",
    "no-change",
    "not-committed",
    "need-decision",
    "protocol-rejected",
    "invalid",
    "uniform-auth-failure",
    "denied",
    "not-loginable",
    "not-visible",
    "not-found",
    "conflict",
    "archived",
    "frozen",
    "limited",
    "unsupported",
    "not-writable",
    "stage-not-provided",
    "basis-unavailable",
    "unknown"
];
export type Outcome = (typeof OUTCOMES)[number];
export type FixedOutcome = 'denied' | 'protocol-rejected' | 'basis-unavailable' | 'unknown' | 'uniform-auth-failure' | 'stage-not-provided';
```

## 声明文件 `protocol.d.ts`

```ts
import type { FixedOutcome, Outcome } from './outcome.ts';
import type { Codec } from './rule-codec.ts';
type Identity = 'none' | 'login' | 'acting-tenant';
export type OutcomeBodies = {
    readonly succeeded: Codec<any>;
} & {
    readonly [K in Exclude<Outcome, 'succeeded'>]?: K extends FixedOutcome ? true : Codec<any>;
};
export type OperationContract<Body = any, Results extends OutcomeBodies = OutcomeBodies> = {
    readonly identity: Identity;
    readonly effect: 'read' | 'commit';
    readonly limit: 'small' | 'input';
    readonly body: Codec<Body>;
    readonly outcomes: Results;
    readonly carriesCredential?: true;
    readonly countsAsAccess?: true;
};
export type ObservationContract<Open = any, Frame = any, End extends string = string> = {
    readonly identity: Identity;
    readonly limit?: 'small' | 'input';
    readonly open: Codec<Open>;
    readonly frame: Codec<Frame>;
    readonly ends: readonly End[];
    readonly countsAsAccess?: true;
};
export type ProtocolContract = {
    readonly name: string;
    readonly major: number;
    readonly operations: Readonly<Record<string, OperationContract>>;
    readonly observations: Readonly<Record<string, ObservationContract>>;
};
type PipelineOutcome<O extends OperationContract> = 'protocol-rejected' | 'basis-unavailable' | ([
    Exclude<O['identity'], 'none'>
] extends [
    never
] ? never : 'denied') | ('commit' extends O['effect'] ? 'unknown' : never);
type Flatten<T> = {
    [K in keyof T]: T[K];
} & {};
type WithPipeline<O extends OperationContract> = Flatten<Omit<O, 'outcomes'> & {
    readonly outcomes: Flatten<O['outcomes'] & {
        readonly [K in PipelineOutcome<O>]: true;
    }>;
}>;
export type DefinedProtocol<P extends ProtocolContract> = Flatten<Omit<P, 'operations'> & {
    readonly operations: {
        readonly [N in keyof P['operations']]: WithPipeline<P['operations'][N]>;
    };
}>;
type Only<T, Allowed extends PropertyKey> = {
    readonly [K in keyof T]: K extends Allowed ? T[K] : never;
};
type ClosedOperation<O> = O extends {
    readonly outcomes: infer R;
} ? Only<O, keyof OperationContract> & {
    readonly outcomes: Only<R, Outcome>;
} : O;
declare const RESERVED_OPERATION_NAME = "observe";
type Closed<P extends ProtocolContract> = Only<P, keyof ProtocolContract> & {
    readonly operations: {
        readonly [N in keyof P['operations']]: N extends typeof RESERVED_OPERATION_NAME ? never : ClosedOperation<P['operations'][N]>;
    };
    readonly observations: {
        readonly [N in keyof P['observations']]: Only<P['observations'][N], keyof ObservationContract>;
    };
};
export declare function defineProtocol<const P extends ProtocolContract>(protocol: P & Closed<P>): DefinedProtocol<P>;
export {};
```

## 声明文件 `rule-codec.d.ts`

```ts
import { type JsonLimits, type JsonValue } from '@omne-harness/json-text';
import type { Instant } from '@omne-harness/utc-instant';
import type { AccountId, LoginStateId, OrganizationId, TenantId } from './identity-text.ts';
import type { LeafKind, Rule } from './rule.ts';
export type CodecResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
};
export type Codec<T> = {
    readonly read: (value: JsonValue, limits: JsonLimits) => CodecResult<T>;
    readonly write: (value: T, limits: JsonLimits) => CodecResult<JsonValue>;
};
type JsonObject = Extract<JsonValue, {
    readonly kind: 'object';
}>;
type LeafValues = {
    readonly text: string;
    readonly string: string;
    readonly session: string;
    readonly 'page-bytes': string;
    readonly revision: string;
    readonly boolean: boolean;
    readonly null: null;
    readonly account: AccountId;
    readonly organization: OrganizationId;
    readonly login: LoginStateId;
    readonly tenant: TenantId;
    readonly instant: Instant;
    readonly 'positive-integer': number;
    readonly 'page-limit': number;
    readonly parameters: JsonObject;
    readonly json: JsonValue;
    readonly 'user-message': JsonObject;
};
type Fields = Extract<Rule, {
    readonly kind: 'object';
}>['fields'];
type RequiredKeys<F extends Fields> = {
    [K in keyof F]: F[K] extends {
        readonly optional: true;
    } ? never : K;
}[keyof F];
type Flatten<T> = {
    [K in keyof T]: T[K];
} & {};
type ObjectValue<F extends Fields> = Flatten<{
    readonly [K in RequiredKeys<F>]: RuleValue<F[K]['rule']>;
} & {
    readonly [K in Exclude<keyof F, RequiredKeys<F>>]?: RuleValue<F[K]['rule']>;
}>;
export type RuleValue<R extends Rule> = R extends {
    readonly kind: infer K extends LeafKind;
} ? LeafValues[K] : R extends {
    readonly kind: 'literal';
    readonly values: readonly (infer V)[];
} ? V : R extends {
    readonly kind: 'object';
    readonly fields: infer F extends Fields;
} ? ObjectValue<F> : R extends {
    readonly kind: 'array';
    readonly item: infer I extends Rule;
} ? readonly RuleValue<I>[] : R extends {
    readonly kind: 'one-of';
    readonly rules: readonly (infer O extends Rule)[];
} ? RuleValue<O> : never;
export declare function ruleCodec<const R extends Rule>(rule: R): Codec<RuleValue<R>>;
export {};
```

## 声明文件 `rule.d.ts`

```ts
export type LeafKind = 'text' | 'string' | 'boolean' | 'null' | 'account' | 'organization' | 'login' | 'tenant' | 'instant' | 'session' | 'page-bytes' | 'revision' | 'positive-integer' | 'page-limit' | 'parameters' | 'json' | 'user-message';
export type Rule = {
    readonly kind: LeafKind;
} | {
    readonly kind: 'literal';
    readonly values: readonly (string | boolean)[];
} | {
    readonly kind: 'object';
    readonly fields: Readonly<Record<string, {
        readonly rule: Rule;
        readonly optional?: true;
    }>>;
} | {
    readonly kind: 'array';
    readonly item: Rule;
    readonly nonempty?: true;
    readonly max?: number;
} | {
    readonly kind: 'one-of';
    readonly rules: readonly Rule[];
};
export type RequestRule = {
    readonly body: Rule;
    readonly proof: boolean;
    readonly tenant: boolean;
};
export type Family<V extends string, P extends string, S extends string> = {
    readonly version: V;
    readonly error: string;
    readonly stages: readonly S[];
    readonly declarable: boolean;
    readonly isProvided: (value: unknown) => value is P;
    readonly requestRule: (operation: P) => RequestRule;
    readonly responseRule: (operation: P, outcome: string) => Rule | undefined;
};
export declare const empty: Rule;
```

## 声明文件 `user-message.d.ts`

```ts
import type { JsonValue } from '@omne-harness/json-text';
export type UserMessage = Extract<JsonValue, {
    readonly kind: 'object';
}>;
export declare function userTextMessage(text: string, inputId: string): UserMessage;
```
