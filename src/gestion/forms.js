import { el } from '../utils/dom.js';

// Campo etiquetado con mensaje de error accesible. control: 'input' | 'textarea' | 'select'.
export function field(label, name, { control = 'input', value = '', type = 'text', options = [], required = false, error = '', hint = '', ...attrs } = {}) {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const base = { id, name, attrs: { ...(required && { required: '' }), ...(error && { 'aria-invalid': 'true', 'aria-describedby': `${id}-err` }), ...attrs } };
  let input;
  if (control === 'select') input = el('select', base, options.map(([v, text]) => el('option', { value: v, text, selected: v === value })));
  else if (control === 'textarea') input = el('textarea', { ...base, rows: 4, value });
  else input = el('input', { ...base, type, value });
  return el('label', { className: 'field', attrs: { for: id } }, [el('span', { text: required ? `${label} *` : label }), input, hint ? el('span', { className: 'muted', text: hint }) : null, error ? el('span', { className: 'field-error', id: `${id}-err`, text: error, attrs: { role: 'alert' } }) : null]);
}
export const formData = (form) => Object.fromEntries(new FormData(form));
export const checkbox = (label, name, checked) => el('label', { className: 'check' }, [el('input', { type: 'checkbox', name, checked }), el('span', { text: label })]);
// Confirmación nativa para acciones destructivas.
export const confirmDelete = (what) => window.confirm(`¿Eliminar ${what}? Esta acción no se puede deshacer.`);
