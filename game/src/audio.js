// Sound, all synthesized with WebAudio: a piston engine whose pitch follows
// throttle and speed, wind noise that grows with airspeed, a chime for
// rings, thuds and scrapes for landings, a success arpeggio and a warning
// beep. Nothing is loaded from a file. The context starts on the first
// user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;

  function ensureStarted() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // Engine: sawtooth through a lowpass, plus a sub oscillator for body.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 27.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(filter);
    sub.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    sub.start();
    engineOsc._sub = sub;
    engineOsc._filter = filter;

    // Wind: looped noise through a bandpass.
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(band);
    band.connect(windGain);
    windGain.connect(master);
    noise.start();
  }

  function update(plane) {
    if (!ctx || !engineOsc) return;
    const rpm = plane.fuel > 0 ? 0.25 + plane.throttle * 0.75 : 0;
    const freq = 48 + rpm * 95 + plane.speed * 0.35;
    engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
    engineOsc._sub.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.08);
    engineOsc._filter.frequency.setTargetAtTime(300 + rpm * 700, ctx.currentTime, 0.1);
    engineGain.gain.setTargetAtTime(plane.fuel > 0 ? 0.05 + rpm * 0.09 : 0, ctx.currentTime, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.16, plane.speed * 0.0022), ctx.currentTime, 0.15);
  }

  function tone(freq, dur, type = 'sine', gain = 0.16, when = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, gain = 0.25, freq = 400) {
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    ensureStarted,
    update,
    ringChime() {
      tone(880, 0.22, 'sine', 0.18);
      tone(1318, 0.3, 'sine', 0.14, 0.07);
    },
    landingThud(hard) {
      noiseBurst(0.22, hard ? 0.4 : 0.2, hard ? 260 : 380);
      if (hard) tone(90, 0.25, 'square', 0.12);
    },
    scrape() {
      noiseBurst(0.3, 0.3, 1400);
    },
    crash() {
      noiseBurst(0.7, 0.5, 300);
      tone(60, 0.6, 'sawtooth', 0.2);
    },
    success() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, i * 0.11));
    },
    warningBeep() {
      tone(1180, 0.12, 'square', 0.07);
    },
    click() {
      tone(660, 0.06, 'triangle', 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
  };
}
