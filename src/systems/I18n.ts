import { en, ca, type Language, type Localized, type TranslationKey } from '../data/locales';
export class I18n {
  private listeners = new Set<() => void>();
  constructor(public language: Language = 'en') {
    document.documentElement.lang = language;
  }
  t(key: TranslationKey, vars: Record<string, string | number> = {}): string {
    let text = { en, ca }[this.language][key];
    for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  }
  text(value: Localized): string {
    return value[this.language];
  }
  set(language: Language): void {
    this.language = language;
    document.documentElement.lang = language;
    this.listeners.forEach((l) => l());
  }
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
