import { el } from '../utils/dom.js';
import { activeStories, isSeen, markSeen } from './store.js';
import { avatar, mediaFrom, plural, prefersReducedMotion, relativeTime } from './ui.js';

const STORY_MS = 5000;

function storyGroups(state) {
  const stories = activeStories(state);
  const groups = new Map();

  stories.forEach((story) => {
    const department = state.byId.departments[story.departmentId];
    if (!department) return;
    if (!groups.has(story.departmentId)) groups.set(story.departmentId, { department, stories: [] });
    groups.get(story.departmentId).stories.push(story);
  });

  return [...groups.values()];
}

function storyMedia(story, department) {
  return mediaFrom(
    story.media?.[0] || { key: story.id },
    story.title || `Historia de ${department.name}`,
    'media-story',
  );
}

function preloadStory(story, department) {
  const media = storyMedia(story, department);
  const image = media.querySelector('img');
  if (image) {
    image.loading = 'eager';
    image.decoding = 'async';
  }
}

function focusable(root) {
  return [...root.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && node.offsetParent !== null);
}

// Contrato público: openStories(state, departmentId, onClose?) abre el visor.
export function openStories(state, departmentId, onClose = () => {}) {
  const groups = storyGroups(state);
  const initialGroup = groups.findIndex((group) => group.department.id === departmentId);
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (initialGroup < 0) {
    onClose();
    return null;
  }

  let groupIndex = initialGroup;
  let storyIndex = 0;
  let timer = null;
  let closed = false;
  let paused = prefersReducedMotion();
  let pointerDownAt = 0;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerId = null;

  const dialog = el('dialog', {
    className: 'hx-dialog',
    attrs: { 'aria-label': `Historias de ${groups[groupIndex].department.name}` },
  });
  const backdrop = el('div', { className: 'hx-dialog-backdrop' });
  const card = el('div', { className: 'hx-story-card', attrs: { tabindex: '-1' } });
  const progress = el('div', { className: 'hx-progress', attrs: { 'aria-label': 'Progreso de historias' } });
  const header = el('header', { className: 'hx-story-header' });
  const stage = el('div', { className: 'hx-story-stage' });
  const tapPrevious = el('div', {
    className: 'hx-tapzone hx-tapzone-previous',
    attrs: { role: 'button', tabindex: '0', 'aria-label': 'Historia anterior' },
  });
  const tapNext = el('div', {
    className: 'hx-tapzone hx-tapzone-next',
    attrs: { role: 'button', tabindex: '0', 'aria-label': 'Siguiente historia' },
  });
  const info = el('div', { className: 'hx-story-info', attrs: { 'aria-live': 'polite' } });
  const controls = el('div', { className: 'hx-story-controls' });
  const close = el('button', {
    className: 'hx-close', type: 'button', text: '×',
    attrs: { 'aria-label': 'Cerrar historias' },
  });
  const previous = el('button', {
    className: 'hx-control', type: 'button', text: 'Anterior',
    attrs: { 'aria-label': 'Historia anterior' },
  });
  const pause = el('button', {
    className: 'hx-control hx-control-pause', type: 'button',
    attrs: { 'aria-label': 'Reanudar historia' },
  });
  const next = el('button', {
    className: 'hx-control', type: 'button', text: 'Siguiente',
    attrs: { 'aria-label': 'Siguiente historia' },
  });

  function currentGroup() {
    return groups[groupIndex];
  }

  function currentStory() {
    return currentGroup().stories[storyIndex];
  }

  function clearTimer() {
    if (timer) window.clearTimeout(timer);
    timer = null;
  }

  function setPaused(value) {
    paused = prefersReducedMotion() || value;
    if (paused) clearTimer();
    dialog.classList.toggle('hx-is-paused', paused);
    pause.textContent = paused ? 'Reanudar' : 'Pausar';
    pause.setAttribute('aria-label', paused ? 'Reanudar historia' : 'Pausar historia');
  }

  function finish() {
    clearTimer();
    dialog.close();
  }

  function move(direction) {
    clearTimer();
    if (direction > 0) {
      if (storyIndex < currentGroup().stories.length - 1) storyIndex += 1;
      else if (groupIndex < groups.length - 1) {
        groupIndex += 1;
        storyIndex = 0;
      } else {
        finish();
        return;
      }
    } else if (storyIndex > 0) storyIndex -= 1;
    else if (groupIndex > 0) {
      groupIndex -= 1;
      storyIndex = currentGroup().stories.length - 1;
    }
    render();
  }

  function schedule() {
    if (paused) return;
    timer = window.setTimeout(() => move(1), STORY_MS);
  }

  function render() {
    const group = currentGroup();
    const story = currentStory();
    const department = group.department;
    const token = department.accentToken || 'jade';

    markSeen(story.id);
    clearTimer();
    dialog.dataset.hxAccent = token;
    dialog.setAttribute('aria-label', `Historias de ${department.name}`);
    backdrop.dataset.hxAccent = token;
    progress.replaceChildren(...group.stories.map((item, index) => {
      const segment = el('span', { className: 'hx-progress-segment' });
      const fill = el('span', { className: 'hx-progress-fill' });
      if (index < storyIndex) segment.classList.add('hx-is-done');
      if (index === storyIndex) {
        segment.classList.add('hx-is-current');
        fill.style.setProperty('--hx-duration', `${STORY_MS}ms`);
      }
      segment.append(fill);
      return segment;
    }));

    const profile = el('a', {
      className: 'hx-profile-link', href: `#/departamento/${department.id}`, text: 'Ver perfil',
    });
    profile.addEventListener('click', () => finish());
    header.replaceChildren(
      el('div', { className: 'hx-story-header-main' }, [
        avatar(department.name, department.accentToken, 'md', department.avatar),
        el('div', { className: 'hx-story-heading' }, [
          el('strong', { text: department.name }),
          el('span', { text: relativeTime(story.createdAt || story.startsAt) }),
        ]),
      ]),
      el('div', { className: 'hx-story-header-actions' }, [profile, close]),
    );

    stage.replaceChildren(el('div', { className: 'hx-story-visual' }, [storyMedia(story, department)]));
    info.replaceChildren(
      el('h2', { text: story.title || department.name }),
      story.body ? el('p', { text: story.body }) : null,
      el('span', {
        className: 'hx-story-views',
        text: plural(story.views || 0, 'visualización', 'visualizaciones'),
      }),
    );
    previous.disabled = groupIndex === 0 && storyIndex === 0;
    next.textContent = groupIndex === groups.length - 1 && storyIndex === group.stories.length - 1
      ? 'Cerrar'
      : 'Siguiente';
    next.setAttribute('aria-label', next.textContent === 'Cerrar' ? 'Cerrar historias' : 'Siguiente historia');
    controls.replaceChildren(previous, pause, next);
    card.classList.remove('hx-is-switching');
    void card.offsetWidth;
    card.classList.add('hx-is-switching');
    setPaused(paused);
    schedule();

    const nextStory = group.stories[storyIndex + 1] || groups[groupIndex + 1]?.stories[0];
    if (nextStory) preloadStory(nextStory, groups[groupIndex + (storyIndex + 1 < group.stories.length ? 0 : 1)].department);
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(1);
    } else if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      setPaused(!paused);
      if (!paused) schedule();
    } else if (event.key === 'Tab') {
      const items = focusable(dialog);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function pointerStart(event) {
    if (event.target.closest('button, a')) return;
    pointerDownAt = Date.now();
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerId = event.pointerId;
    setPaused(true);
  }

  function pointerEnd(event, direction = 0) {
    if (pointerId !== event.pointerId) return;
    const quickTap = Date.now() - pointerDownAt < 450;
    const swipeDown = event.clientY - pointerStartY > 100
      && Math.abs(event.clientX - pointerStartX) < 180;
    pointerDownAt = 0;
    pointerId = null;
    setPaused(false);
    if (swipeDown) {
      finish();
      return;
    }
    schedule();
    if (quickTap && direction) move(direction);
  }

  close.addEventListener('click', finish);
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  pause.addEventListener('click', () => {
    setPaused(!paused);
    if (!paused) schedule();
  });
  tapPrevious.addEventListener('pointerdown', (event) => pointerStart(event));
  tapPrevious.addEventListener('pointerup', (event) => pointerEnd(event, -1));
  tapPrevious.addEventListener('pointercancel', (event) => pointerEnd(event));
  tapNext.addEventListener('pointerdown', (event) => pointerStart(event));
  tapNext.addEventListener('pointerup', (event) => pointerEnd(event, 1));
  tapNext.addEventListener('pointercancel', (event) => pointerEnd(event));
  tapPrevious.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      move(-1);
    }
  });
  tapNext.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      move(1);
    }
  });
  card.addEventListener('pointerdown', pointerStart);
  card.addEventListener('pointerup', (event) => pointerEnd(event));
  card.addEventListener('pointercancel', (event) => pointerEnd(event));
  dialog.addEventListener('keydown', handleKeydown);
  dialog.addEventListener('close', () => {
    if (closed) return;
    closed = true;
    clearTimer();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
    onClose();
  });

  card.append(progress, header, stage, info, tapPrevious, tapNext, controls);
  backdrop.append(card);
  dialog.append(backdrop);
  document.body.append(dialog);
  render();
  dialog.showModal();
  window.requestAnimationFrame(() => close.focus());
  return dialog;
}

// Contrato público: createStoriesRail(state) -> { node, update(selectedDepartmentId) }.
export function createStoriesRail(state) {
  const node = el('section', {
    className: 'hx-rail', attrs: { 'aria-label': 'Historias de departamentos' },
  });
  const heading = el('div', { className: 'hx-rail-heading' }, [
    el('div', {}, [
      el('p', { className: 'hx-eyebrow', text: 'Ahora en la comunidad' }),
      el('h2', { text: 'Historias' }),
    ]),
    el('span', { className: 'hx-rail-count' }),
  ]);
  const list = el('div', { className: 'hx-rail-list', attrs: { role: 'list' } });
  node.append(heading, list);

  function update(selectedDepartmentId = '') {
    const groups = storyGroups(state).sort((a, b) => (
      (b.department.id === selectedDepartmentId) - (a.department.id === selectedDepartmentId)
    ));
    const total = groups.reduce((sum, group) => sum + group.stories.length, 0);
    heading.querySelector('.hx-rail-count').textContent = plural(total, 'historia activa', 'historias activas');
    list.replaceChildren(...groups.map((group, index) => {
      const { department, stories } = group;
      const unseen = stories.some((story) => !isSeen(story.id));
      const button = el('button', {
        className: `hx-story-launcher${unseen ? ' hx-unseen' : ''}`,
        type: 'button',
        attrs: { 'aria-label': `Ver historias de ${department.name}${unseen ? ' (sin ver)' : ''}` },
      });
      const ring = el('span', { className: 'hx-story-ring' }, [
        avatar(department.name, department.accentToken, 'lg', department.avatar),
              el('span', { className: 'hx-story-badge', text: stories.length >= 2 ? String(stories.length) : '' }),
      ]);
      button.append(ring, el('span', {
        className: 'hx-story-label', text: department.shortName || department.name,
      }));
      button.dataset.hxDepartment = department.id;
      button.style.setProperty('--hx-delay', `${Math.min(index, 8) * 45}ms`);
      button.addEventListener('click', () => openStories(state, department.id, () => {
        update(selectedDepartmentId);
        list.querySelector(`[data-hx-department="${department.id}"]`)?.focus();
      }));
      return el('div', { className: 'hx-rail-item', attrs: { role: 'listitem' } }, [button]);
    }));
    node.hidden = !groups.length;
  }

  update();
  return { node, update };
}
