// src/tui/theme.ts — colours, role labels and compile-time pixel art for the TUI.
//
// Colours are truecolor hex. Ink routes these through `chalk.hex()`, which downgrades to
// ANSI-256 or ANSI-16 on terminals that can't do better, so no manual fallback is needed.

import { artFromCharGrid } from './pixels';
import type { PixelArt } from './pixels';

export const PALETTE = Object.freeze({
  pink: '#edc76a',
  pinkLight: '#a7d8eb',
  pinkDark: '#c4a55d',
  yellow: '#ffd43b',
  green: '#8fd18f',
  stem: '#4f8f4f',
  text: '#e8dce8',
  dim: '#a7b2c1',
  faint: '#9ba7b7',
  dark: '#2e1f2a',
  white: '#f5f0f5',
  // Not part of the source design, which has no error state — but `error` log lines must
  // stay distinguishable from the rest of the pink family.
  err: '#ff5f6d',
});

/** Log kinds map onto a fixed-width role column. Labels are padded to 3 chars so it stays rigid. */
export const ROLES = Object.freeze({
  user: { label: 'you', color: PALETTE.pink },
  assistant: { label: 'ai ', color: PALETTE.pinkLight },
  notice: { label: 'sys', color: PALETTE.faint },
  tool: { label: 'run', color: PALETTE.pinkDark },
  error: { label: 'err', color: PALETTE.err },
});

export const ROLE_WIDTH = 3;

const FLOWER_GRID = ['WW.WW', '.DDD.', '.YDY.', '..D..', '.D.D.'];
const FLOWER_PAL: Record<string, string> = {
  D: '#718295',
  W: PALETTE.white,
  Y: PALETTE.yellow,
  G: PALETTE.stem,
};

/** 5×5 flower → 5 columns × 3 rows. Built once at module load; it never changes. */
export const FLOWER_ART: PixelArt = artFromCharGrid(FLOWER_GRID, FLOWER_PAL);

/** 5-row block font for the startup wordmark. Only the glyphs in "OLLAMA-CODE" exist. */
const FONT: Record<string, string[]> = {
  F: ['██████','██    ','█████ ','██    ','██    '],
  Y: ['██  ██','██  ██',' ████ ','  ██  ','  ██  '],
  R: ['█████ ','██  ██','█████ ','██ ██ ','██  ██'],
  O: [' ██████ ', '██    ██', '██    ██', '██    ██', ' ██████ '],
  L: ['██     ', '██     ', '██     ', '██     ', '███████'],
  A: [' █████ ', '██   ██', '███████', '██   ██', '██   ██'],
  M: ['███    ███', '████  ████', '██ ████ ██', '██  ██  ██', '██      ██'],
  C: [' ██████', '██     ', '██     ', '██     ', ' ██████'],
  D: ['██████ ', '██   ██', '██   ██', '██   ██', '██████ '],
  E: ['███████', '██     ', '█████  ', '██     ', '███████'],
  '-': ['     ', '     ', '█████', '     ', '     '],
};

/** Render text in the block font. Returns one string per font row. */
export function blockText(text: string): string[] {
  const chars = text.split('').filter((ch) => FONT[ch]);
  return [0, 1, 2, 3, 4].map((row) => chars.map((ch) => (FONT[ch] as string[])[row]).join(' '));
}

function widthOf(lines: string[]): number {
  return Math.max(...lines.map((line) => line.length));
}

/** Full wordmark, ~90 columns. Only fits comfortably on wide terminals. */
export const WORDMARK = blockText('FLYCODER');
export const WORDMARK_WIDTH = widthOf(WORDMARK);

/**
 * Two-line fallback, ~51 columns, so an 80-column terminal still gets the block lettering
 * instead of dropping straight to plain text.
 */
export const WORDMARK_SPLIT = [...blockText('FLY'), ...blockText('CODER')];
export const WORDMARK_SPLIT_WIDTH = widthOf(WORDMARK_SPLIT);

export const SUBTITLE = 'Qwen 3.5 + FlyBrain · local SWE';
