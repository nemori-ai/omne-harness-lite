// The transport factory: opens the line that the material names and hands over a session. It
// sends nothing and calls no credential handle (contract T9): `open` only starts the readers of a
// stdio process, and it re-checks the signal before it answers.
import { FIRST_MODERN_PROTOCOL_VERSION } from '@omne-harness/mcp-contract';
import { metadataFetcher } from './authorization.js';
import { HttpLine } from './http-line.js';
import { checkOptions } from './options.js';
import { Session } from './session.js';
import { StdioLine } from './stdio-line.js';
/** The modern revisions this transport speaks on `server/discover`, highest first. */
const VERSIONS = [FIRST_MODERN_PROTOCOL_VERSION];
const NOT_SENT = { kind: 'not-sent', cause: 'connection-unavailable' };
/** The default scheduler: one real timer per probe. A test injects its own instead. */
const schedule = (delayMs, fire) => {
    const timer = setTimeout(fire, delayMs);
    return () => clearTimeout(timer);
};
/**
 * The default defect outlet: the defect is thrown outside any promise, so the host's
 * uncaught-exception handling sees it instead of a rejection nobody hears.
 */
const reportDefect = (defect) => {
    queueMicrotask(() => {
        throw defect;
    });
};
export function createLocalTransportFactory(options) {
    checkOptions(options);
    const fetchFn = options.fetch ?? globalThis.fetch;
    const sessionOptions = {
        clientInfo: { name: options.clientInfo.name, version: options.clientInfo.version },
        versions: VERSIONS,
        probeTimeoutMs: options.probeTimeoutMs,
        fetchMetadata: metadataFetcher(fetchFn),
        schedule,
        reportDefect,
    };
    return {
        async open(material, signal) {
            if (signal.aborted)
                return { failure: NOT_SENT };
            let line;
            if (material.kind === 'stdio') {
                const stdio = new StdioLine(material.process);
                await stdio.ready();
                line = stdio;
            }
            else
                line = new HttpLine(material.target, fetchFn);
            // The caller may have given up while the line was being opened (T9): nothing is handed over.
            if (signal.aborted) {
                await line.close();
                return { failure: NOT_SENT };
            }
            return { ok: new Session(line, material, sessionOptions) };
        },
    };
}
//# sourceMappingURL=factory.js.map