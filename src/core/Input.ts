export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private abort = new AbortController();
  cameraDelta = 0;
  constructor() {
    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code))
          e.preventDefault();
        if (!this.held.has(e.code)) this.pressed.add(e.code);
        this.held.add(e.code);
      },
      opts,
    );
    window.addEventListener('keyup', (e) => this.held.delete(e.code), opts);
    window.addEventListener('blur', () => this.clear(), opts);
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.buttons === 2) this.cameraDelta -= e.movementX * 0.007;
      },
      opts,
    );
    document
      .getElementById('world')
      ?.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
  }
  down(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
  take(code: string): boolean {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }
  axis(negative: string[], positive: string[]): number {
    return Number(this.down(...positive)) - Number(this.down(...negative));
  }
  endFrame(): void {
    this.pressed.clear();
    this.cameraDelta = 0;
  }
  clear(): void {
    this.held.clear();
    this.pressed.clear();
    this.cameraDelta = 0;
  }
  dispose(): void {
    this.abort.abort();
    this.clear();
  }
}
