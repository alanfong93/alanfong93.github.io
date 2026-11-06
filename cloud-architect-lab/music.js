// Original looping electronic score. Scheduling uses the audio clock, never the
// simulation clock; a stalled renderer skips old beats instead of playing a burst.
export const MUSIC_PROFILES = {
  calm: { label: 'Steady', rank: 0, bpm: 88, root: 48, scale: [0, 2, 4, 7, 9], melody: [0, 2, 3, 4, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 2], wave: 'sine', length: .88 },
  elevated: { label: 'Rising', rank: 1, bpm: 112, root: 45, scale: [0, 3, 5, 7, 10], melody: [0, 2, 3, 1, 4, 3, 2, 3, 0, 1, 3, 4, 3, 2, 1, 2], wave: 'triangle', length: .72 },
  tense: { label: 'Tense', rank: 2, bpm: 132, root: 43, scale: [0, 1, 3, 7, 10], melody: [0, 3, 1, 3, 2, 4, 1, 3, 0, 3, 2, 3, 1, 4, 2, 1], wave: 'triangle', length: .56 },
  critical: { label: 'Critical', rank: 3, bpm: 152, root: 42, scale: [0, 1, 3, 6, 7], melody: [3, 0, 2, 0, 4, 1, 3, 0, 3, 1, 2, 0, 4, 2, 1, 0], wave: 'sawtooth', length: .42 },
};
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

export function musicNotes(profile, step) {
  const p = MUSIC_PROFILES[profile] ?? MUSIC_PROFILES.calm;
  const eighth = 30 / p.bpm;
  const degree = p.melody[step % p.melody.length];
  const notes = [{ frequency: hz(p.root + 12 + p.scale[degree]), duration: eighth * p.length, volume: profile === 'critical' ? .15 : .22, wave: p.wave }];
  if (step % 4 === 0) notes.push({ frequency: hz(p.root - 12 + (Math.floor(step / 16) % 2 ? 7 : 0)), duration: eighth * 3.5, volume: .18, wave: 'triangle' });
  if (step % 2 === 0) notes.push({ frequency: step % 4 ? 1100 : 95, duration: .045, volume: .035, wave: 'sine' });
  return notes;
}

export function scheduleMusicStep(context, output, profile, step, at, onEnded = () => {}) {
  return musicNotes(profile, step).map(note => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, at);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(note.volume, at + .012);
    envelope.gain.exponentialRampToValueAtTime(.001, at + note.duration);
    oscillator.connect(envelope); envelope.connect(output);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); onEnded(oscillator); };
    oscillator.start(at); oscillator.stop(at + note.duration + .015);
    return oscillator;
  });
}

export class AdaptiveMusic {
  constructor({ context, output, setTimer = (fn, delay) => globalThis.setInterval(fn, delay), clearTimer = id => globalThis.clearInterval(id) }) {
    this.context = context; this.output = output;
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.active = false; this.timer = null; this.voices = new Set();
    this.mood = 'calm'; this.requestedMood = 'calm'; this.pendingSince = 0;
    this.step = 0; this.nextAt = 0; this.generation = 0;
  }
  start(mood = 'calm') {
    if (!MUSIC_PROFILES[mood]) mood = 'calm';
    this.requestMood(mood);
    if (this.active) return;
    this.active = true; this.mood = mood; this.step = 0;
    this.nextAt = this.context.currentTime + .03;
    const generation = ++this.generation;
    this.schedule();
    this.timer = this.setTimer(() => {
      if (!this.active || generation !== this.generation) return;
      try { this.schedule(); } catch { this.stop(); }
    }, 25);
    this.timer?.unref?.();
  }
  requestMood(mood) {
    if (!MUSIC_PROFILES[mood]) mood = 'calm';
    if (this.requestedMood !== mood) { this.requestedMood = mood; this.pendingSince = this.context.currentTime; }
  }
  schedule() {
    if (!this.active || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // A throttled tab/context must not catch up hundreds of missed beats.
    if (this.nextAt < now - .05) this.nextAt = now + .02;
    let scheduled = 0;
    while (this.nextAt < now + .12 && scheduled++ < 4) {
      const requested = MUSIC_PROFILES[this.requestedMood];
      const current = MUSIC_PROFILES[this.mood];
      if (this.step % 2 === 0 && (requested.rank > current.rank || now - this.pendingSince >= 2)) this.mood = this.requestedMood;
      const notes = musicNotes(this.mood, this.step);
      if (this.voices.size + notes.length <= 32) {
        for (const voice of scheduleMusicStep(this.context, this.output, this.mood, this.step, this.nextAt, v => this.voices.delete(v))) this.voices.add(voice);
      }
      this.nextAt += 30 / MUSIC_PROFILES[this.mood].bpm;
      this.step++;
    }
  }
  stop() {
    this.active = false; this.generation++;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } voice.disconnect(); }
    this.voices.clear();
  }
}
