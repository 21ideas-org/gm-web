(() => {
  const root = document.documentElement;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  root.dataset.theme = systemTheme.matches ? 'dark' : 'light';
  document.querySelector('#theme').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  });

  const { date, contentSha256, recommendation, storageKey } = JSON.parse(document.querySelector('#review-data').textContent);
  if (!recommendation) return;

  const form = document.querySelector('#review-form');
  const note = document.querySelector('#reading-note');
  const [before, link, after] = note.querySelector('p').children;
  const fields = ['before', 'anchor', 'after'];
  const save = document.querySelector('#save');
  const status = document.querySelector('#review-status');
  const labels = { pending: 'Черновик', confirmed: 'Подтверждено', skipped: 'Пропущено' };
  let decision = 'pending';
  let stored;
  try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch { /* file storage may be disabled */ }
  for (const field of fields) form.elements[field].value = stored?.text?.[field] ?? recommendation[field];
  if (Object.hasOwn(labels, stored?.decision)) decision = stored.decision;
  link.href = recommendation.url;
  link.rel = 'noreferrer';

  function update() {
    const text = Object.fromEntries(fields.map(field => [field, form.elements[field].value.trim().replace(/\s+/g, ' ')]));
    const show = decision !== 'skipped' && /^\p{L}{1,32}$/u.test(text.anchor);
    note.hidden = !show;
    before.textContent = text.before ? text.before + ' ' : '';
    link.textContent = text.anchor;
    after.textContent = text.after && !/^[.,!?;:…)]/.test(text.after) ? ' ' + text.after : text.after;
    status.textContent = labels[decision];
    save.disabled = decision === 'pending';
    try { localStorage.setItem(storageKey, JSON.stringify({ text, decision })); } catch { /* download remains available */ }
    return text;
  }

  form.addEventListener('input', () => { decision = 'pending'; update(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const anchor = form.elements.anchor;
    if (!anchor.reportValidity()) return;
    decision = 'confirmed';
    update();
  });
  document.querySelector('#skip').addEventListener('click', () => { decision = 'skipped'; update(); });
  save.addEventListener('click', () => {
    const text = update();
    const { storyIndex, articleId, url } = recommendation;
    const result = { date, contentSha256, decision, storyIndex, articleId, url, ...(decision === 'confirmed' ? { text } : {}) };
    const download = document.createElement('a');
    const href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2) + '\n'], { type: 'application/json' }));
    download.href = href;
    download.download = `digest-review-${date}.json`;
    download.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  });
  update();
})();
