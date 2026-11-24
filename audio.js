// Local, original music and quiet Web Audio feedback for the shop.
// Audio is unlocked by a real pointer/key gesture; nothing autoplays on load.
const MUSIC_URL = new URL('./assets/audio/sunny-shop-backing.mp3', import.meta.url);
const LOOP_SECONDS = 128 * 60 / 112;
const STORAGE_KEY = 'little-crane-shop-sound';
const LEVELS_KEY = 'little-crane-shop-audio-levels';

export function createShopAudio(control) {
  const button = control.querySelector('#sound-toggle');
  const label = control.querySelector('[data-sound-label]');
  const settingsButton = control.querySelector('#sound-settings-toggle');
  const settings = control.querySelector('#sound-settings');
  const musicSlider = control.querySelector('#music-volume');
  const effectsSlider = control.querySelector('#effects-volume');
  let musicVolume = .52, effectsVolume = .48;
  try {
    const saved = JSON.parse(localStorage.getItem(LEVELS_KEY));
    if (typeof saved?.music === 'number' && Number.isFinite(saved.music)) musicVolume = Math.max(0, Math.min(1, saved.music));
    if (typeof saved?.effects === 'number' && Number.isFinite(saved.effects)) effectsVolume = Math.max(0, Math.min(1, saved.effects));
  } catch {}
  let enabled = true;
  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'off'; } catch {}
  let context, master, musicGain, effectsGain, musicSource, loading;
  let unlocked = false, stage = 'exterior', detail = false, mediaActive = false;
  let suspendTimer, openingNodes = [], disposed = false;
  let lastEffect = -Infinity;
  const hoverTimes = new Map();

  function updateButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? '关闭音乐与音效' : '开启音乐与音效');
    button.title = enabled ? '关闭音乐与音效' : '开启音乐与音效';
    label.textContent = enabled ? '声音开' : '声音关';
    control.classList.toggle('is-muted', !enabled);
  }
  function ramp(param, value, seconds = .15) {
    if (!context) return;
    param.cancelScheduledValues(context.currentTime);
    param.setTargetAtTime(value, context.currentTime, seconds / 3);
  }
  function updateMix() {
    if (!context) return;
    const worldLevel = stage === 'exterior' ? .76 : stage === 'opening' ? .86 : 1;
    ramp(musicGain.gain, mediaActive ? 0 : musicVolume * worldLevel * (detail ? .48 : 1), mediaActive ? .16 : .3);
    ramp(effectsGain.gain, effectsVolume, .06);
    ramp(master.gain, enabled && !document.hidden ? .82 : 0, .12);
  }
  function ensureContext() {
    if (context) return true;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      context = new AudioContext();
      master = context.createGain();
      musicGain = context.createGain();
      effectsGain = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -9; limiter.knee.value = 8;
      limiter.ratio.value = 5; limiter.attack.value = .003; limiter.release.value = .18;
      master.gain.value = 0; musicGain.gain.value = 0; effectsGain.gain.value = effectsVolume;
      musicGain.connect(master); effectsGain.connect(master);
      master.connect(limiter).connect(context.destination);
      return true;
    } catch { return false; }
  }
  async function loadMusic() {
    if (loading || musicSource || !context) return loading;
    loading = (async () => {
      const response = await fetch(MUSIC_URL);
      if (!response.ok) throw new Error('Music unavailable');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (disposed) return;
      musicSource = context.createBufferSource();
      musicSource.buffer = buffer;
      musicSource.loop = true;
      // Explicit bar length excludes the MP3 encoder's trailing padding.
      musicSource.loopStart = 0;
      musicSource.loopEnd = Math.min(LOOP_SECONDS, buffer.duration);
      musicSource.connect(musicGain); musicSource.start(); updateMix();
    })().catch(() => { loading = null; });
    return loading;
  }
  function unlock(event) {
    if (event && (!event.isTrusted || (event.type === 'keydown' && (event.ctrlKey || event.metaKey || event.altKey)))) return;
    if (!enabled || document.hidden || !ensureContext()) return;
    unlocked = true; clearTimeout(suspendTimer);
    context.resume().then(() => { updateMix(); loadMusic(); }).catch(() => {});
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  function renderLevels() {
    for (const [slider, value] of [[musicSlider, musicVolume], [effectsSlider, effectsVolume]]) {
      const percent = Math.round(value * 100);
      slider.value = percent;
      slider.setAttribute('aria-valuetext', percent + '%');
      slider.style.setProperty('--volume', percent + '%');
      control.querySelector(`output[for="${slider.id}"]`).value = percent + '%';
    }
  }
  function saveLevels() {
    try { localStorage.setItem(LEVELS_KEY, JSON.stringify({ music: musicVolume, effects: effectsVolume })); } catch {}
    renderLevels(); updateMix();
  }
  musicSlider.addEventListener('input', () => { musicVolume = Number(musicSlider.value) / 100; saveLevels(); });
  effectsSlider.addEventListener('input', () => { effectsVolume = Number(effectsSlider.value) / 100; saveLevels(); });
  effectsSlider.addEventListener('change', () => play('select'));
  function showSettings(open, returnFocus = false) {
    settings.hidden = !open;
    settingsButton.setAttribute('aria-expanded', String(open));
    if (returnFocus) settingsButton.focus({ preventScroll: true });
  }
  settingsButton.addEventListener('click', () => { showSettings(settings.hidden); play('select'); });
  control.querySelector('#close-sound-settings').addEventListener('click', () => showSettings(false, true));
  control.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !settings.hidden) { event.preventDefault(); event.stopPropagation(); showSettings(false, true); }
  });
  document.addEventListener('pointerdown', event => { if (!control.contains(event.target)) showSettings(false); });
  button.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off'); } catch {}
    updateButton();
    if (enabled) { unlock(); play('confirm'); }
    else {
      stopOpening(); updateMix(); clearTimeout(suspendTimer);
      suspendTimer = setTimeout(() => { if (!enabled) context?.suspend().catch(() => {}); }, 180);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.hidden) { stopOpening(); context.suspend().catch(() => {}); }
    else if (enabled && unlocked) context.resume().then(updateMix).catch(() => {});
  });

  const audible = () => enabled && unlocked && context?.state === 'running' && !document.hidden;
  function tone(frequency, time, duration, level, wave = 'sine', destination = effectsGain) {
    const osc = context.createOscillator(), envelope = context.createGain();
    osc.type = wave; osc.frequency.value = frequency;
    envelope.gain.setValueAtTime(.00001, time);
    envelope.gain.exponentialRampToValueAtTime(level, time + .007);
    envelope.gain.exponentialRampToValueAtTime(.00001, time + duration);
    osc.connect(envelope).connect(destination); osc.start(time); osc.stop(time + duration + .02);
    osc.onended = () => { osc.disconnect(); envelope.disconnect(); };
    return osc;
  }
  function noise(time, duration, level, filterType, frequency) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = .65;
    gain.gain.setValueAtTime(.00001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + .008);
    gain.gain.exponentialRampToValueAtTime(.00001, time + duration);
    source.connect(filter).connect(gain).connect(effectsGain); source.start(time);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    return source;
  }
  function bell(frequency, time, level = .1) {
    tone(frequency, time, 1.15, level);
    tone(frequency * 2.76, time, .36, level * .11);
    tone(frequency * 4.12, time, .16, level * .035);
  }
  function doorSound(time) {
    // Latch, short wooden hinge movement, then a small welcome bell.
    noise(time, .06, .25, 'bandpass', 1450);
    tone(185, time + .02, .1, .16, 'triangle');
    noise(time + .1, .58, .075, 'bandpass', 580);
    const hinge = tone(147, time + .12, .55, .045, 'triangle');
    hinge.frequency.setValueAtTime(147, time + .12);
    hinge.frequency.exponentialRampToValueAtTime(213, time + .38);
    hinge.frequency.exponentialRampToValueAtTime(168, time + .65);
    bell(1318.51, time + .38, .115);
    bell(1567.98, time + .57, .085);
  }
  function play(name) {
    if (!audible() || effectsVolume === 0) return;
    const now = context.currentTime;
    if (name !== 'door' && now - lastEffect < .065) return;
    lastEffect = now;
    const t = now + .01;
    if (name === 'door') doorSound(t);
    else if (name === 'hover') {
      tone(1046.5, t, .115, .085);
      tone(1567.98, t + .025, .09, .027);
    } else if (name === 'open' || name === 'confirm') {
      tone(659.25, t, .16, .14, 'triangle');
      tone(1046.5, t + .065, .24, .11);
    } else if (name === 'close') {
      tone(783.99, t, .13, .095);
      tone(523.25, t + .055, .16, .085);
    } else tone(880, t, .11, .075);
  }
  function hover(id) {
    if (!id || !audible()) return;
    const now = context.currentTime;
    if (now - (hoverTimes.get(id) ?? -Infinity) < .65) return;
    hoverTimes.set(id, now); play('hover');
  }
  function stopOpening() {
    openingNodes.forEach(node => { try { node.stop(); } catch {} });
    openingNodes = [];
  }
  function playOpening() {
    stopOpening(); if (!audible() || effectsVolume === 0) return;
    const t = context.currentTime;
    for (const [offset, frequency] of [[.59, 240], [1.47, 290]]) {
      const osc = tone(frequency, t + offset, .3, .095, 'sine');
      osc.frequency.exponentialRampToValueAtTime(frequency * 1.8, t + offset + .07);
      osc.frequency.exponentialRampToValueAtTime(frequency, t + offset + .29);
      openingNodes.push(osc);
    }
    for (const [offset, note] of [[1.29, 783.99], [1.38, 880], [1.49, 1046.5], [1.58, 1318.51]]) {
      openingNodes.push(tone(note, t + offset, .2, .057));
    }
  }
  function watchFrame(frame) {
    let cleanup = () => {};
    frame.addEventListener('load', () => {
      cleanup(); mediaActive = false; updateMix();
      if (frame.getAttribute('src') === 'about:blank') return;
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const checkMedia = () => {
          mediaActive = [...doc.querySelectorAll('video,audio')].some(media => !media.paused && !media.ended && !media.muted && media.volume > 0);
          updateMix();
        };
        const events = ['play', 'pause', 'ended', 'volumechange', 'emptied', 'abort'];
        events.forEach(name => doc.addEventListener(name, checkMedia, true));
        const click = event => {
          if (event.target.closest('.image-zoom,[data-album-next],[data-album-prev],[data-album-src],[data-case]')) play('select');
          else if (event.target.closest('[data-close]')) play('close');
        };
        const dismissSettings = () => showSettings(false);
        doc.addEventListener('click', click);
        doc.addEventListener('pointerdown', dismissSettings);
        const observer = new MutationObserver(checkMedia);
        observer.observe(doc.documentElement, { childList: true, subtree: true });
        cleanup = () => { observer.disconnect(); events.forEach(name => doc.removeEventListener(name, checkMedia, true)); doc.removeEventListener('click', click); doc.removeEventListener('pointerdown', dismissSettings); };
        checkMedia();
      } catch { /* The host still works if a future external project uses another origin. */ }
    });
  }
  // The same small control stays reachable above the browser's native modal layer.
  const placeControl = () => {
    const dialogs = [...document.querySelectorAll('dialog[open]')];
    const host = dialogs.at(-1) || document.body;
    if (control.parentElement !== host) { showSettings(false); host.append(control); }
  };
  const dialogObserver = new MutationObserver(placeControl);
  document.querySelectorAll('dialog').forEach(dialog => dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  updateButton(); renderLevels();

  return {
    play, hover, playOpening, stopOpening, watchFrame,
    setScene(value) { stage = value; updateMix(); },
    setDetail(value) { detail = value; if (!value) mediaActive = false; updateMix(); },
    get state() { return { enabled, unlocked, context: context?.state || 'locked', musicLoaded: !!musicSource, stage, detail, mediaActive, musicVolume, effectsVolume, musicLevel: musicGain?.gain.value ?? 0, effectsLevel: effectsGain?.gain.value ?? 0, loopSeconds: musicSource?.loopEnd ?? 0 }; },
    dispose() { disposed = true; stopOpening(); dialogObserver.disconnect(); context?.close(); }
  };
}
