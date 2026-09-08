import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/core/Input';
import { isMobileDevice } from '../src/core/mobile';

let input: Input;
function key(type: string, code: string) {
  window.dispatchEvent(Object.assign(new Event(type), { code }));
}
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { getElementById: () => null, hidden: false }),
  );
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLSelectElement', class {});
  input = new Input();
});
afterEach(() => {
  input.dispose();
  vi.unstubAllGlobals();
});
describe('combined keyboard and touch input', () => {
  it('retains held touch movement across frames and consumes action presses once', () => {
    input.setTouchMovement(0.3, 0.8);
    input.setVirtualKey('finger-1', 'KeyE');
    expect(input.take('KeyE')).toBe(true);
    expect(input.take('KeyE')).toBe(false);
    input.endFrame();
    expect(input.movement()).toEqual({ right: 0.3, forward: 0.8 });
    expect(input.down('KeyE')).toBe(true);
    input.releaseVirtualKey('finger-1');
    expect(input.down('KeyE')).toBe(false);
  });
  it('releasing one finger does not release a second finger or a physical key', () => {
    key('keydown', 'Space');
    input.setVirtualKey('finger-1', 'Space');
    input.setVirtualKey('finger-2', 'Space');
    input.releaseVirtualKey('finger-1');
    key('keyup', 'Space');
    expect(input.down('Space')).toBe(true);
    input.releaseVirtualKey('finger-2');
    expect(input.down('Space')).toBe(false);
    key('keydown', 'KeyW');
    input.setTouchMovement(0, 1);
    expect(input.movement().forward).toBe(1);
    input.setTouchMovement(0, 0);
    expect(input.movement().forward).toBe(1);
  });
  it.each(['blur', 'visibilitychange', 'screen'])('clears every input source on %s', (event) => {
    input.setTouchMovement(1, 1);
    input.setVirtualKey('finger-1', 'KeyE');
    key('keydown', 'KeyW');
    const cleared = vi.fn();
    input.addEventListener('clear', cleared);
    if (event === 'blur') window.dispatchEvent(new Event(event));
    else if (event === 'visibilitychange') {
      Object.assign(document, { hidden: true });
      document.dispatchEvent(new Event(event));
    } else input.clear();
    expect(input.movement()).toEqual({ right: 0, forward: 0 });
    expect(input.down('KeyW', 'KeyE')).toBe(false);
    expect(input.take('KeyE')).toBe(false);
    expect(cleared).toHaveBeenCalledOnce();
  });
});
it('identifies phones and tablets without enabling touch controls for desktop touchscreens', () => {
  const device = (userAgent: string, platform = '', maxTouchPoints = 5) => ({
    userAgent,
    platform,
    maxTouchPoints,
  });
  expect(isMobileDevice(device('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))).toBe(
    true,
  );
  expect(isMobileDevice(device('Mozilla/5.0 (Linux; Android 15; Pixel 9)'))).toBe(true);
  expect(isMobileDevice(device('Mozilla/5.0 (Linux; Android 15; Tablet)'))).toBe(true);
  expect(isMobileDevice(device('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel'))).toBe(true);
  expect(isMobileDevice(device('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0))).toBe(
    false,
  );
  expect(isMobileDevice(device('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 10))).toBe(
    false,
  );
});
