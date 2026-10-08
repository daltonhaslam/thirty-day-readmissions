import { h, clear } from '../dom.js';
import { search } from './search.js';
import { go as navigate } from '../router.js';

let uid = 0;
const TYPE_LABEL = { hospital: 'Hospital', state: 'State', metro: 'Metro' };

// Accessible combobox over the search index. Enter or click navigates.
// onPick(result) replaces navigation (e.g., the worksheet picker); types limits result kinds.
export function omnibox(index, { big = false, placeholder = 'Hospital, city, state, metro, or CCN', onPick, types } = {}) {
  uid += 1;
  const listId = `omni-list-${uid}`;
  const input = h('input', {
    type: 'search', id: `omni-${uid}`, placeholder, autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-autocomplete': 'list',
  });
  const list = h('ul', { class: 'omni__list', id: listId, role: 'listbox', hidden: true });
  const root = h('div', { class: `omni${big ? ' omni--big' : ''}` },
    h('label', { class: 'omni__field', for: input.id },
      h('span', { class: 'omni__label cap' }, 'Find'), input),
    list);
  let results = [];
  let active = -1;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const go = (r) => {
    if (!r) return;
    close();
    input.value = '';
    input.blur();
    if (onPick) onPick(r);
    else navigate(r.type, r.key);
  };
  const paint = () => {
    clear(list);
    if (!results.length) {
      list.append(h('li', { class: 'omni__empty', role: 'option', 'aria-disabled': 'true' }, 'No matches. Try a city, a state, or the 6-digit CCN.'));
    }
    results.forEach((r, i) => {
      list.append(h('li', {
        role: 'option', id: `${listId}-${i}`, 'aria-selected': String(i === active),
        onmousedown: (e) => { e.preventDefault(); go(r); },
      }, h('span', { class: 't' }, r.label), h('span', { class: 's' }, r.sub), h('span', { class: 'k' }, TYPE_LABEL[r.type])));
    });
    if (active >= 0) input.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else input.removeAttribute('aria-activedescendant');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => {
    results = search(input.value, index, { types });
    active = results.length ? 0 : -1;
    if (input.value.trim()) paint(); else close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { active = (active + 1) % results.length; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && results.length) { active = (active - 1 + results.length) % results.length; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { go(results[active]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  return root;
}
