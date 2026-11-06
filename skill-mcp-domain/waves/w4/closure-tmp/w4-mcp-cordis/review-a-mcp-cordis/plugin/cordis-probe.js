import { createInMemoryCatalogStore, createMcp } from './mcp-wrap.js';
import { ActionDiscoveryService, ActionInvokerService, EndpointStatusService, mcpAdoptionViewKey, mcpCredentialUseKey, mcpProcessLandingKey, mcpUseEligibilityKey, } from '@omne-harness/mcp-cordis-contract/cordis';
import { definePlugin, } from '@omne-harness/kernel-basis/cordis';
import { fail } from '@omne-harness/operation-result';
import { createLocalTransportFactory } from './factory.js';
const BOUNDS = ['maxListingPages', 'maxActions', 'instructionsByteLimit', 'probeTimeoutMs'];
const FIELDS = [...BOUNDS, 'clientInfo'];
const CLIENT_INFO_FIELDS = ['name', 'version'];
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function issue(message) {
    return { issues: [{ message }] };
}
/** The issue of a record that has a field outside `fields` or lacks one of them. */
function fieldsIssue(record, fields, what) {
    const extra = Object.keys(record).find(key => !fields.includes(key));
    if (extra !== undefined)
        return `${what} has no field ${extra}`;
    const missing = fields.find(field => !(field in record));
    if (missing !== undefined)
        return `${what} needs the field ${missing}`;
    return undefined;
}
/**
 * Checks the shape only: the five fields, each of its type, the two texts of `clientInfo`, and no
 * other field. It answers a new object, so a later change to the input does not reach the plugin.
 */
const mcpPluginConfig = {
    '~standard': {
        version: 1,
        vendor: 'omne-harness',
        validate(value) {
            if (!isPlainRecord(value))
                return issue('configuration must be an object');
            const fields = fieldsIssue(value, FIELDS, 'configuration');
            if (fields !== undefined)
                return issue(fields);
            const [maxListingPages, maxActions, instructionsByteLimit, probeTimeoutMs] = BOUNDS.map(name => value[name]);
            if (typeof maxListingPages !== 'number' ||
                typeof maxActions !== 'number' ||
                typeof instructionsByteLimit !== 'number' ||
                typeof probeTimeoutMs !== 'number')
                return issue(`${BOUNDS.join(', ')} must be numbers`);
            const clientInfo = value['clientInfo'];
            if (!isPlainRecord(clientInfo))
                return issue('clientInfo must be an object');
            const clientFields = fieldsIssue(clientInfo, CLIENT_INFO_FIELDS, 'clientInfo');
            if (clientFields !== undefined)
                return issue(clientFields);
            const { name, version } = clientInfo;
            if (typeof name !== 'string' || typeof version !== 'string')
                return issue('clientInfo.name and clientInfo.version must be texts');
            return {
                value: {
                    maxListingPages,
                    maxActions,
                    instructionsByteLimit,
                    probeTimeoutMs,
                    clientInfo: { name, version },
                },
            };
        },
    },
};
/** The adoption view that asks the `mcpAdoptionView` service on each call (IC-9). */
function adoptionOf(ctx) {
    return {
        async endpoints(...args) {
            const port = ctx.get(mcpAdoptionViewKey);
            if (port === undefined)
                return fail('unknown');
            return port.endpoints(...args);
        },
        async endpoint(...args) {
            const port = ctx.get(mcpAdoptionViewKey);
            if (port === undefined)
                return fail('unknown');
            return port.endpoint(...args);
        },
    };
}
/** The use eligibility that asks the `mcpUseEligibility` service on each call (IC-9). */
function eligibilityOf(ctx) {
    return {
        async check(...args) {
            const port = ctx.get(mcpUseEligibilityKey);
            if (port === undefined)
                return { kind: 'unknown' };
            return port.check(...args);
        },
    };
}
/** The credential use that asks the `mcpCredentialUse` service on each call (IC-9). */
function credentialsOf(ctx) {
    async function acquire(access, holding, purpose, binding) {
        const port = ctx.get(mcpCredentialUseKey);
        if (port === undefined)
            return fail('unknown');
        // Each branch calls the overload of its purpose.
        if (purpose.kind === 'process-env')
            return port.acquire(access, holding, purpose, binding);
        return port.acquire(access, holding, purpose, binding);
    }
    return { acquire };
}
/** The process landing that asks the `mcpProcessLanding` service on each call (IC-9). */
function landingOf(ctx) {
    return {
        async start(...args) {
            const port = ctx.get(mcpProcessLandingKey);
            if (port === undefined)
                return fail('unknown');
            return port.start(...args);
        },
    };
}
class HostActionDiscovery extends ActionDiscoveryService {
    discovery;
    constructor(ctx, discovery) {
        super(ctx);
        this.discovery = discovery;
    }
    current(...args) {
        return this.discovery.current(...args);
    }
    refresh(...args) {
        return this.discovery.refresh(...args);
    }
    peer(...args) {
        return this.discovery.peer(...args);
    }
}
class HostActionInvoker extends ActionInvokerService {
    invoker;
    constructor(ctx, invoker) {
        super(ctx);
        this.invoker = invoker;
    }
    invoke(...args) {
        return this.invoker.invoke(...args);
    }
    continueWithInput(...args) {
        return this.invoker.continueWithInput(...args);
    }
    cancel(...args) {
        return this.invoker.cancel(...args);
    }
    queryTask(...args) {
        return this.invoker.queryTask(...args);
    }
    taskResult(...args) {
        return this.invoker.taskResult(...args);
    }
    provideTaskInput(...args) {
        return this.invoker.provideTaskInput(...args);
    }
    cancelTask(...args) {
        return this.invoker.cancelTask(...args);
    }
}
class HostEndpointStatus extends EndpointStatusService {
    status;
    constructor(ctx, status) {
        super(ctx);
        this.status = status;
    }
    inspect(...args) {
        return this.status.inspect(...args);
    }
    list(...args) {
        return this.status.list(...args);
    }
}
/**
 * Makes the MCP plugin. On load it builds the services with one `createMcp` and provides
 * `mcpActionDiscovery`, `mcpActionInvoker` and `mcpEndpointStatus` on the loading fiber; the three
 * share one connection table, one in-flight table and one task table. A configuration that is not
 * of the shape fails the load; a value out of range fails it with the `RangeError` of
 * `createLocalTransportFactory` or `createMcp`. When the fiber unloads, one removal awaits
 * `connections.closeAll()`; an `AggregateError` from it is not caught, and Cordis writes it to
 * `ctx.logger`.
 */
export function createMcpPlugin(parts) {
    return definePlugin({
        name: 'mcp',
        Config: mcpPluginConfig,
        apply(ctx, config) {
            const ports = {
                adoption: adoptionOf(ctx),
                eligibility: eligibilityOf(ctx),
                credentials: credentialsOf(ctx),
                landing: landingOf(ctx),
                store: createInMemoryCatalogStore(),
                transports: createLocalTransportFactory({
                    clientInfo: config.clientInfo,
                    probeTimeoutMs: config.probeTimeoutMs,
                    ...(parts.fetch === undefined ? {} : { fetch: parts.fetch }),
                }),
                checkOutput: parts.checkOutput,
                ...(parts.clock === undefined ? {} : { clock: parts.clock }),
            };
            const services = createMcp(ports, {
                principalKey: parts.principalKey,
                maxListingPages: config.maxListingPages,
                maxActions: config.maxActions,
                instructionsByteLimit: config.instructionsByteLimit,
            });
            ctx.effect(() => async () => {
                await services.connections.closeAll();
            }, 'mcp.closeAll');
            new HostActionDiscovery(ctx, services.discovery);
            new HostActionInvoker(ctx, services.invoker);
            new HostEndpointStatus(ctx, services.status);
        },
    });
}
//# sourceMappingURL=cordis.js.map