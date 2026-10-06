import { el } from '../utils/dom.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const distance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

// Una imagen ({url, alt}) o una galería ({items:[{url, alt}], index}) con flechas y teclado.
export function openLightbox({ url, alt = 'Imagen ampliada', items, index = 0 }) {
  const list = items?.length ? items : [{ url, alt }];
  let current = clamp(index, 0, list.length - 1);
  ({ url, alt } = list[current]);
  const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const close = el('button', { className: 'lightbox-close', type: 'button', text: '×', attrs: { 'aria-label': 'Cerrar imagen' } });
  const image = el('img', { className: 'lightbox-image', src: url, alt, draggable: false });
  const viewport = el('div', { className: 'lightbox-viewport' }, [image]);
  const resetButton = el('button', { type: 'button', text: 'Restablecer', attrs: { 'aria-label': 'Restablecer zoom' } });
  const minus = el('button', { type: 'button', text: '−', attrs: { 'aria-label': 'Reducir zoom' } });
  const plus = el('button', { type: 'button', text: '+', attrs: { 'aria-label': 'Aumentar zoom' } });
  const controls = el('div', { className: 'lightbox-controls', attrs: { role: 'toolbar', 'aria-label': 'Controles de imagen' } }, [minus, resetButton, plus]);
  const counter = list.length > 1 ? el('span', { className: 'lightbox-counter', attrs: { 'aria-live': 'polite' } }) : null;
  const prevButton = list.length > 1 ? el('button', { className: 'lightbox-nav prev', type: 'button', text: '‹', attrs: { 'aria-label': 'Foto anterior' } }) : null;
  const nextButton = list.length > 1 ? el('button', { className: 'lightbox-nav next', type: 'button', text: '›', attrs: { 'aria-label': 'Foto siguiente' } }) : null;
  const dialog = el('dialog', { className: 'lightbox', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': alt || 'Imagen ampliada' } }, [close, viewport, counter, prevButton, nextButton, controls]);
  const pointers = new Map();
  let scale = 1;
  let x = 0;
  let y = 0;
  let baseWidth = 0;
  let baseHeight = 0;
  let pinch = null;
  let drag = null;
  let moved = false;
  let lastTap = null;
  let lastTouchToggle = 0;
  let closed = false;
  const previousOverflow = document.body.style.overflow;

  const bounds = () => ({ width: viewport.clientWidth, height: viewport.clientHeight });
  const clampPan = () => {
    const { width, height } = bounds();
    const scaledWidth = baseWidth * scale;
    const scaledHeight = baseHeight * scale;
    x = scaledWidth <= width ? (width - scaledWidth) / 2 : clamp(x, width - scaledWidth, 0);
    y = scaledHeight <= height ? (height - scaledHeight) / 2 : clamp(y, height - scaledHeight, 0);
  };
  const apply = () => {
    clampPan();
    image.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  };
  const fitImage = () => {
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const { width, height } = bounds();
    if (!naturalWidth || !naturalHeight || !width || !height) return;
    const factor = Math.min(1, width / naturalWidth, height / naturalHeight);
    baseWidth = Math.max(1, naturalWidth * factor);
    baseHeight = Math.max(1, naturalHeight * factor);
    image.style.width = `${baseWidth}px`;
    image.style.height = `${baseHeight}px`;
    scale = 1;
    x = (width - baseWidth) / 2;
    y = (height - baseHeight) / 2;
    apply();
  };
  const zoomAt = (next, clientX, clientY) => {
    const old = scale;
    scale = clamp(next, 1, 6);
    if (scale === 1) {
      const { width, height } = bounds();
      x = (width - baseWidth) / 2;
      y = (height - baseHeight) / 2;
    } else {
      x = clientX - (clientX - x) * (scale / old);
      y = clientY - (clientY - y) * (scale / old);
    }
    apply();
  };
  const toggleZoom = (clientX, clientY) => zoomAt(scale > 1 ? 1 : 2, clientX, clientY);
  const reset = () => zoomAt(1, 0, 0);
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.body.style.overflow = previousOverflow;
    dialog.remove();
    if (origin?.isConnected) origin.focus();
  };
  const dismiss = () => {
    if (dialog.open) dialog.close();
    else cleanup();
  };

  viewport.addEventListener('pointerdown', (event) => {
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, event);
    moved = false;
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      pinch = { distance: Math.max(1, distance(first, second)), midpoint: midpoint(first, second), scale, x, y };
      drag = null;
    } else {
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x, y, target: event.target, time: Date.now() };
    }
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event);
    if (pointers.size >= 2 && pinch) {
      const [first, second] = [...pointers.values()];
      const currentDistance = Math.max(1, distance(first, second));
      const currentMidpoint = midpoint(first, second);
      scale = clamp(pinch.scale * currentDistance / pinch.distance, 1, 6);
      x = currentMidpoint.x - (pinch.midpoint.x - pinch.x) * (scale / pinch.scale);
      y = currentMidpoint.y - (pinch.midpoint.y - pinch.y) * (scale / pinch.scale);
      moved = true;
      apply();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    if (scale > 1) {
      x = drag.x + dx;
      y = drag.y + dy;
      apply();
    }
  });

  viewport.addEventListener('pointerup', (event) => {
    const wasTap = drag?.pointerId === event.pointerId && !moved && Date.now() - drag.time < 350;
    const tapTarget = drag?.target;
    pointers.delete(event.pointerId);
    viewport.releasePointerCapture?.(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const [remaining] = pointers.values();
      drag = { pointerId: remaining.pointerId, startX: remaining.clientX, startY: remaining.clientY, x, y, target: image, time: Date.now() };
    } else {
      drag = null;
    }
    if (!wasTap) return;
    if (event.pointerType === 'touch' && tapTarget === image) {
      const now = Date.now();
      const doubleTap = lastTap && now - lastTap.time < 320 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 32;
      lastTap = { time: now, x: event.clientX, y: event.clientY };
      if (doubleTap) {
        lastTouchToggle = now;
        toggleZoom(event.clientX, event.clientY);
      }
    }
  });

  viewport.addEventListener('pointercancel', (event) => {
    pointers.delete(event.pointerId);
    drag = null;
    pinch = null;
  });
  viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(scale + (event.deltaY < 0 ? 0.35 : -0.35), event.clientX, event.clientY);
  }, { passive: false });
  viewport.addEventListener('dblclick', (event) => {
    if (event.target === image && Date.now() - lastTouchToggle > 350) toggleZoom(event.clientX, event.clientY);
  });
  viewport.addEventListener('click', (event) => {
    if (event.target === viewport && !moved) dismiss();
    moved = false;
  });
  const go = (step) => {
    current = (current + step + list.length) % list.length;
    image.alt = list[current].alt || '';
    image.src = list[current].url;
    counter.textContent = `${current + 1} / ${list.length}`;
    if (image.complete) fitImage();
  };
  if (counter) {
    counter.textContent = `${current + 1} / ${list.length}`;
    prevButton.addEventListener('click', () => go(-1));
    nextButton.addEventListener('click', () => go(1));
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    });
  }
  close.addEventListener('click', dismiss);
  plus.addEventListener('click', () => { const rect = viewport.getBoundingClientRect(); zoomAt(scale + 0.5, rect.left + rect.width / 2, rect.top + rect.height / 2); });
  minus.addEventListener('click', () => { const rect = viewport.getBoundingClientRect(); zoomAt(scale - 0.5, rect.left + rect.width / 2, rect.top + rect.height / 2); });
  resetButton.addEventListener('click', reset);
  dialog.addEventListener('close', cleanup);
  image.addEventListener('load', fitImage);
  window.addEventListener('resize', fitImage, { once: true });

  document.body.style.overflow = 'hidden';
  document.body.append(dialog);
  dialog.showModal();
  if (image.complete) fitImage();
  close.focus();
  return dialog;
}
