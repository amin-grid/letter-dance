const btn = document.getElementById('btn');
const textElement = document.getElementById('text');
const textContent = textElement.textContent;
const letters = textContent.split('');

textElement.textContent = '';

letters.forEach(char => {
  const span = document.createElement('span');
  span.className = 'letter';
  span.textContent = char === ' ' ? '\u00A0' : char;
  textElement.appendChild(span);
});

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

const letterSpans = document.querySelectorAll('.letter');

let isDancing = false;

function startDance() {
  if (isDancing) return;
  isDancing = true;

  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.style.cursor = 'not-allowed';

  letterSpans.forEach((letter, index) => {
    const delay = index * 150;
    setTimeout(() => {
      jumpLetter(letter);
    }, delay);
  });

  const totalDuration = letterSpans.length * 150 + 1000;
  setTimeout(() => {
    isDancing = false;
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