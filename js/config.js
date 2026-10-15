// Shared constants for the letter-dance app.
// Single source of truth for physics, timing, and limits.

export const MAX_LENGTH = 50;

// Physics (pixels / seconds) for the letter jump animation.
export const GRAVITY = 1500;
export const JUMP_FORCE = -600;

// Milliseconds between the start of each letter's jump.
export const CASCADE_DELAY_MS = 150;

// Upper bound in ms for a single letter jump (physics settles in ~800ms).
export const JUMP_TIMEOUT_MS = 1000;

// Ripple effect duration in ms (must match CSS animation duration).
export const RIPPLE_DURATION_MS = 600;
