/** “Última llum”: four original bars at 104 BPM in a retro synth arrangement. */
export interface Tone {
  frequency: number;
  duration: number;
  volume: number;
  type: OscillatorType;
}
export const SCORE_STEP_SECONDS = 60 / 104 / 4;
export const SCORE_STEPS = 64;
export function scoreStep(index: number): Tone[] {
  const step = index % SCORE_STEPS,
    bar = Math.floor(step / 16),
    beat = step % 16;
  const root = [55, 65.406, 48.999, 43.654][bar];
  const melody = [0, 7, 12, 7, 3, 10, 7, 3, 0, 7, 15, 12, 7, 3, 10, 7];
  const tones: Tone[] = [];
  const note = (frequency: number, duration: number, volume: number, type: OscillatorType) =>
    tones.push({ frequency, duration, volume, type });
  if (beat % 4 === 0) note(root, 0.4, 0.25, 'triangle');
  if (beat % 2 === 0)
    note(root * 4 * Math.pow(2, melody[(beat + bar * 3) % 16] / 12), 0.32, 0.055, 'square');
  if (beat === 0 || beat === 8) {
    note(48, 0.13, 0.4, 'sine');
    note(95, 0.035, 0.12, 'sine');
  }
  if (beat === 4 || beat === 12) {
    note(180, 0.07, 0.07, 'triangle');
    note(310, 0.045, 0.035, 'square');
  }
  if (beat % 2 === 1) note(5500, 0.024, 0.015, 'square');
  if (beat === 0) {
    note(root * 2, 1.5, 0.06, 'sine');
    note(root * 2 * Math.pow(2, 7 / 12), 1.5, 0.035, 'sine');
  }
  return tones;
}
