import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageFromPath, updateLanguagePath } from '../src/systems/I18n';

afterEach(() => vi.unstubAllGlobals());

describe('language URLs', () => {
  it.each([
    ['/ca', 'ca'],
    ['/en', 'en'],
    ['/ca/', 'ca'],
    ['/en/map', 'en'],
    ['/', undefined],
    ['/es', undefined],
    ['/catalan', undefined],
    ['/en-US', undefined],
    ['/map/ca', undefined],
  ])('detects the language in %s', (pathname, expected) => {
    expect(languageFromPath(pathname)).toBe(expected);
  });

  it('detects languages relative to the configured deployment directory', () => {
    expect(languageFromPath('/malandrins/ca/', '/malandrins/')).toBe('ca');
    expect(languageFromPath('/malandrins/en', '/malandrins/')).toBe('en');
    expect(languageFromPath('/malandrins/', '/malandrins/')).toBeUndefined();
    expect(languageFromPath('/ca', '/malandrins/')).toBeUndefined();
  });

  it('switches the URL language while preserving the rest of the URL and history state', () => {
    vi.stubGlobal('location', { href: 'https://example.com/ca/map?campaign=summer#controls' });
    const state = { screen: 'settings' };
    const replaceState = vi.fn();
    vi.stubGlobal('history', { state, replaceState });
    updateLanguagePath('en');
    expect(replaceState).toHaveBeenCalledWith(
      state,
      '',
      new URL('https://example.com/en/map?campaign=summer#controls'),
    );
  });

  it.each(['/', '/es', '/catalan'])(
    'keeps URLs without a supported language unchanged: %s',
    (path) => {
      vi.stubGlobal('location', { href: `https://example.com${path}` });
      const replaceState = vi.fn();
      vi.stubGlobal('history', { state: null, replaceState });
      updateLanguagePath('ca');
      expect(replaceState).not.toHaveBeenCalled();
    },
  );
});
