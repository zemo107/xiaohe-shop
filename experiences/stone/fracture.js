// Connectivity matches the edges of the six tetrahedra used by the renderer.
// A diagonal shared by tetrahedra is a real material connection at this resolution.
export function unsupportedComponents(values, nx, ny, nz, step, supportY, protectedMaterial=null) {
 const count=values.length, layer=nx*nz, seen=new Uint8Array(count), queue=new Int32Array(count);
 const directions=[[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]];
 let head=0,tail=0;
 function visit(i){
  const y=Math.floor(i/layer),z=Math.floor((i-y*layer)/nx),x=i%nx;
  for(const [dx,dy,dz] of directions)for(const sign of [-1,1]){
   const xx=x+dx*sign,yy=y+dy*sign,zz=z+dz*sign;
   if(xx<0||xx>=nx||yy<0||yy>=ny||zz<0||zz>=nz)continue;
   const j=(yy*nz+zz)*nx+xx;
   if(!seen[j]&&values[j]>0){seen[j]=1;queue[tail++]=j;}
  }
 }
 // Every piece still touching the support plane remains part of the workpiece.
 for(let y=0;y<ny&&(y-(ny-1)/2)*step<=supportY;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const i=(y*nz+z)*nx+x;if(values[i]>0){seen[i]=1;queue[tail++]=i;}
 }
 if(protectedMaterial)for(let i=0;i<count;i++)if(!seen[i]&&values[i]>0&&protectedMaterial[i]>0){seen[i]=1;queue[tail++]=i;}
 while(head<tail)visit(queue[head++]);
 const components=[];
 for(let i=0;i<count;i++)if(values[i]>0&&!seen[i]){
  head=0;tail=1;queue[0]=i;seen[i]=1;
  while(head<tail)visit(queue[head++]);
  components.push(queue.slice(0,tail));
 }
 return components;
}

// Greedily merge occupied samples into compound boxes, preserving concavities
// instead of filling every detached part with one enclosing bounding box.
export function collisionBoxes(values,nx,ny,nz,step,stride=3){
 const sx=Math.ceil(nx/stride),sy=Math.ceil(ny/stride),sz=Math.ceil(nz/stride);
 const occupied=new Uint8Array(sx*sy*sz),index=(x,y,z)=>(y*sz+z)*sx+x;
 for(let y=0;y<sy;y++)for(let z=0;z<sz;z++)for(let x=0;x<sx;x++){
  let solid=0,total=0;
  for(let dy=0;dy<stride&&y*stride+dy<ny;dy++)for(let dz=0;dz<stride&&z*stride+dz<nz;dz++)for(let dx=0;dx<stride&&x*stride+dx<nx;dx++){
   total++;if(values[((y*stride+dy)*nz+z*stride+dz)*nx+x*stride+dx]>0)solid++;
  }
  if(solid>0)occupied[index(x,y,z)]=1;
 }
 const boxes=[];
 for(let y=0;y<sy;y++)for(let z=0;z<sz;z++)for(let x=0;x<sx;x++)if(occupied[index(x,y,z)]){
  let w=1,d=1,h=1;while(x+w<sx&&occupied[index(x+w,y,z)])w++;
  zLoop:while(z+d<sz){for(let xx=x;xx<x+w;xx++)if(!occupied[index(xx,y,z+d)])break zLoop;d++;}
  yLoop:while(y+h<sy){for(let zz=z;zz<z+d;zz++)for(let xx=x;xx<x+w;xx++)if(!occupied[index(xx,y+h,zz)])break yLoop;h++;}
  for(let yy=y;yy<y+h;yy++)for(let zz=z;zz<z+d;zz++)for(let xx=x;xx<x+w;xx++)occupied[index(xx,yy,zz)]=0;
  // Tighten edge cells to the actual occupied samples. Otherwise a coarse
  // collider could bridge a freshly cut gap and hold a detached part in midair.
  const lo=[nx,ny,nz],hi=[-1,-1,-1];
  for(let yy=y*stride;yy<Math.min((y+h)*stride,ny);yy++)for(let zz=z*stride;zz<Math.min((z+d)*stride,nz);zz++)for(let xx=x*stride;xx<Math.min((x+w)*stride,nx);xx++)if(values[(yy*nz+zz)*nx+xx]>0){
   lo[0]=Math.min(lo[0],xx-.5);lo[1]=Math.min(lo[1],yy-.5);lo[2]=Math.min(lo[2],zz-.5);
   hi[0]=Math.max(hi[0],xx+.5);hi[1]=Math.max(hi[1],yy+.5);hi[2]=Math.max(hi[2],zz+.5);
  }
  boxes.push({center:lo.map((v,i)=>((v+hi[i])/2-([nx,ny,nz][i]-1)/2)*step),half:lo.map((v,i)=>(hi[i]-v)*step/2)});
 }
 // Sub-grid fragments still get a physical collider.
 if(!boxes.length){let lo=[nx,ny,nz],hi=[-1,-1,-1];for(let i=0;i<values.length;i++)if(values[i]>0){const y=Math.floor(i/(nx*nz)),z=Math.floor((i-y*nx*nz)/nx),x=i%nx;[x,y,z].forEach((v,k)=>{lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);});}if(hi[0]>=0)boxes.push({center:lo.map((v,i)=>((v+hi[i])/2-([nx,ny,nz][i]-1)/2)*step),half:lo.map((v,i)=>(hi[i]-v+1)*step/2)});}
 return boxes;
}
