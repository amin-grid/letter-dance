// Material-style click ripple for buttons.

/**
 * Spawn a ripple inside `button` at the click point of `event`.
 * The element removes itself when its CSS animation ends (with a
 * timeout fallback so it never leaks if the animation is interrupted).
 */
export function createRipple(event) {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

  const remove = () => ripple.remove();
  ripple.addEventListener('animationend', remove, { once: true });
  // Fallback: animationend may never fire (display:none, test env, etc.)
  setTimeout(remove, 1000);

  button.appendChild(ripple);
}
