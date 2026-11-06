import { AdaptiveMusic, MUSIC_PROFILES } from './music.js';

// Original synthesized effects and an independent adaptive music bus. No media
// downloads or recording devices; volume and both mute choices stay local.
// [frequency Hz, offset seconds, duration seconds, waveform]
export const CUES = {
  select: [[520, 0, .045, 'sine']],
  place: [[440, 0, .07, 'sine'], [660, .07, .09, 'sine']],
  connect: [[620, 0, .065, 'sine'], [930, .065, .1, 'sine']],
  remove: [[420, 0, .07, 'triangle'], [260, .07, .09, 'triangle']],
  error: [[170, 0, .09, 'triangle'], [130, .1, .1, 'triangle']],
  start: [[330, 0, .08, 'sine'], [440, .08, .08, 'sine'], [660, .16, .14, 'sine']],
  pause: [[330, 0, .09, 'sine']],
  surge: [[440, 0, .1, 'triangle'], [660, .11, .1, 'triangle'], [880, .22, .13, 'triangle']],
  attack: [[220, 0, .13, 'sawtooth'], [165, .17, .13, 'sawtooth'], [220, .34, .13, 'sawtooth']],
  maintenance: [[440, 0, .12, 'triangle'], [330, .16, .15, 'triangle']],
  shutdown: [[260, 0, .13, 'triangle'], [185, .14, .13, 'triangle'], [110, .28, .18, 'triangle']],
  reboot: [[220, 0, .07, 'sine'], [330, .09, .07, 'sine'], [440, .18, .1, 'sine']],
  recovered: [[520, 0, .09, 'sine'], [780, .1, .15, 'sine']],
  complete: [[440, 0, .11, 'sine'], [550, .12, .11, 'sine'], [660, .24, .2, 'sine']],
};

export class SoundEffects {
  constructor({ storage, contextFactory } = {}) {
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
    this.contextFactory = contextFactory ?? (() => {
      const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.enabled = true;
    try { this.enabled = this.storage?.getItem('cal.sound.v1') !== 'off'; } catch { /* Optional persistence. */ }
    this.musicEnabled = true;
    this.volume = .65;
    try {
      this.musicEnabled = this.storage?.getItem('cal.music.v1') !== 'off';
      const value = this.storage?.getItem('cal.volume.v1');
      if (value != null && value !== '' && Number.isFinite(Number(value))) this.volume = Math.max(0, Math.min(1, Number(value)));
    } catch { /* Optional persistence. */ }
    this.context = null;
    this.master = null;
    this.effectsBus = null; this.musicBus = null; this.music = null;
    this.musicAvailable = true;
    this.musicIntent = { playing: false, mood: 'calm' };
    this.voices = new Set();
    this.lastCue = new Map();
    this.available = true;
  }
  // Call only from a real input handler: browsers require a user gesture before
  // starting audio. Unavailable/blocked audio never affects game actions.
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = this.contextFactory();
        if (!this.context) { this.available = false; return; }
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * .75;
        // Moderate bus levels plus compression leave headroom for simultaneous
        // incident cues and bass/lead notes. Compression is not a hard limiter.
        const compressor = this.context.createDynamicsCompressor?.();
        if (compressor) {
          compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 8;
          compressor.attack.value = .003; compressor.release.value = .16;
          this.master.connect(compressor); compressor.connect(this.context.destination);
        } else this.master.connect(this.context.destination);
        this.effectsBus = this.context.createGain(); this.effectsBus.gain.value = .4; this.effectsBus.connect(this.master);
        this.musicBus = this.context.createGain(); this.musicBus.gain.value = .4; this.musicBus.connect(this.master);
        this.music = new AdaptiveMusic({ context: this.context, output: this.musicBus });
      }
      if (['suspended', 'interrupted'].includes(this.context.state)) {
        Promise.resolve(this.context.resume()).then(() => this.syncMusic()).catch(() => {});
      } else this.syncMusic();
    } catch { this.available = false; }
  }
  setEnabled(enabled) {
    this.enabled = !!enabled;
    try { this.storage?.setItem('cal.sound.v1', this.enabled ? 'on' : 'off'); } catch { /* Optional persistence. */ }
    if (!this.enabled) this.silence();
    else this.unlock();
  }
  setMusicEnabled(enabled) {
    this.musicEnabled = !!enabled;
    if (this.musicEnabled) this.musicAvailable = true;
    try { this.storage?.setItem('cal.music.v1', this.musicEnabled ? 'on' : 'off'); } catch { /* Optional persistence. */ }
    if (!this.musicEnabled) this.music?.stop();
    else { this.unlock(); this.syncMusic(); }
  }
  setVolume(value) {
    if (!Number.isFinite(value)) return;
    this.volume = Math.max(0, Math.min(1, value));
    try { this.storage?.setItem('cal.volume.v1', String(this.volume)); } catch { /* Optional persistence. */ }
    if (this.master) {
      const gain = this.master.gain, now = this.context.currentTime;
      if (gain.cancelScheduledValues && gain.setTargetAtTime) { gain.cancelScheduledValues(now); gain.setTargetAtTime(this.volume * .75, now, .02); }
      else gain.value = this.volume * .75;
    }
    if (!this.volume) this.music?.stop();
    else this.syncMusic();
  }
  updateMusic(playing, mood = 'calm') {
    this.musicIntent = { playing: !!playing, mood: MUSIC_PROFILES[mood] ? mood : 'calm' };
    this.syncMusic();
  }
  syncMusic() {
    if (!this.music) return;
    if (!this.enabled || !this.musicEnabled || !this.musicAvailable || !this.volume || !this.musicIntent.playing || this.context.state !== 'running') { if (this.music.active) this.music.stop(); return; }
    try { this.music.start(this.musicIntent.mood); }
    catch { this.music.stop(); this.musicAvailable = false; }
  }
  musicStatus() {
    if (!this.available) return 'Audio unavailable';
    if (!this.enabled) return 'Audio muted';
    if (!this.musicEnabled) return 'Music off';
    if (!this.musicAvailable) return 'Music unavailable';
    if (!this.volume) return 'Volume 0%';
    if (!this.musicIntent.playing) return 'Music ready / paused';
    if (!this.context || this.context.state !== 'running') return 'Tap to enable audio';
    return `Music: ${MUSIC_PROFILES[this.music?.mood ?? 'calm'].label}`;
  }
  silence() {
    this.musicIntent.playing = false;
    this.music?.stop();
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* Already ended. */ }
      voice.disconnect();
    }
    this.voices.clear();
  }
  play(name) {
    if (!this.enabled || !this.volume || !this.available || !this.context || this.context.state !== 'running' || !CUES[name]) return false;
    const now = this.context.currentTime;
    if (now - (this.lastCue.get(name) ?? -Infinity) < .12 || this.voices.size + CUES[name].length > 12) return false;
    this.lastCue.set(name, now);
    try {
      for (const [frequency, offset, duration, type] of CUES[name]) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const at = now + offset;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.7, at + .008);
        gain.gain.exponentialRampToValueAtTime(.001, at + duration);
        oscillator.connect(gain); gain.connect(this.effectsBus);
        this.voices.add(oscillator);
        oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at); oscillator.stop(at + duration + .01);
      }
      return true;
    } catch { this.silence(); return false; }
  }
}
