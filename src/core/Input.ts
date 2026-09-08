export class Input extends EventTarget {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private virtualKeys = new Map<string, string>();
  private touchMovement = { right: 0, forward: 0 };
  private abort = new AbortController();
  cameraDelta = 0;
  constructor() {
    super();
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
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) this.clear();
      },
      opts,
    );
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
    return codes.some((c) => this.held.has(c) || [...this.virtualKeys.values()].includes(c));
  }
  setVirtualKey(source: string, code: string): void {
    if (!this.down(code)) this.pressed.add(code);
    this.virtualKeys.set(source, code);
  }
  releaseVirtualKey(source: string): void {
    this.virtualKeys.delete(source);
  }
  setTouchMovement(right: number, forward: number): void {
    this.touchMovement = { right, forward };
  }
  movement(): { right: number; forward: number } {
    return {
      right: Math.max(
        -1,
        Math.min(
          1,
          this.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']) + this.touchMovement.right,
        ),
      ),
      forward: Math.max(
        -1,
        Math.min(
          1,
          this.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']) + this.touchMovement.forward,
        ),
      ),
    };
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
    this.virtualKeys.clear();
    this.setTouchMovement(0, 0);
    this.cameraDelta = 0;
    this.dispatchEvent(new Event('clear'));
  }
  dispose(): void {
    this.abort.abort();
    this.clear();
  }
}
