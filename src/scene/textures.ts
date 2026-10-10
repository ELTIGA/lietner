import * as THREE from 'three';

import { t } from '../strings';
import { isRtl, wrapText } from './wrap';

/** Fraunces first; the rest cover scripts it lacks (Arabic, Hebrew, CJK, Thai) on common systems. */
export const CARD_FONT =
  '"Fraunces", "Noto Serif", "Noto Naskh Arabic", "Noto Serif Hebrew", "Noto Serif CJK SC", "Noto Serif Thai", "Hiragino Mincho ProN", "Songti SC", "Times New Roman", Georgia, serif';
export const LABEL_FONT = '"IBM Plex Mono", ui-monospace, monospace';

const PAPER = '#f4ecd8';
const INK = '#2a2420';
const RULE_BLUE = 'rgba(92, 128, 168, 0.35)';
const RULE_RED = 'rgba(184, 64, 43, 0.55)';

let maxAnisotropy = 1;
export function setMaxAnisotropy(value: number): void {
  maxAnisotropy = value;
}

export function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/** Waits for web fonts so canvas text never falls back to a default face. */
export async function loadFonts(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`600 64px ${CARD_FONT}`), document.fonts.load(`500 32px ${LABEL_FONT}`)]);
    await document.fonts.ready;
  } catch (error) {
    console.error('Font loading failed, using fallbacks', error);
  }
}

export type CardSide = 'front' | 'back';

const CARD_W = 1024;
const CARD_H = 640;
const PADDING = 88;

/** Index-card face: ruled paper with the text fitted to the largest size that wraps cleanly. */
export function drawCardFace(text: string, side: CardSide, boxLabel: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = side === 'front' ? PAPER : '#efe4c9';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  paperNoise(ctx, CARD_W, CARD_H);

  if (side === 'front') {
    ctx.fillStyle = RULE_RED;
    ctx.fillRect(0, 112, CARD_W, 3);
    ctx.fillStyle = RULE_BLUE;
    for (let y = 172; y < CARD_H - 30; y += 56) ctx.fillRect(0, y, CARD_W, 2);
  } else {
    ctx.strokeStyle = RULE_RED;
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, CARD_W - 56, CARD_H - 56);
  }

  ctx.fillStyle = 'rgba(42, 36, 32, 0.55)';
  ctx.font = `500 30px ${LABEL_FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillText(side === 'front' ? t.card.question : t.card.answer, 52, 80);
  ctx.textAlign = 'right';
  ctx.fillText(boxLabel, CARD_W - 52, 80);

  const top = side === 'front' ? 130 : 96;
  fitText(ctx, text, PADDING, top, CARD_W - PADDING * 2, CARD_H - top - 60);
  return canvasTexture(canvas);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number): void {
  let size = 104;
  let lines: string[] = [];
  const measure = (line: string) => ctx.measureText(line).width;
  for (; size >= 26; size -= 4) {
    ctx.font = `600 ${size}px ${CARD_FONT}`;
    lines = wrapText(text, width, measure);
    const fitsWidth = lines.every((line) => ctx.measureText(line).width <= width);
    if (fitsWidth && lines.length * size * 1.25 <= height) break;
  }
  const lineHeight = size * 1.25;
  const blockTop = y + (height - lines.length * lineHeight) / 2;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Bidi ordering inside each line follows the card's own direction (Arabic, Hebrew).
  ctx.direction = isRtl(text) ? 'rtl' : 'ltr';
  lines.forEach((line, index) => ctx.fillText(line, x + width / 2, blockTop + lineHeight * (index + 0.5)));
}

function paperNoise(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 10;
    data[i] = data[i]! + grain;
    data[i + 1] = data[i + 1]! + grain;
    data[i + 2] = data[i + 2]! + grain;
  }
  ctx.putImageData(image, 0, 0);
}

/** Brass plate on the front of each box: big numeral plus card count. */
export function drawBoxLabel(canvas: HTMLCanvasElement, title: string, count: number): void {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#d9b56a');
  gradient.addColorStop(1, '#9c7a35');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(60, 40, 10, 0.6)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  ctx.fillStyle = '#2b1d0b';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${height * 0.62}px ${CARD_FONT}`;
  ctx.fillText(title, 28, height / 2 + 4);
  ctx.textAlign = 'right';
  ctx.font = `500 ${height * 0.34}px ${LABEL_FONT}`;
  ctx.fillText(String(count), width - 28, height / 2 + 2);
}

/** Procedural walnut grain for the desk top. */
export function woodTexture(): THREE.CanvasTexture {
  const size = 1024;
  const length = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = length;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#5a3a24';
  ctx.fillRect(0, 0, length, size);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * size;
    const amplitude = 4 + Math.random() * 14;
    const frequency = 0.002 + Math.random() * 0.006;
    const phase = Math.random() * Math.PI * 2;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(30, 16, 8, ${0.08 + Math.random() * 0.18})` : `rgba(140, 96, 60, ${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.4;
    ctx.beginPath();
    for (let x = 0; x <= length; x += 16) ctx.lineTo(x, y + Math.sin(x * frequency + phase) * amplitude);
    ctx.stroke();
  }
  const texture = canvasTexture(canvas);
  return texture;
}
