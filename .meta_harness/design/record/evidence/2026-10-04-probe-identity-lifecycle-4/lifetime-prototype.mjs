// Exploratory mechanism, not product code or an accepted public implementation.
export function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
export function coordinator(ids,onStopping=()=>{}){
 const slots=ids.map(id=>({id,work:undefined,registered:false,done:deferred()}));
 let stopping=false,closePromise;
 function close(){
  if(closePromise)return closePromise;
  const result=deferred();closePromise=result.promise;stopping=true;
  const assemblyErrors=[];
  try{onStopping();}catch{assemblyErrors.push('assembly-stop-failed');}
  void(async()=>{
   const rows=[];
   for(const slot of [...slots].reverse()){
    if(!slot.registered)continue; // Fixture only: never-started suffix, not an unregistered apply.
    const errors=[];
    try{await slot.work.ready;}catch{errors.push('setup');}
    try{await slot.work.close();}catch{errors.push('close');}
    const status={kind:errors.length?'failed':'closed',errors};
    slot.done.resolve(status);rows.push({id:slot.id,...status});
   }
   result.resolve({complete:!assemblyErrors.length&&rows.every(r=>r.kind==='closed'),assemblyErrors,rows});
  })();
  return closePromise;
 }
 function port(index){return {register(work){
  const slot=slots[index];
  if(stopping||slot.registered){void close();throw new Error('registration-rejected');}
  slot.registered=true;slot.work=work;
  // Observe setup immediately; do not cause unhandled rejection while a later row drains.
  void work.ready.catch(()=>{void close();});
  return {closed:slot.done.promise,requestStop(){void close();}};
 }};}
 return {port,close,get stopping(){return stopping;}};
}
