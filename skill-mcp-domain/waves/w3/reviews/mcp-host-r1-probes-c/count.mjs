const net = new Map()
const add = EventTarget.prototype.addEventListener
const remove = EventTarget.prototype.removeEventListener
EventTarget.prototype.addEventListener = function (type, fn, opts) {
  if (this instanceof AbortSignal && type === 'abort') net.set(this, (net.get(this) ?? 0) + 1)
  return add.call(this, type, fn, opts)
}
EventTarget.prototype.removeEventListener = function (type, fn, opts) {
  if (this instanceof AbortSignal && type === 'abort') net.set(this, (net.get(this) ?? 0) - 1)
  return remove.call(this, type, fn, opts)
}
globalThis.__abortNet = net
