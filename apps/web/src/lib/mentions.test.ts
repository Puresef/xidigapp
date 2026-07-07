import { describe, expect, it } from 'vitest';

import { MAX_MENTIONS_PER_CONTENT, parseMentions } from './mentions';

describe('parseMentions', () => {
  it('extracts a single mention', () => {
    expect(parseMentions('hey @maxamed can you help?')).toEqual(['maxamed']);
  });

  it('extracts multiple mentions in first-seen order, deduped and lowercased', () => {
    expect(parseMentions('@Amina @bilal thanks @amina again')).toEqual(['amina', 'bilal']);
  });

  it('matches a mention at the very start of the text', () => {
    expect(parseMentions('@fatima look at this')).toEqual(['fatima']);
  });

  it('does NOT treat an email address as a mention', () => {
    expect(parseMentions('email me at cabdi@example.com')).toEqual([]);
  });

  it('ignores handles shorter than 3 characters', () => {
    expect(parseMentions('@ab is too short but @abc is fine')).toEqual(['abc']);
  });

  it('does not yield a bogus 30-char prefix from an over-long token', () => {
    const longToken = 'a'.repeat(40);
    expect(parseMentions(`@${longToken}`)).toEqual([]);
  });

  it('handles underscores and digits inside a handle', () => {
    expect(parseMentions('shout out to @dev_2026')).toEqual(['dev_2026']);
  });

  it('stops the handle at punctuation', () => {
    expect(parseMentions('great work, @hodan!')).toEqual(['hodan']);
  });

  it('returns an empty array for empty or mention-free text', () => {
    expect(parseMentions('')).toEqual([]);
    expect(parseMentions('no mentions here')).toEqual([]);
  });

  it('caps the number of mentions returned', () => {
    const many = Array.from({ length: 30 }, (_, i) => `@user_${i}`).join(' ');
    expect(parseMentions(many)).toHaveLength(MAX_MENTIONS_PER_CONTENT);
  });
});
