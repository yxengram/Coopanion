/**
 * The settings window's size in DIP (upstream #436, the remembered size only): `settings-size.json` in the data
 * directory (`userData`, which main.cjs sets to it; beside the program for the portable build). Saved from the
 * window's unmaximized bounds when it is closed (hidden) or the app quits, and restored within the primary display's
 * work area, even one smaller than the usual minimum. Only the size is kept, never the position. Apart from Electron so
 * it can be tested (tests/settings-size.test.js).
 */
const { readFileSync, renameSync, writeFileSync } = require('node:fs');

/** 1180 wide keeps the Start page's model list on two rows. */
const DEFAULT_SIZE = { width: 1180, height: 800 };
const MIN_SIZE = { width: 880, height: 600 };

/** The window's size and minimum size for a work area of `area` (DIP), from the saved size or the default. */
function readSettingsSize(file, area) {
  let size = DEFAULT_SIZE;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (Number.isInteger(saved?.width) && Number.isInteger(saved?.height)) size = saved;
  } catch { /* a missing or damaged file uses the default size */ }
  const minWidth = Math.min(area.width, MIN_SIZE.width);
  const minHeight = Math.min(area.height, MIN_SIZE.height);
  return {
    minWidth, minHeight,
    width: Math.min(area.width, Math.max(minWidth, size.width)),
    height: Math.min(area.height, Math.max(minHeight, size.height)),
  };
}

/** Saves the width and height of `bounds` (a window's normal bounds), through a temporary file. */
function saveSettingsSize(file, { width, height }) {
  writeFileSync(file + '.tmp', JSON.stringify({ width, height }) + '\n');
  renameSync(file + '.tmp', file);
}

module.exports = { DEFAULT_SIZE, MIN_SIZE, readSettingsSize, saveSettingsSize };
