import { assetConfig } from '../assets/config';
import { scoreStep, SCORE_STEP_SECONDS } from '../assets/score';
/** An original, deterministic synth score. No external samples or recordings. */
export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private track: HTMLAudioElement | null = null;
  private paused = false;
  enabled = true;
  volume = 0.45;
  async start(): Promise<void> {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.connect(this.context.destination);
        this.engine = this.context.createOscillator();
        this.engine.type = 'sawtooth';
        this.engineGain = this.context.createGain();
        this.engineGain.gain.value = 0;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        this.engine.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.master);
        this.engine.start();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.applyVolume();
      if (assetConfig.music) {
        if (!this.track) {
          this.track = new Audio(assetConfig.music);
          this.track.loop = true;
        }
        this.track.volume = this.volume * 0.45;
        try {
          await this.track.play();
          return;
        } catch (error) {
          console.warn('Custom music could not play; using procedural score.', error);
          this.track = null;
        }
      }
      if (!this.timer) {
        this.nextTime = this.context.currentTime + 0.08;
        this.timer = setInterval(() => this.schedule(), 70);
      }
    } catch (error) {
      console.warn('Audio unavailable; game continues silently.', error);
    }
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) void this.start();
    else {
      void this.context?.suspend();
      this.track?.pause();
    }
  }
  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
    if (this.track) this.track.volume = volume * 0.45;
  }
  private applyVolume(): void {
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.enabled ? this.volume * (this.paused ? 0.2 : 0.55) : 0,
        this.context.currentTime,
        0.08,
      );
  }
  pause(paused: boolean): void {
    this.paused = paused;
    this.applyVolume();
    if (this.track) this.track.volume = this.volume * (paused ? 0.12 : 0.45);
  }
  private note(
    frequency: number,
    time: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'triangle',
  ): void {
    if (!this.context || !this.master) return;
    const osc = this.context.createOscillator(),
      gain = this.context.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(time);
    osc.stop(time + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  private schedule(): void {
    if (!this.context || this.context.state !== 'running') return;
    if (this.nextTime < this.context.currentTime - 0.5)
      this.nextTime = this.context.currentTime + 0.03;
    while (this.nextTime < this.context.currentTime + 0.2) {
      for (const tone of scoreStep(this.step))
        this.note(tone.frequency, this.nextTime, tone.duration, tone.volume, tone.type);
      this.step++;
      this.nextTime += SCORE_STEP_SECONDS;
    }
  }
  engineSpeed(speed: number | null): void {
    if (!this.context || !this.engine || !this.engineGain) return;
    this.engine.frequency.setTargetAtTime(
      35 + Math.abs(speed ?? 0) * 2.8,
      this.context.currentTime,
      0.1,
    );
    this.engineGain.gain.setTargetAtTime(
      speed === null ? 0 : 0.035,
      this.context.currentTime,
      0.12,
    );
  }
  horn(): void {
    if (this.context && this.enabled) {
      this.note(220, this.context.currentTime, 0.32, 0.16, 'sawtooth');
      this.note(277.18, this.context.currentTime, 0.32, 0.09, 'square');
    }
  }
  chime(): void {
    if (this.context && this.enabled)
      [440, 554.37, 659.25].forEach((f, i) =>
        this.note(f, this.context!.currentTime + i * 0.085, 0.35, 0.13),
      );
  }
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.track?.pause();
    this.engine?.stop();
    void this.context?.close();
  }
}
