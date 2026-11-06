# @omne-harness/governance-contract 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `EnforcementBinding` · `schema.d.ts`
- `EnforcementBindingSchema` · `schema.d.ts`
- `GovernanceAdoption` · `ports.d.ts`
- `GovernanceAdoptionCommand` · `schema.d.ts`
- `GovernanceAdoptionCommandSchema` · `schema.d.ts`
- `GovernanceAdoptionOutcome` · `ports.d.ts`
- `GovernanceBasis` · `schema.d.ts`
- `GovernanceBasisSchema` · `schema.d.ts`
- `GovernanceCatalogItem` · `ports.d.ts`
- `GovernanceCatalogPage` · `ports.d.ts`
- `GovernanceCatalogRequest` · `schema.d.ts`
- `GovernanceCatalogRequestSchema` · `schema.d.ts`
- `GovernanceCollectionRef` · `schema.d.ts`
- `GovernanceCollectionRefSchema` · `schema.d.ts`
- `GovernanceCommands` · `ports.d.ts`
- `GovernanceCommittedOperation` · `ports.d.ts`
- `GovernanceContributionCommand` · `schema.d.ts`
- `GovernanceContributionCommandSchema` · `schema.d.ts`
- `GovernanceContributionOutcome` · `ports.d.ts`
- `GovernanceContributionRef` · `schema.d.ts`
- `GovernanceContributionRefSchema` · `schema.d.ts`
- `GovernanceContributions` · `ports.d.ts`
- `GovernanceDefinitionBundle` · `schema.d.ts`
- `GovernanceDefinitionBundleSchema` · `schema.d.ts`
- `GovernanceDefinitionRef` · `schema.d.ts`
- `GovernanceDefinitionRefSchema` · `schema.d.ts`
- `GovernanceDigestSchema` · `schema.d.ts`
- `GovernanceFailure` · `ports.d.ts`
- `GovernanceIdSchema` · `schema.d.ts`
- `GovernanceOperationOutcome` · `ports.d.ts`
- `GovernanceOperationQuery` · `schema.d.ts`
- `GovernanceOperationQuerySchema` · `schema.d.ts`
- `GovernanceOperationRef` · `schema.d.ts`
- `GovernanceOperationRefSchema` · `schema.d.ts`
- `GovernanceQueries` · `ports.d.ts`
- `GovernanceRegistration` · `ports.d.ts`
- `GovernanceRelease` · `ports.d.ts`
- `GovernanceRevisionSchema` · `schema.d.ts`
- `GovernanceScope` · `schema.d.ts`
- `GovernanceScopeSchema` · `schema.d.ts`
- `GovernanceSelection` · `schema.d.ts`
- `GovernanceSelectionSchema` · `schema.d.ts`
- `GovernanceTenantRefSchema` · `schema.d.ts`
- `GovernanceUnknown` · `ports.d.ts`
- `GovernanceVisibilitySchema` · `schema.d.ts`
- `GovernanceWithdrawalCommand` · `schema.d.ts`
- `GovernanceWithdrawalCommandSchema` · `schema.d.ts`
- `GovernanceWithdrawalOutcome` · `ports.d.ts`

## 入口 `./cordis` · `cordis.d.ts`

- `GovernanceContributionsService` · `cordis.d.ts`
- `governanceContributionsKey` · `cordis.d.ts`

## 声明文件 `cordis.d.ts`

```ts
import { Service, type Context } from '@deepseek-ai/cordis';
import type { GovernanceContributions } from './ports.ts';
export declare abstract class GovernanceContributionsService<Registrar, Assembler, Reader> extends Service implements GovernanceContributions<Registrar, Assembler, Reader> {
    static readonly provide = "governanceContributions";
    constructor(ctx: Context);
    abstract readonly contribute: GovernanceContributions<Registrar, Assembler, Reader>['contribute'];
    abstract readonly withdraw: GovernanceContributions<Registrar, Assembler, Reader>['withdraw'];
    abstract readonly adopt: GovernanceContributions<Registrar, Assembler, Reader>['adopt'];
    abstract readonly readCatalog: GovernanceContributions<Registrar, Assembler, Reader>['readCatalog'];
    abstract readonly queryOperation: GovernanceContributions<Registrar, Assembler, Reader>['queryOperation'];
}
export declare const governanceContributionsKey = "governanceContributions";
declare module '@deepseek-ai/cordis' {
    interface Context {
        governanceContributions: GovernanceContributionsService<unknown, unknown, unknown>;
    }
}
```

## 声明文件 `index.d.ts`

```ts
export * from './schema.ts';
export * from './ports.ts';
```

## 声明文件 `ports.d.ts`

```ts
import type { Access } from '@omne-harness/legal-identity';
import type { SettingsTarget } from '@omne-harness/settings';
import type { GovernanceAdoptionCommand, GovernanceBasis, GovernanceCatalogRequest, GovernanceContributionCommand, GovernanceContributionRef, GovernanceDefinitionBundle, GovernanceOperationQuery, GovernanceOperationRef, GovernanceWithdrawalCommand } from './schema.ts';
export type GovernanceFailure = Readonly<{
    kind: 'invalid-input';
    field: string;
    reason: string;
}> | Readonly<{
    kind: 'limited';
    resource: string;
}> | Readonly<{
    kind: 'denied';
}> | Readonly<{
    kind: 'unavailable';
    owner: string;
}> | Readonly<{
    kind: 'conflict';
    reason: 'operation' | 'definition' | 'basis' | 'selection';
}>;
export type GovernanceUnknown = Readonly<{
    kind: 'unknown';
    operation: GovernanceOperationRef;
}>;
export type GovernanceRegistration = Readonly<{
    kind: 'registered';
    contribution: GovernanceContributionRef;
    declarationRevision: number;
    state: 'active' | 'closing' | 'released';
}>;
export type GovernanceRelease = Readonly<{
    kind: 'released' | 'already-released';
    contribution: GovernanceContributionRef;
    adoptionRevision: number;
}>;
export type GovernanceAdoption = Readonly<{
    kind: 'adopted';
    basis: GovernanceBasis;
}>;
export type GovernanceContributionOutcome = GovernanceRegistration | GovernanceFailure | GovernanceUnknown;
export type GovernanceWithdrawalOutcome = GovernanceRelease | GovernanceFailure | GovernanceUnknown;
export type GovernanceAdoptionOutcome = GovernanceAdoption | GovernanceFailure | GovernanceUnknown;
export type GovernanceCommittedOperation = Readonly<{
    owner: 'contribute';
    result: GovernanceRegistration;
}> | Readonly<{
    owner: 'withdraw';
    result: GovernanceRelease;
}> | Readonly<{
    owner: 'adopt';
    result: GovernanceAdoption;
}>;
export type GovernanceOperationOutcome = Readonly<{
    kind: 'committed';
    original: GovernanceCommittedOperation;
}> | Readonly<{
    kind: 'not-committed';
    operation: GovernanceOperationRef;
    sealRef: string;
}> | Readonly<{
    kind: 'pending';
    operation: GovernanceOperationRef;
}> | GovernanceUnknown | GovernanceFailure;
export type GovernanceCatalogItem = Readonly<{
    declaration: GovernanceDefinitionBundle;
    contributions: readonly Readonly<{
        contribution: GovernanceContributionRef;
        state: 'active' | 'closing' | 'released';
    }>[];
    selectedTargets: readonly SettingsTarget[];
    availability: 'available' | 'unavailable';
}>;
export type GovernanceCatalogPage = Readonly<{
    kind: 'page';
    items: readonly GovernanceCatalogItem[];
    snapshot: GovernanceBasis;
    completeness: 'complete' | 'partial';
    unavailableOwners: readonly string[];
    nextCursor: string | null;
}>;
export interface GovernanceCommands<Registrar, Assembler> {
    contribute(access: Access<Registrar>, command: GovernanceContributionCommand): Promise<GovernanceContributionOutcome>;
    withdraw(access: Access<Registrar>, command: GovernanceWithdrawalCommand): Promise<GovernanceWithdrawalOutcome>;
    adopt(access: Access<Assembler>, command: GovernanceAdoptionCommand): Promise<GovernanceAdoptionOutcome>;
}
export interface GovernanceQueries<Reader> {
    readCatalog(access: Access<Reader>, request: GovernanceCatalogRequest): Promise<GovernanceCatalogPage | GovernanceFailure>;
    queryOperation(access: Access<Reader>, query: GovernanceOperationQuery): Promise<GovernanceOperationOutcome>;
}
export interface GovernanceContributions<Registrar, Assembler, Reader> extends GovernanceCommands<Registrar, Assembler>, GovernanceQueries<Reader> {
}
```

## 声明文件 `schema.d.ts`

```ts
import { z } from 'zod';
export declare const GovernanceIdSchema: z.ZodString;
export declare const GovernanceDigestSchema: z.ZodString;
export declare const GovernanceRevisionSchema: z.ZodNumber;
export declare const GovernanceTenantRefSchema: z.ZodString;
export declare const GovernanceVisibilitySchema: z.ZodDiscriminatedUnion<[
    z.ZodObject<{
        kind: z.ZodLiteral<"tenant">;
        tenantRef: z.ZodString;
    }, z.core.$strict>,
    z.ZodObject<{
        kind: z.ZodLiteral<"organization">;
        organizationRef: z.ZodString;
    }, z.core.$strict>,
    z.ZodObject<{
        kind: z.ZodLiteral<"public">;
        publisherRef: z.ZodString;
    }, z.core.$strict>
], "kind">;
export declare const GovernanceScopeSchema: z.ZodObject<{
    tenantRef: z.ZodString;
    deploymentId: z.ZodString;
    logicalServiceId: z.ZodString;
    visibility: z.ZodDiscriminatedUnion<[
        z.ZodObject<{
            kind: z.ZodLiteral<"tenant">;
            tenantRef: z.ZodString;
        }, z.core.$strict>,
        z.ZodObject<{
            kind: z.ZodLiteral<"organization">;
            organizationRef: z.ZodString;
        }, z.core.$strict>,
        z.ZodObject<{
            kind: z.ZodLiteral<"public">;
            publisherRef: z.ZodString;
        }, z.core.$strict>
    ], "kind">;
}, z.core.$strict>;
export declare const GovernanceDefinitionRefSchema: z.ZodObject<{
    ownerId: z.ZodString;
    definitionId: z.ZodString;
    version: z.ZodString;
    digest: z.ZodString;
}, z.core.$strict>;
export declare const EnforcementBindingSchema: z.ZodObject<{
    capabilityId: z.ZodString;
    enforcementKey: z.ZodString;
    implementationRef: z.ZodString;
    action: z.ZodString;
    interpretationRef: z.ZodString;
}, z.core.$strict>;
export declare const GovernanceDefinitionBundleSchema: z.ZodObject<{
    reference: z.ZodObject<{
        ownerId: z.ZodString;
        definitionId: z.ZodString;
        version: z.ZodString;
        digest: z.ZodString;
    }, z.core.$strict>;
    origin: z.ZodDiscriminatedUnion<[
        z.ZodObject<{
            kind: z.ZodLiteral<"asset">;
            assetId: z.ZodString;
            releaseRef: z.ZodString;
        }, z.core.$strict>,
        z.ZodObject<{
            kind: z.ZodLiteral<"independent">;
            providerId: z.ZodString;
            definitionRef: z.ZodString;
        }, z.core.$strict>
    ], "kind">;
    settings: z.ZodArray<z.ZodObject<{
        providerId: z.ZodString;
        definitionId: z.ZodString;
        version: z.ZodString;
        groups: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            parentId: z.ZodNullable<z.ZodString>;
            title: z.ZodString;
            description: z.ZodString;
            order: z.ZodNumber;
        }, z.core.$strict>>;
        items: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            groupId: z.ZodString;
            category: z.ZodEnum<{
                binding: "binding";
                governance: "governance";
                "placement-identity": "placement-identity";
                preference: "preference";
            }>;
            presentation: z.ZodObject<{
                title: z.ZodString;
                description: z.ZodString;
                impact: z.ZodString;
                clear: z.ZodString;
                adoption: z.ZodEnum<{
                    creation: "creation";
                    "next-boundary": "next-boundary";
                    "next-read": "next-read";
                    reload: "reload";
                }>;
                localizationKey: z.ZodOptional<z.ZodString>;
                unit: z.ZodOptional<z.ZodString>;
                enumLabels: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    value: z.ZodJSONSchema;
                    title: z.ZodString;
                    description: z.ZodString;
                }, z.core.$strict>>>;
            }, z.core.$strict>;
            valueSchema: z.ZodRecord<z.ZodString, z.ZodJSONSchema>;
            default: z.ZodDiscriminatedUnion<[
                z.ZodObject<{
                    kind: z.ZodLiteral<"absent">;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"value">;
                    value: z.ZodJSONSchema;
                }, z.core.$strict>
            ], "kind">;
            merge: z.ZodEnum<{
                disabled: "disabled";
                override: "override";
            }>;
            sensitivity: z.ZodEnum<{
                ordinary: "ordinary";
                secret: "secret";
            }>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    permissions: z.ZodArray<z.ZodObject<{
        reference: z.ZodObject<{
            origin: z.ZodDiscriminatedUnion<[
                z.ZodObject<{
                    kind: z.ZodLiteral<"asset">;
                    assetId: z.ZodString;
                    releaseRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"independent">;
                    providerId: z.ZodString;
                    definitionRef: z.ZodString;
                }, z.core.$strict>
            ], "kind">;
            itemId: z.ZodString;
            revision: z.ZodString;
        }, z.core.$strict>;
        capabilityId: z.ZodString;
        enforcementKey: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        approvalEffect: z.ZodString;
        supportedScopes: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                "one-time-call": "one-time-call";
                session: "session";
                tenant: "tenant";
            }>;
            description: z.ZodString;
        }, z.core.$strict>>;
        assignmentLayers: z.ZodArray<z.ZodEnum<{
            organization: "organization";
            session: "session";
            tenant: "tenant";
        }>>;
        values: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            permitsOperation: z.ZodBoolean;
        }, z.core.$strict>>;
        comparison: z.ZodNullable<z.ZodObject<{
            strictOrder: z.ZodArray<z.ZodString>;
            distances: z.ZodArray<z.ZodArray<z.ZodNumber>>;
        }, z.core.$strict>>;
        defaultRule: z.ZodObject<{
            pick: z.ZodNullable<z.ZodString>;
            allowedSet: z.ZodNullable<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
        settings: z.ZodNullable<z.ZodObject<{
            providerId: z.ZodString;
            definitionId: z.ZodString;
            version: z.ZodString;
            itemId: z.ZodString;
            groupId: z.ZodString;
            groupTitle: z.ZodString;
            groupDescription: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    enforcementBindings: z.ZodArray<z.ZodObject<{
        capabilityId: z.ZodString;
        enforcementKey: z.ZodString;
        implementationRef: z.ZodString;
        action: z.ZodString;
        interpretationRef: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const GovernanceContributionRefSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    contributorId: z.ZodString;
    generation: z.ZodString;
    registrationId: z.ZodString;
}, z.core.$strict>;
export declare const GovernanceContributionCommandSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    contributorId: z.ZodString;
    generation: z.ZodString;
    operationId: z.ZodString;
    declaration: z.ZodObject<{
        reference: z.ZodObject<{
            ownerId: z.ZodString;
            definitionId: z.ZodString;
            version: z.ZodString;
            digest: z.ZodString;
        }, z.core.$strict>;
        origin: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"asset">;
                assetId: z.ZodString;
                releaseRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"independent">;
                providerId: z.ZodString;
                definitionRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
        settings: z.ZodArray<z.ZodObject<{
            providerId: z.ZodString;
            definitionId: z.ZodString;
            version: z.ZodString;
            groups: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                parentId: z.ZodNullable<z.ZodString>;
                title: z.ZodString;
                description: z.ZodString;
                order: z.ZodNumber;
            }, z.core.$strict>>;
            items: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                groupId: z.ZodString;
                category: z.ZodEnum<{
                    binding: "binding";
                    governance: "governance";
                    "placement-identity": "placement-identity";
                    preference: "preference";
                }>;
                presentation: z.ZodObject<{
                    title: z.ZodString;
                    description: z.ZodString;
                    impact: z.ZodString;
                    clear: z.ZodString;
                    adoption: z.ZodEnum<{
                        creation: "creation";
                        "next-boundary": "next-boundary";
                        "next-read": "next-read";
                        reload: "reload";
                    }>;
                    localizationKey: z.ZodOptional<z.ZodString>;
                    unit: z.ZodOptional<z.ZodString>;
                    enumLabels: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        value: z.ZodJSONSchema;
                        title: z.ZodString;
                        description: z.ZodString;
                    }, z.core.$strict>>>;
                }, z.core.$strict>;
                valueSchema: z.ZodRecord<z.ZodString, z.ZodJSONSchema>;
                default: z.ZodDiscriminatedUnion<[
                    z.ZodObject<{
                        kind: z.ZodLiteral<"absent">;
                    }, z.core.$strict>,
                    z.ZodObject<{
                        kind: z.ZodLiteral<"value">;
                        value: z.ZodJSONSchema;
                    }, z.core.$strict>
                ], "kind">;
                merge: z.ZodEnum<{
                    disabled: "disabled";
                    override: "override";
                }>;
                sensitivity: z.ZodEnum<{
                    ordinary: "ordinary";
                    secret: "secret";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        permissions: z.ZodArray<z.ZodObject<{
            reference: z.ZodObject<{
                origin: z.ZodDiscriminatedUnion<[
                    z.ZodObject<{
                        kind: z.ZodLiteral<"asset">;
                        assetId: z.ZodString;
                        releaseRef: z.ZodString;
                    }, z.core.$strict>,
                    z.ZodObject<{
                        kind: z.ZodLiteral<"independent">;
                        providerId: z.ZodString;
                        definitionRef: z.ZodString;
                    }, z.core.$strict>
                ], "kind">;
                itemId: z.ZodString;
                revision: z.ZodString;
            }, z.core.$strict>;
            capabilityId: z.ZodString;
            enforcementKey: z.ZodString;
            title: z.ZodString;
            description: z.ZodString;
            approvalEffect: z.ZodString;
            supportedScopes: z.ZodArray<z.ZodObject<{
                kind: z.ZodEnum<{
                    "one-time-call": "one-time-call";
                    session: "session";
                    tenant: "tenant";
                }>;
                description: z.ZodString;
            }, z.core.$strict>>;
            assignmentLayers: z.ZodArray<z.ZodEnum<{
                organization: "organization";
                session: "session";
                tenant: "tenant";
            }>>;
            values: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                title: z.ZodString;
                description: z.ZodString;
                permitsOperation: z.ZodBoolean;
            }, z.core.$strict>>;
            comparison: z.ZodNullable<z.ZodObject<{
                strictOrder: z.ZodArray<z.ZodString>;
                distances: z.ZodArray<z.ZodArray<z.ZodNumber>>;
            }, z.core.$strict>>;
            defaultRule: z.ZodObject<{
                pick: z.ZodNullable<z.ZodString>;
                allowedSet: z.ZodNullable<z.ZodArray<z.ZodString>>;
            }, z.core.$strict>;
            settings: z.ZodNullable<z.ZodObject<{
                providerId: z.ZodString;
                definitionId: z.ZodString;
                version: z.ZodString;
                itemId: z.ZodString;
                groupId: z.ZodString;
                groupTitle: z.ZodString;
                groupDescription: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        enforcementBindings: z.ZodArray<z.ZodObject<{
            capabilityId: z.ZodString;
            enforcementKey: z.ZodString;
            implementationRef: z.ZodString;
            action: z.ZodString;
            interpretationRef: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const GovernanceWithdrawalCommandSchema: z.ZodObject<{
    operationId: z.ZodString;
    contribution: z.ZodObject<{
        scope: z.ZodObject<{
            tenantRef: z.ZodString;
            deploymentId: z.ZodString;
            logicalServiceId: z.ZodString;
            visibility: z.ZodDiscriminatedUnion<[
                z.ZodObject<{
                    kind: z.ZodLiteral<"tenant">;
                    tenantRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"organization">;
                    organizationRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"public">;
                    publisherRef: z.ZodString;
                }, z.core.$strict>
            ], "kind">;
        }, z.core.$strict>;
        contributorId: z.ZodString;
        generation: z.ZodString;
        registrationId: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const GovernanceSelectionSchema: z.ZodObject<{
    contribution: z.ZodObject<{
        scope: z.ZodObject<{
            tenantRef: z.ZodString;
            deploymentId: z.ZodString;
            logicalServiceId: z.ZodString;
            visibility: z.ZodDiscriminatedUnion<[
                z.ZodObject<{
                    kind: z.ZodLiteral<"tenant">;
                    tenantRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"organization">;
                    organizationRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"public">;
                    publisherRef: z.ZodString;
                }, z.core.$strict>
            ], "kind">;
        }, z.core.$strict>;
        contributorId: z.ZodString;
        generation: z.ZodString;
        registrationId: z.ZodString;
    }, z.core.$strict>;
    selectedTargets: z.ZodArray<z.ZodObject<{
        policyId: z.ZodString;
        targetRef: z.ZodString;
        scopeRef: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const GovernanceCollectionRefSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    declarationRevision: z.ZodNumber;
    digest: z.ZodString;
}, z.core.$strict>;
export declare const GovernanceAdoptionCommandSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    operationId: z.ZodString;
    expectedAdoptionRevision: z.ZodNumber;
    expectedDeclarationRevision: z.ZodNumber;
    collection: z.ZodObject<{
        scope: z.ZodObject<{
            tenantRef: z.ZodString;
            deploymentId: z.ZodString;
            logicalServiceId: z.ZodString;
            visibility: z.ZodDiscriminatedUnion<[
                z.ZodObject<{
                    kind: z.ZodLiteral<"tenant">;
                    tenantRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"organization">;
                    organizationRef: z.ZodString;
                }, z.core.$strict>,
                z.ZodObject<{
                    kind: z.ZodLiteral<"public">;
                    publisherRef: z.ZodString;
                }, z.core.$strict>
            ], "kind">;
        }, z.core.$strict>;
        declarationRevision: z.ZodNumber;
        digest: z.ZodString;
    }, z.core.$strict>;
    complete: z.ZodArray<z.ZodObject<{
        contribution: z.ZodObject<{
            scope: z.ZodObject<{
                tenantRef: z.ZodString;
                deploymentId: z.ZodString;
                logicalServiceId: z.ZodString;
                visibility: z.ZodDiscriminatedUnion<[
                    z.ZodObject<{
                        kind: z.ZodLiteral<"tenant">;
                        tenantRef: z.ZodString;
                    }, z.core.$strict>,
                    z.ZodObject<{
                        kind: z.ZodLiteral<"organization">;
                        organizationRef: z.ZodString;
                    }, z.core.$strict>,
                    z.ZodObject<{
                        kind: z.ZodLiteral<"public">;
                        publisherRef: z.ZodString;
                    }, z.core.$strict>
                ], "kind">;
            }, z.core.$strict>;
            contributorId: z.ZodString;
            generation: z.ZodString;
            registrationId: z.ZodString;
        }, z.core.$strict>;
        selectedTargets: z.ZodArray<z.ZodObject<{
            policyId: z.ZodString;
            targetRef: z.ZodString;
            scopeRef: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const GovernanceBasisSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    epoch: z.ZodString;
    adoptionRevision: z.ZodNumber;
    declarationRevision: z.ZodNumber;
    declarationSetDigest: z.ZodString;
    selectedDefinitions: z.ZodArray<z.ZodObject<{
        ownerId: z.ZodString;
        definitionId: z.ZodString;
        version: z.ZodString;
        digest: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const GovernanceOperationQuerySchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    owner: z.ZodEnum<{
        adopt: "adopt";
        contribute: "contribute";
        withdraw: "withdraw";
    }>;
    operationId: z.ZodString;
}, z.core.$strict>;
export declare const GovernanceOperationRefSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    owner: z.ZodEnum<{
        adopt: "adopt";
        contribute: "contribute";
        withdraw: "withdraw";
    }>;
    operationId: z.ZodString;
    principalRef: z.ZodString;
}, z.core.$strict>;
export declare const GovernanceCatalogRequestSchema: z.ZodObject<{
    scope: z.ZodObject<{
        tenantRef: z.ZodString;
        deploymentId: z.ZodString;
        logicalServiceId: z.ZodString;
        visibility: z.ZodDiscriminatedUnion<[
            z.ZodObject<{
                kind: z.ZodLiteral<"tenant">;
                tenantRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"organization">;
                organizationRef: z.ZodString;
            }, z.core.$strict>,
            z.ZodObject<{
                kind: z.ZodLiteral<"public">;
                publisherRef: z.ZodString;
            }, z.core.$strict>
        ], "kind">;
    }, z.core.$strict>;
    mode: z.ZodEnum<{
        management: "management";
        runtime: "runtime";
    }>;
    targets: z.ZodArray<z.ZodObject<{
        policyId: z.ZodString;
        targetRef: z.ZodString;
        scopeRef: z.ZodString;
    }, z.core.$strict>>;
    limit: z.ZodNumber;
    cursor: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export type GovernanceScope = z.infer<typeof GovernanceScopeSchema>;
export type GovernanceDefinitionRef = z.infer<typeof GovernanceDefinitionRefSchema>;
export type GovernanceDefinitionBundle = z.infer<typeof GovernanceDefinitionBundleSchema>;
export type GovernanceContributionRef = z.infer<typeof GovernanceContributionRefSchema>;
export type GovernanceContributionCommand = z.infer<typeof GovernanceContributionCommandSchema>;
export type GovernanceWithdrawalCommand = z.infer<typeof GovernanceWithdrawalCommandSchema>;
export type GovernanceSelection = z.infer<typeof GovernanceSelectionSchema>;
export type GovernanceCollectionRef = z.infer<typeof GovernanceCollectionRefSchema>;
export type GovernanceAdoptionCommand = z.infer<typeof GovernanceAdoptionCommandSchema>;
export type GovernanceBasis = z.infer<typeof GovernanceBasisSchema>;
export type GovernanceOperationQuery = z.infer<typeof GovernanceOperationQuerySchema>;
export type GovernanceOperationRef = z.infer<typeof GovernanceOperationRefSchema>;
export type GovernanceCatalogRequest = z.infer<typeof GovernanceCatalogRequestSchema>;
export type EnforcementBinding = z.infer<typeof EnforcementBindingSchema>;
```
