const btn = document.getElementById('btn');
const hiddenInput = document.getElementById('hidden-input');
const textInput = document.getElementById('text-input');
const MAX_LENGTH = 50;
let dynamicMaxLength = MAX_LENGTH;

function calculateMaxLength() {
  const wrapper = document.querySelector('.input-wrapper');
  const style = getComputedStyle(wrapper);
  const width = wrapper.clientWidth;
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const availableWidth = width - padding;
  
  // Create temporary span to measure character width
  const measure = document.createElement('span');
  measure.style.visibility = 'hidden';
  measure.style.position = 'absolute';
  measure.style.fontFamily = getComputedStyle(textInput).fontFamily;
  measure.style.fontSize = getComputedStyle(textInput).fontSize;
  measure.style.fontWeight = '600';
  measure.style.whiteSpace = 'nowrap';
  measure.textContent = 'M'; // Widest typical character
  document.body.appendChild(measure);
  const charWidth = measure.getBoundingClientRect().width;
  document.body.removeChild(measure);
  
  const maxChars = Math.max(1, Math.floor(availableWidth / charWidth));
  dynamicMaxLength = Math.min(MAX_LENGTH, maxChars);
  hiddenInput.maxLength = dynamicMaxLength;
}

function splitTextIntoLetters(text) {
  textInput.textContent = '';
  const letters = text.split('');
  letters.forEach(char => {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char === ' ' ? '\u00A0' : char;
    textInput.appendChild(span);
  });
}

function syncSelection() {
  if (document.activeElement !== hiddenInput) return;
  const start = hiddenInput.selectionStart;
  const end = hiddenInput.selectionEnd;
  if (start === end) return;

  const spans = textInput.querySelectorAll('.letter');
  spans.forEach((span, i) => {
    span.classList.toggle('selected', i >= start && i < end);
  });
}

function clearSelection() {
  textInput.querySelectorAll('.letter.selected').forEach(s => s.classList.remove('selected'));
}

// Initial split
splitTextIntoLetters(hiddenInput.value);

// Calculate initial max length
calculateMaxLength();

// Recalculate on resize
window.addEventListener('resize', calculateMaxLength);

// Sync mirror on hidden input change
hiddenInput.addEventListener('input', () => {
  splitTextIntoLetters(hiddenInput.value.slice(0, dynamicMaxLength));
});

// Sync selection visually on mirror
document.addEventListener('selectionchange', syncSelection);
hiddenInput.addEventListener('blur', clearSelection);

function jumpLetter(letterElement) {
  const GRAVITY = 1500;
  const JUMP_FORCE = -600;

  let vy = JUMP_FORCE;
  let y = 0;
  let lastTime = null;

  function animate(timestamp) {
    if (lastTime === null) {
      lastTime = timestamp;
      requestAnimationFrame(animate);
      return;
    }
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    vy += GRAVITY * dt;
    y += vy * dt;

    letterElement.style.transform = `translateY(${y}px)`;

    if (y < 0) {
      requestAnimationFrame(animate);
    } else {
      letterElement.style.transform = 'translateY(0)';
    }
  }

  requestAnimationFrame(animate);
}

let isDancing = false;

function startDance() {
  if (isDancing) return;
  isDancing = true;

  const letterSpans = document.querySelectorAll('.letter');

  btn.disabled = true;
  btn.style.cursor = 'not-allowed';

  setTimeout(() => btn.classList.add('dancing'), 0);

  letterSpans.forEach((letter, index) => {
    const delay = index * 150;
    setTimeout(() => {
      jumpLetter(letter);
    }, delay);
  });

  const totalDuration = letterSpans.length * 150 + 1000;
  setTimeout(() => {
    isDancing = false;
    btn.classList.remove('dancing');
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }, totalDuration);
}

btn.addEventListener('click', startDance);

function createRipple(event) {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x - size / 2}px`;
  ripple.style.top = `${y - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => {
    ripple.remove();
  });
}

btn.addEventListener('click', createRipple);