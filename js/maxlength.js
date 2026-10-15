// Dynamic maxlength: caps the input length to what fits the visible width
// (up to MAX_LENGTH), measured with a canvas so no DOM nodes are created.

import { MAX_LENGTH } from './config.js';

let measureContext = null;

function getMeasureContext() {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  return measureContext;
}

/**
 * Compute how many characters fit in `wrapperEl`, given the mirror's font.
 * Returns a value in [1, MAX_LENGTH]. Pure (no DOM side effects).
 */
export function computeMaxLength(availableWidth, font) {
  const ctx = getMeasureContext();
  ctx.font = font;
  const charWidth = ctx.measureText('M').width || 1;
  const maxChars = Math.max(1, Math.floor(availableWidth / charWidth));
  return Math.min(MAX_LENGTH, maxChars);
}

/**
 * Recompute and apply the maxlength for `inputEl` based on the current
 * width of `wrapperEl` and the input's own font.
 */
export function updateMaxLength({ wrapperEl, inputEl }) {
  const style = getComputedStyle(inputEl);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const availableWidth = inputEl.clientWidth - padding;
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const maxLength = computeMaxLength(availableWidth, font);
  inputEl.maxLength = maxLength;
  return maxLength;
}
