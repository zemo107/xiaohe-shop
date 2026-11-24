// Local silhouette reconstruction. No remote model or AI API is called.
export function reconstruct(mask,width,height,grid,original,depth=.55){
 const {nx,ny,nz,step}=grid,inside=new Uint8Array(width*height),outside=new Uint8Array(width*height),queue=new Int32Array(width*height);
 let head=0,tail=0;
 const enqueue=i=>{if(!outside[i]&&!mask[i]){outside[i]=1;queue[tail++]=i;}};
 for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}for(let y=0;y<height;y++){enqueue(y*width);enqueue(y*width+width-1);}
 while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x)enqueue(i-1);if(x+1<width)enqueue(i+1);if(y)enqueue(i-width);if(y+1<height)enqueue(i+width);}
 let minX=width,minY=height,maxX=-1,maxY=-1,filled=0;
 for(let i=0;i<mask.length;i++)if(mask[i]||!outside[i]){inside[i]=1;filled++;const x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 if(filled<70||maxX-minX<8||maxY-minY<8)throw new Error('请先画一个较大的闭合轮廓');
 const dist=new Float32Array(width*height);for(let i=0;i<dist.length;i++)dist[i]=inside[i]?1e4:0;
 for(let y=1;y<height;y++)for(let x=1;x<width;x++){const i=y*width+x;dist[i]=Math.min(dist[i],dist[i-1]+1,dist[i-width]+1,dist[i-width-1]+1.414);}
 let maxD=1;for(let y=height-2;y>=0;y--)for(let x=width-2;x>=0;x--){const i=y*width+x;dist[i]=Math.min(dist[i],dist[i+1]+1,dist[i+width]+1,dist[i+width+1]+1.414);maxD=Math.max(maxD,dist[i]);}
 const span=Math.max(maxX-minX+1,maxY-minY+1),scale=1.62/span,cx=(minX+maxX)/2,cy=(minY+maxY)/2,output=new Float32Array(original.length);
 for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const px=(x-(nx-1)/2)*step,py=(y-(ny-1)/2)*step,pz=(z-(nz-1)/2)*step;
  const ix=Math.round(px/scale+cx),iy=Math.round(-(py+.19)/scale+cy),i=(y*nz+z)*nx+x;
  let sdf=-1;if(ix>=0&&ix<width&&iy>=0&&iy<height){const j=iy*width+ix;if(inside[j]){const edge=dist[j]*scale;const half=depth*(.28+.72*Math.sqrt(dist[j]/maxD));sdf=Math.min(edge,half-Math.abs(pz));}}
  output[i]=Math.min(original[i],sdf);
 }
 return output;
}
