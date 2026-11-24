// Detail pages retain their independent URLs and return to the host shop when embedded.
if(window.parent!==window){
 document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const u=new URL(a.href,location.href);if(u.origin===location.origin&&/\/(index\.html)?$/.test(u.pathname)&&!u.pathname.includes('/experiences/')){e.preventDefault();window.parent.postMessage({type:'portfolio:return-to-shop'},location.origin);}});
}
'use strict';
(()=>{
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const cards=$$('.work-card'), filters=$$('[data-filter]'), search=$('.search-label input');
 let mode='all';
 function filter(){const term=(search?.value||'').trim().toLocaleLowerCase();let count=0;cards.forEach(c=>{c.hidden=!(mode==='all'||c.dataset.mode===mode)||!c.dataset.search.toLocaleLowerCase().includes(term);if(!c.hidden)count++;});const empty=$('.empty-result');if(empty)empty.hidden=count>0;}
 filters.forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.filter;filters.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();}));search?.addEventListener('input',filter);
 const albumCaption=(album,thumb,index,total)=>thumb.dataset.caption||`${album.dataset.albumLabel||'摄影作业合集'} · 第 ${String(index+1).padStart(2,'0')} / ${total} 页`;
 $$('[data-album]').forEach(album=>{
  const thumbs=$$('[data-album-src]',album),main=$('.album-current',album),prev=$('[data-album-prev]',album),next=$('[data-album-next]',album);
  if(!thumbs.length)return;
  let current=0;
  function setPage(i){
   current=Math.max(0,Math.min(thumbs.length-1,i));
   const thumb=thumbs[current],src=thumb.dataset.albumSrc,caption=albumCaption(album,thumb,current,thumbs.length),img=$('img',main),button=$('.image-zoom',main);
   img.src=src;img.alt=caption;button.dataset.image=src;button.dataset.caption=caption;button.setAttribute('aria-label','放大：'+caption);
   $('figcaption',main).textContent=caption;$('[data-album-count]',album).textContent=`${String(current+1).padStart(2,'0')} / ${thumbs.length}`;
   thumbs.forEach((b,n)=>b.setAttribute('aria-pressed',String(n===current)));
   prev.disabled=current===0;next.disabled=current===thumbs.length-1;
   const title=$('[data-album-title]',album),transcript=$('[data-album-transcript]',album);
   if(title)title.textContent=thumb.dataset.title||caption;
   if(transcript)transcript.textContent=$(`[data-slide-text="${current+1}"]`,album)?.content.textContent.trim()||'本页为封面或图片页。';
   $$('[data-album-jump]',album).forEach(b=>b.setAttribute('aria-pressed',String(current+1>=+b.dataset.albumJump&&current+1<=+(b.dataset.albumEnd||b.dataset.albumJump))));
  }
  thumbs.forEach((b,i)=>b.addEventListener('click',()=>setPage(i)));
  prev.addEventListener('click',()=>setPage(current-1));next.addEventListener('click',()=>setPage(current+1));
  $$('[data-album-jump]',album).forEach(b=>b.addEventListener('click',()=>setPage(+b.dataset.albumJump-1)));
  setPage(+(album.dataset.albumStart||1)-1);
 });
 const tabs=$$('[data-case]');function setTab(b,focus=false){tabs.forEach(t=>{const selected=t===b;t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;$('#'+t.dataset.case).hidden=!selected;});if(focus)b.focus();}
 tabs.forEach((b,i)=>{b.tabIndex=i===0?0:-1;b.addEventListener('click',()=>setTab(b));b.addEventListener('keydown',e=>{let idx=i;if(e.key==='ArrowRight')idx=(i+1)%tabs.length;else if(e.key==='ArrowLeft')idx=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=tabs.length-1;else return;e.preventDefault();setTab(tabs[idx],true);});});
 const dialog=$('#lightbox');if(!dialog)return;let collection=[],active=0,opener;
 function render(){const item=collection[active];$('#lightbox-image').src=item.src;$('#lightbox-image').alt=item.caption;$('#lightbox-caption').textContent=item.caption;$('.lightbox-count').textContent=`${active+1} / ${collection.length}`;$('.lightbox-prev').disabled=active===0;$('.lightbox-next').disabled=active===collection.length-1;}
 function move(n){active=Math.max(0,Math.min(collection.length-1,active+n));render();}
 $$('.image-zoom').forEach(b=>b.addEventListener('click',()=>{opener=b;const scope=b.closest('.gallery')||b.closest('[data-album]');if(scope?.matches('[data-album]')){const thumbs=$$('[data-album-src]',scope);collection=thumbs.map((t,i)=>({src:t.dataset.albumSrc,caption:albumCaption(scope,t,i,thumbs.length)}));active=collection.findIndex(i=>i.src===b.dataset.image);}else{const items=scope?$$('.image-zoom',scope):[b];collection=items.map(t=>({src:t.dataset.image,caption:t.dataset.caption}));active=items.indexOf(b);}render();dialog.showModal();document.body.classList.add('lightbox-open');$('[data-close]',dialog).focus();}));
 $('[data-close]',dialog).addEventListener('click',()=>dialog.close());$('.lightbox-prev',dialog).addEventListener('click',()=>move(-1));$('.lightbox-next',dialog).addEventListener('click',()=>move(1));dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}if(e.key==='ArrowRight'){e.preventDefault();move(1);}});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{document.body.classList.remove('lightbox-open');$('#lightbox-image').removeAttribute('src');opener?.focus();});
})();
