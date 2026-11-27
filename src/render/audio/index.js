// The sound registry (graphics overhaul G1, docs/OVERHAUL.md section 4.6).
//
// Like the art registry: sounds are asked for by id (play('clash')), never by
// file. A skin may give an id a recording (skin.json "sounds": { "clash":
// { "src": "assets/sounds/clash.ogg" } }); every id without one is synthesised
// here with WebAudio, so the game always has its sounds and none need
// recording. Nothing plays until the player first clicks or presses a key
// (browsers require it, and it is polite). Volumes come from Settings:
// master x effects for sounds, master x music for music (an empty slot for now).
//
// Cosmetic only: sounds never touch the game, and their small random wobble
// uses this file's own little generator, never the game's dice.

/** Every sound id the game uses, with its synthesised recipe. */
export const SOUNDS = Object.freeze({
  click: { tones: [{ type: 'square', freq: 880, to: 660, at: 0, dur: 0.04, gain: 0.18 }] },
  endTurn: { tones: [{ type: 'sawtooth', freq: 196, to: 220, at: 0, dur: 0.35, gain: 0.25 }, { type: 'sawtooth', freq: 294, to: 330, at: 0.05, dur: 0.45, gain: 0.18 }, { type: 'sine', freq: 392, at: 0.1, dur: 0.5, gain: 0.12 }] },
  clash: { noise: { at: 0, dur: 0.18, gain: 0.45, filter: 3200 }, tones: [{ type: 'triangle', freq: 1240, to: 980, at: 0, dur: 0.22, gain: 0.25 }, { type: 'triangle', freq: 1870, to: 1500, at: 0.02, dur: 0.18, gain: 0.15 }] },
  bow: { tones: [{ type: 'triangle', freq: 180, to: 90, at: 0, dur: 0.12, gain: 0.35 }], noise: { at: 0.04, dur: 0.2, gain: 0.15, filter: 1800 } },
  built: { tones: [{ type: 'square', freq: 523, at: 0, dur: 0.08, gain: 0.12 }, { type: 'square', freq: 659, at: 0.09, dur: 0.08, gain: 0.12 }, { type: 'square', freq: 784, at: 0.18, dur: 0.16, gain: 0.12 }] },
  techDone: { tones: [{ type: 'sine', freq: 1046, at: 0, dur: 0.6, gain: 0.2 }, { type: 'sine', freq: 1568, at: 0.04, dur: 0.6, gain: 0.12 }, { type: 'sine', freq: 2093, at: 0.08, dur: 0.5, gain: 0.06 }] },
  cityFounded: { tones: [{ type: 'triangle', freq: 392, at: 0, dur: 0.2, gain: 0.2 }, { type: 'triangle', freq: 523, at: 0.15, dur: 0.2, gain: 0.2 }, { type: 'triangle', freq: 659, at: 0.3, dur: 0.4, gain: 0.22 }] },
});

/**
 * The audio player for a window. Returns { play(id), setVolumes({ master, effects, music }),
 * setOverrides(skin.sounds), unlocked }.
 */
export function createAudio(win) {
  const AC = win?.AudioContext ?? win?.webkitAudioContext;
  let ctx = null;
  let unlocked = false;
  let volumes = { master: 0.7, effects: 0.7, music: 0.7 };
  let overrides = {};
  let seed = 12345;
  const wobble = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

  const unlock = () => {
    if (unlocked || !AC) return;
    unlocked = true;
    try { ctx = new AC(); } catch { ctx = null; }
  };
  if (win?.addEventListener) {
    win.addEventListener('pointerdown', unlock, { capture: true });
    win.addEventListener('keydown', unlock, { capture: true });
  }

  function tone(t, start, level) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = t.type;
    const f = t.freq * (1 + (wobble() - 0.5) * 0.02);
    osc.frequency.setValueAtTime(f, start + t.at);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.at + t.dur);
    amp.gain.setValueAtTime(0.0001, start + t.at);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, t.gain * level), start + t.at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + t.at + t.dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(start + t.at);
    osc.stop(start + t.at + t.dur + 0.05);
  }

  function noise(n, start, level) {
    const len = Math.ceil(ctx.sampleRate * n.dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (wobble() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = n.filter ?? 2000;
    const amp = ctx.createGain();
    amp.gain.value = n.gain * level;
    src.connect(filter).connect(amp).connect(ctx.destination);
    src.start(start + n.at);
  }

  return {
    get unlocked() { return unlocked; },
    /** Play a sound by id. Returns true if something was played. */
    play(id) {
      const level = volumes.master * volumes.effects;
      if (!unlocked || !ctx || level <= 0) return false;
      const recording = overrides[id];
      if (recording?.src && win.Audio) {
        const a = new win.Audio(recording.src);
        a.volume = Math.min(1, level);
        a.play().catch(() => {});
        return true;
      }
      const recipe = SOUNDS[id];
      if (!recipe) return false;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const start = ctx.currentTime + 0.005;
      for (const t of recipe.tones ?? []) tone(t, start, level);
      if (recipe.noise) noise(recipe.noise, start, level);
      return true;
    },
    setVolumes(v) { volumes = { ...volumes, ...v }; },
    setOverrides(sounds) { overrides = sounds ?? {}; },
  };
}
