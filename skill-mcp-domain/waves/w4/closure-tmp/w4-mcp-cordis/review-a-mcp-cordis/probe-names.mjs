import { Service, Context } from '@deepseek-ai/cordis'
const names = new Set(); let p = Service.prototype
while (p && p !== Object.prototype) { for (const n of Object.getOwnPropertyNames(p)) names.add(n); p = Object.getPrototypeOf(p) }
const ours = ['current','refresh','peer','invoke','continueWithInput','cancel','queryTask','taskResult','provideTaskInput','cancelTask','inspect','list','endpoints','endpoint','check','acquire','start']
console.log('Service proto members:', [...names].join(','))
console.log('clash:', ours.filter(n => names.has(n)))
class S extends Service { constructor(ctx){ super(ctx, 'x') } }
const ctx = new Context(); const s = new S(ctx); const own = Object.getOwnPropertyNames(s)
console.log('instance own props:', own.join(','), 'clash:', ours.filter(n => own.includes(n)))
