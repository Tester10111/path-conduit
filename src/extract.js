const RE=/-P(\d+)-(\d+)\.(A\d+)_/;
function extract(text){
  const doc=new DOMParser().parseFromString(text,"application/xml");
  let ids=[...doc.getElementsByTagName("CableID")].map(n=>n.textContent.trim());
  if(!ids.length) ids=[...text.matchAll(/<CableID>([^<]*)<\/CableID>/g)].map(m=>m[1]);
  const combos=new Map(),unmatched=[];
  for(const id of ids){const m=id.match(RE);if(!m){unmatched.push(id);continue}
    const k=`${+m[1]}-${+m[2]}`;const c=combos.get(k)||{count:0,a:new Map()};c.count++;c.a.set(m[3],(c.a.get(m[3])||0)+1);combos.set(k,c)}
  const num=k=>k.split("-").map(Number);
  const out=[...combos].sort((x,y)=>{const a=num(x[0]),b=num(y[0]);return a[0]-b[0]||a[1]-b[1]})
    .map(([k,c])=>({pc:k,records:c.count,a0x:[...c.a].sort().map(([a,n])=>({a,n}))}));
  return {records:ids.length,combos:out,unmatched};
}
