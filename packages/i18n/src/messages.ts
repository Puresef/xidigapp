/**
 * A message that varies with a numeric `count` param. Categories follow CLDR
 * plural rules; English and Somali both use exactly `one` / `other`.
 */
export interface PluralMessage {
  readonly one: string;
  readonly other: string;
}

/**
 * A dictionary value: a plain string (with optional `{param}` placeholders)
 * or a plural form selected by `params.count`.
 */
export type Message = string | PluralMessage;

export function isPluralMessage(message: Message): message is PluralMessage {
  return typeof message !== 'string';
}
