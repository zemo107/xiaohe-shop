import { artwork } from './assets/opening-final/layers.js';

// The selected Image artwork is reconstructed from non-overlapping masks.
// Its lettering, signature and final composition remain unchanged.
export function createOpening(root, { preview = false } = {}) {
  const base = new URL('./assets/opening-final/', import.meta.url);
  const asset = name => new URL(`${name}.png`, base).href;
  const layerMarkup = artwork.layers.map(l => `<div class="intro-prop" data-art-layer="${l.name}" style="left:${l.x / artwork.width * 100}%;top:${l.y / artwork.height * 100}%;width:${l.width / artwork.width * 100}%;height:${l.height / artwork.height * 100}%"><img src="${asset(l.name)}" alt="" draggable="false"></div>`).join('');
  root.innerHTML = `
    <div class="intro-content">
      <div class="intro-stage">
        <h1 class="intro-sr-only">颉钟鹤个人作品集</h1>
        <div class="intro-title-rig" aria-hidden="true" style="--art-ratio:${artwork.width} / ${artwork.height}">
          <img class="intro-composite" src="${asset('title-composite')}" alt="" draggable="false">
          <canvas class="intro-title-canvas" width="${artwork.width}" height="${artwork.height}"></canvas>
          ${layerMarkup}
        </div>
      </div>
      <div class="intro-controls"><button id="enter-game">${preview ? '重播开场' : '进入杂货铺'}<span aria-hidden="true">${preview ? '↻' : '→'}</span></button></div>
    </div>`;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rig = root.querySelector('.intro-title-rig');
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const layers = [...root.querySelectorAll('[data-art-layer]')];
  const body = new Image(); body.src = asset('title-body');
  const ready = Promise.all([body.decode().catch(() => {}), ...Array.from(root.querySelectorAll('img'), i => i.decode().catch(() => {}))]);
  let animations = [], raf = 0, run = 0;

  function draw(elapsed = 10) {
    if (!body.naturalWidth || !ctx) return;
    const w = artwork.width, h = artwork.height;
    ctx.clearRect(0, 0, w, h);
    const pulse = t => t < 0 ? 0 : Math.exp(-t * 3.5);
    const amplitude = reduced.matches ? 0 : pulse(elapsed - .52) * 16 + pulse(elapsed - 1.5) * 21;
    if (amplitude < .1) { ctx.drawImage(body, 0, 0); return; }
    // A decaying vertical wave runs through the complete title and signature.
    const count = 180, strip = w / count;
    for (let i = 0; i < count; i++) {
      const x = i * strip, width = Math.min(strip + .6, w - x);
      const phase = i / count * Math.PI * 2.4 - elapsed * 18;
      const dy = Math.sin(phase) * amplitude;
      const scale = 1 + Math.cos(phase + .6) * amplitude / h * .5;
      ctx.drawImage(body, x, 0, width, h, x, dy + (h - h * scale) / 2, width, h * scale);
    }
  }
  function animate(el, frames, options) {
    const animation = el.animate(frames, { fill: 'both', ...options });
    animations.push(animation); return animation;
  }
  function stop() {
    run++; cancelAnimationFrame(raf); raf = 0;
    for (const animation of animations) animation.pause();
  }
  async function play() {
    stop(); const current = run;
    for (const animation of animations) animation.cancel();
    animations = [];
    await ready;
    if (current !== run) return;
    root.classList.remove('intro-static');
    root.classList.toggle('intro-reduced', reduced.matches);
    root.classList.toggle('intro-layered', !!ctx && !!body.naturalWidth && !reduced.matches);
    draw();
    if (reduced.matches) return;

    animate(rig, [
      { opacity: 0, transform: 'translateY(-85px) scale(.74,1.18) rotate(-4deg)', offset: 0 },
      { opacity: 1, transform: 'translateY(-38px) scale(.89,1.12) rotate(-2deg)', offset: .12 },
      { opacity: 1, transform: 'translateY(20px) scale(1.12,.68) rotate(1deg)', offset: .25 },
      { transform: 'translateY(-13px) scale(.94,1.1) rotate(-1deg)', offset: .4 },
      { transform: 'translateY(0) scale(1,1) rotate(0deg)', offset: .52 },
      { transform: 'translateY(8px) scale(.89,.8) rotate(-1.5deg)', offset: .65 },
      { transform: 'translateY(-7px) scale(1.055,1.12) rotate(.8deg)', offset: .77 },
      { transform: 'translateY(3px) scale(.99,.97) rotate(-.3deg)', offset: .9 },
      { opacity: 1, transform: 'translateY(0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration: 2100, delay: 100, easing: 'cubic-bezier(.3,.08,.26,1)' });

    const delays = { sprout: 1290, leaf: 1380, flower: 1490, 'rays-left': 1510, 'rays-right': 1580 };
    layers.forEach((el, i) => {
      const centerX = el.offsetLeft + el.offsetWidth / 2;
      const centerY = el.offsetTop + el.offsetHeight / 2;
      const dx = (rig.clientWidth / 2 - centerX) * .16;
      const dy = (rig.clientHeight / 2 - centerY) * .16;
      const angle = i % 2 ? 24 : -24;
      animate(el, [
        { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(.08,.25) rotate(${angle}deg)` },
        { opacity: 1, transform: `translate(0,-6px) scale(1.12,1.15) rotate(${-angle * .18}deg)`, offset: .6 },
        { opacity: 1, transform: 'translate(0,2px) scale(.97,.96) rotate(1deg)', offset: .82 },
        { opacity: 1, transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
      ], { duration: 780, delay: delays[el.dataset.artLayer], easing: 'cubic-bezier(.16,.72,.3,1)' });
    });
    for (const el of root.querySelectorAll('.intro-controls')) {
      animate(el, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: 2260, easing: 'ease-out' });
    }
    const start = performance.now();
    const tick = now => {
      if (current !== run) return;
      const elapsed = (now - start) / 1000;
      draw(elapsed);
      if (elapsed < 3.1) raf = requestAnimationFrame(tick);
      else {
        // Use the original composite at rest, avoiding subpixel seams between masks.
        root.classList.add('intro-static');
        raf = 0;
      }
    };
    raf = requestAnimationFrame(tick);
  }
  if (preview) root.querySelector('#enter-game').addEventListener('click', play);
  return { play, stop, ready, duration: 6800 };
}
