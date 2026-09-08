import { Input } from '../core/Input';
import { isMobileDevice } from '../core/mobile';
import { I18n } from '../systems/I18n';
import type { TranslationKey } from '../data/locales';

export class TouchControls {
  readonly mobile = isMobileDevice();
  private element = document.createElement('div');
  private abort = new AbortController();
  private pointers = new Map<number, HTMLElement>();
  private joystickPointer: number | null = null;
  private driving = false;
  private stick: HTMLElement;
  private thumb: HTMLElement;

  constructor(
    root: HTMLElement,
    private input: Input,
    private i18n: I18n,
  ) {
    root.classList.toggle('mobile', this.mobile);
    this.element.id = 'touch-controls';
    this.element.hidden = true;
    this.element.setAttribute('role', 'group');
    this.element.innerHTML = `<div class="touch-movement"><div class="touch-stick" role="group" data-label="touchJoystick"><span class="stick-arrows" aria-hidden="true">↑<br>← &nbsp; →<br>↓</span><span class="stick-thumb"></span></div><span class="touch-caption" data-text="move"></span></div><div class="touch-actions"><div class="touch-camera"><button type="button" data-key="KeyQ" data-label="touchCameraLeft">↶</button><span data-text="touchCamera"></span><button type="button" data-key="KeyR" data-label="touchCameraRight">↷</button></div><div class="touch-action-grid"><button type="button" class="touch-interact" data-key="KeyE" data-label="interact" data-text="touchInteract"></button><button type="button" data-key="KeyF" data-label="vehicle" data-text="touchCar"></button><button type="button" data-motion data-key="ShiftLeft" data-label="run" data-text="run"></button><button type="button" data-key="KeyH" data-label="horn" data-text="horn" hidden></button></div></div>`;
    root.append(this.element);
    this.stick = this.element.querySelector('.touch-stick')!;
    this.thumb = this.element.querySelector('.stick-thumb')!;
    this.localize();
    if (!this.mobile) return;
    const opts = { signal: this.abort.signal };
    this.element.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    this.element.addEventListener(
      'pointerdown',
      (e) => {
        if (this.element.hidden || e.button !== 0) return;
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-key], .touch-stick');
        if (!target || (target === this.stick && this.joystickPointer !== null)) return;
        e.preventDefault();
        target.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, target);
        target.classList.add('held');
        if (target === this.stick) {
          this.joystickPointer = e.pointerId;
          this.moveStick(e);
        } else this.input.setVirtualKey(`touch-${e.pointerId}`, target.dataset.key!);
      },
      opts,
    );
    this.element.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerId === this.joystickPointer) this.moveStick(e);
      },
      opts,
    );
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      this.element.addEventListener(event, (e) => this.release(e.pointerId), opts);
    // Preserve button activation from keyboards and assistive technology.
    this.element.addEventListener(
      'click',
      (e) => {
        if (this.element.hidden || e.detail !== 0) return;
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
        if (target) {
          this.input.setVirtualKey('touch-click', target.dataset.key!);
          this.input.releaseVirtualKey('touch-click');
        }
      },
      opts,
    );
    input.addEventListener('clear', () => this.reset(), opts);
    window.addEventListener('resize', () => this.reset(), opts);
  }
  private moveStick(e: PointerEvent): void {
    const rect = this.stick.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy);
    const scale = Math.min(1, radius / (distance || 1));
    this.thumb.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    const strength = Math.max(0, (Math.min(1, distance / radius) - 0.15) / 0.85);
    this.input.setTouchMovement(
      (dx / (distance || 1)) * strength,
      (-dy / (distance || 1)) * strength,
    );
  }
  private release(id: number): void {
    const target = this.pointers.get(id);
    if (!target) return;
    this.pointers.delete(id);
    this.input.releaseVirtualKey(`touch-${id}`);
    if (![...this.pointers.values()].includes(target)) target.classList.remove('held');
    if (id === this.joystickPointer) {
      this.joystickPointer = null;
      this.input.setTouchMovement(0, 0);
      this.thumb.style.transform = '';
    }
    if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
  }
  private reset(): void {
    for (const id of this.pointers.keys()) this.release(id);
  }
  setActive(active: boolean): void {
    this.element.hidden = !this.mobile || !active;
    if (this.element.hidden) this.reset();
  }
  setDriving(driving: boolean): void {
    if (this.driving === driving) return;
    this.reset();
    this.driving = driving;
    const motion = this.element.querySelector<HTMLElement>('[data-motion]')!;
    motion.dataset.key = driving ? 'Space' : 'ShiftLeft';
    motion.dataset.label = driving ? 'brake' : 'run';
    motion.dataset.text = driving ? 'touchBrake' : 'run';
    this.element.querySelector<HTMLElement>('[data-key="KeyH"]')!.hidden = !driving;
    this.element.querySelector<HTMLElement>('[data-key="KeyE"]')!.hidden = driving;
    this.localize();
  }
  localize(): void {
    this.element.setAttribute('aria-label', this.i18n.t('touchControls'));
    this.element
      .querySelectorAll<HTMLElement>('[data-label]')
      .forEach((el) =>
        el.setAttribute('aria-label', this.i18n.t(el.dataset.label as TranslationKey)),
      );
    this.element
      .querySelectorAll<HTMLElement>('[data-text]')
      .forEach((el) => (el.textContent = this.i18n.t(el.dataset.text as TranslationKey)));
  }
  dispose(): void {
    this.reset();
    this.abort.abort();
    this.element.remove();
  }
}
