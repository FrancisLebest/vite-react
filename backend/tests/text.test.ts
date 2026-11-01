import { describe, expect, it } from 'vitest';
import { extractHashtags, extractMentions, likeEscape } from '../src/lib/text.js';

describe('text helpers', () => {
  it('extracts hashtags', () => {
    expect(extractHashtags('Go #Révisions #exam_2026 #123 a#b #Révisions')).toEqual(['révisions', 'exam_2026']);
  });
  it('extracts mentions, ignoring emails', () => {
    expect(extractMentions('Hi @Bob and @alice.m. mail me at x@example.com @ab')).toEqual(['bob', 'alice.m']);
  });
  it('escapes LIKE wildcards', () => {
    expect(likeEscape('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
