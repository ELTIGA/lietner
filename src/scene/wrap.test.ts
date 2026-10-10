import { describe, expect, it } from 'vitest';

import { isRtl, wrapText } from './wrap';

// One unit per code point keeps the expectations readable.
const measure = (text: string) => Array.from(text).length;

describe('wrapText', () => {
  it('breaks between words', () => {
    expect(wrapText('the quick brown fox', 10, measure)).toEqual(['the quick', 'brown fox']);
  });

  it('keeps explicit line breaks', () => {
    expect(wrapText('one\ntwo', 10, measure)).toEqual(['one', 'two']);
  });

  it('keeps punctuation with the word before it', () => {
    expect(wrapText('hello, world', 6, measure)).toEqual(['hello,', 'world']);
  });

  it('breaks Chinese at word boundaries without spaces', () => {
    const lines = wrapText('我喜欢学习中文和日语', 4, measure);
    expect(lines.join('')).toBe('我喜欢学习中文和日语');
    expect(lines.every((line) => measure(line) <= 4)).toBe(true);
    expect(lines.length).toBeGreaterThan(2);
  });

  it('breaks Thai at word boundaries', () => {
    const text = 'ฉันชอบเรียนภาษาไทย';
    const lines = wrapText(text, 8, measure);
    expect(lines.join('')).toBe(text);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => measure(line) <= 8)).toBe(true);
  });

  it('splits a word longer than the line between characters', () => {
    expect(wrapText('abcdefghij', 4, measure)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('never splits a grapheme cluster', () => {
    const family = '👨‍👩‍👧';
    expect(wrapText(`${family}${family}`, 1, (text) => (text ? Array.from(new Intl.Segmenter().segment(text)).length : 0))).toEqual([family, family]);
  });
});

describe('isRtl', () => {
  it('detects the direction of the first letter', () => {
    expect(isRtl('مرحبا')).toBe(true);
    expect(isRtl('שלום')).toBe(true);
    expect(isRtl('123 שלום')).toBe(true);
    expect(isRtl('hello שלום')).toBe(false);
    expect(isRtl('你好')).toBe(false);
    expect(isRtl('42')).toBe(false);
  });
});
