// Seeded stones keep their shape and paint palette across saves and previews.
export const stonePalettes=[
 ['#b1b1d1','#9098bc','#727f9e','#edc9a5','#62677e'],
 ['#bac6ad','#97aa90','#778d79','#eee0b4','#5e7364'],
 ['#dfc4aa','#c3a58e','#a18475','#f3dfb5','#856d62'],
 ['#d6b8ba','#ba959f','#967c8d','#f3d6b5','#7d6374'],
 ['#b3ccd0','#90aab7','#748b9d','#e7debf','#5f7284'],
 ['#d8d0ac','#b9b08c','#999278','#f5e4c3','#7b7863']
];
function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function stoneDensity(seed){
 const r=random(seed),range=(a,b)=>a+(b-a)*r();
 const variant=Math.floor(r()*4),sx=seed?range(.86,1.04):1,sz=seed?range(.87,1.09):1;
 const tall=variant===0?1.02:variant===1?.83:variant===2?.93:.99;
 const sy=seed?range(.92,1.08)*tall:1;
 const lean=seed?range(-.19,.19):0,mirror=seed&&r()<.5?-1:1;
 const leftY=seed?range(.22,.43):.36,rightY=seed?range(.04,.30):.18;
 const leftR=seed?range(.53,.73):.66,rightR=seed?range(.46,.65):.56;
 const phase=seed?range(0,6.28):0;
 const blend=(a,b)=>{const h=Math.max(.12-Math.abs(a-b),0)/.12;return Math.max(a,b)+h*h*.03;};
 return (x,y,z)=>{
  const py=(y+1.02)/sy-1.02,px=(x-lean*(py+.6))/sx*mirror,pz=z/sz;
  const base=1-Math.sqrt((px/1.08)**2+((py+.20)/.84)**2+((pz+.02)/.79)**2);
  const left=1-Math.sqrt(((px+.30)/.69)**2+((py-leftY)/leftR)**2+(pz/.69)**2);
  const right=1-Math.sqrt(((px-.49)/rightR)**2+((py-rightY)/.60)**2+((pz+.03)/.66)**2);
  return Math.min(blend(blend(base,left),right),(y+1.02)*2)+.008*Math.sin(px*4+py*3+phase)*Math.cos(pz*3);
 };
}
export function stoneStyle(value){return {seed:Number.isInteger(value?.seed)?value.seed>>>0:0,palette:Number.isInteger(value?.palette)&&value.palette>=0&&value.palette<stonePalettes.length?value.palette:0};}
