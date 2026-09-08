/** Include tablets and iPadOS's desktop user agent, but never infer mobile from window size. */
export function isMobileDevice(
  device: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(device.userAgent) ||
    (device.platform === 'MacIntel' && device.maxTouchPoints > 1)
  );
}
