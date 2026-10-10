/** Text layout helpers for card faces, kept free of canvas and three.js so they can be unit tested. */

const RTL_SCRIPTS =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}]/u;
const FIRST_LETTER = /\p{L}/u;
const WHITESPACE = /^\s+$/u;
const PUNCTUATION = /^\p{P}+$/u;

/** Direction of the first strong (letter) character, like `dir="auto"`. */
export function isRtl(text: string): boolean {
  const first = text.match(FIRST_LETTER);
  return !!first && RTL_SCRIPTS.test(first[0]);
}

const wordSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
const graphemeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

interface Piece {
  text: string;
  /** Lines may break before this piece. False for punctuation, which stays with what comes before it. */
  breakBefore: boolean;
}

function pieces(paragraph: string): Piece[] {
  if (!wordSegmenter)
    return paragraph
      .split(/(\s+)/)
      .filter(Boolean)
      .map((text) => ({ text, breakBefore: true }));
  // Word segmentation finds break points in scripts without spaces (Chinese, Japanese, Thai).
  return Array.from(wordSegmenter.segment(paragraph), ({ segment }) => ({ text: segment, breakBefore: !PUNCTUATION.test(segment) }));
}

function graphemes(text: string): string[] {
  return graphemeSegmenter ? Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment) : Array.from(text);
}

/**
 * Greedy line breaking at word boundaries. A piece wider than the whole line is split
 * between graphemes so long words and URLs still fit.
 */
export function wrapText(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    const push = () => {
      lines.push(line.trim());
      line = '';
    };
    for (const piece of pieces(paragraph)) {
      if (WHITESPACE.test(piece.text)) {
        if (line) line += piece.text;
        continue;
      }
      const candidate = line + piece.text;
      if (!line.trim() || !piece.breakBefore || measure(candidate.trim()) <= width) {
        line = candidate;
      } else {
        push();
        line = piece.text;
      }
      if (measure(line.trim()) > width && piece.breakBefore) {
        // Too wide even on its own line: break it between characters.
        const prefix = line.slice(0, line.length - piece.text.length);
        line = prefix;
        for (const grapheme of graphemes(piece.text)) {
          if (line.trim() && measure((line + grapheme).trim()) > width) push();
          line += grapheme;
        }
      }
    }
    push();
  }
  return lines;
}
