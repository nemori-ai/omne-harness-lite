// The options of the local transport factory, and their check.
/** Throws `RangeError` on an option outside its range. */
export function checkOptions(options) {
    const { name, version } = options.clientInfo;
    if (typeof name !== 'string' || name === '')
        throw new RangeError('clientInfo.name must be a non-empty text');
    if (typeof version !== 'string' || version === '')
        throw new RangeError('clientInfo.version must be a non-empty text');
    const probe = options.probeTimeoutMs;
    if (!Number.isSafeInteger(probe) || probe <= 0)
        throw new RangeError('probeTimeoutMs must be a positive integer of milliseconds');
}
//# sourceMappingURL=options.js.map