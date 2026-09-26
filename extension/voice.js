// Gemini Voice: язык интерфейса и голосовой ввод на любом языке для «Режима ИИ» Google Поиска.
// Кнопок на странице нет: Ctrl+Пробел — микрофон вкл/выкл, Ctrl+, — настройки.
// Голосовые команды в конце фразы: «отправить» / send, «очистить» / clear.
(() => {
  if (window.__gmVoice) return;
  window.__gmVoice = true;

  // ---------- настройки ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gmVoice.' + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gmVoice.' + k, v); } catch {} },
  };
  // Язык интерфейса Google задаётся параметром ?hl= в адресе. Выбор храним сами и подставляем при загрузке.
  const APP_LOCALES = ['af', 'am', 'ar', 'az', 'be', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'en-GB', 'es', 'es-419',
    'et', 'eu', 'fa', 'fi', 'fil', 'fr', 'fr-CA', 'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka',
    'kk', 'km', 'kn', 'ko', 'ky', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'my', 'nb', 'ne', 'nl', 'pa', 'pl',
    'pt-BR', 'pt-PT', 'ro', 'ru', 'si', 'sk', 'sl', 'sq', 'sr', 'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz',
    'vi', 'zh-CN', 'zh-TW', 'zu'];
  const appLocale = () => store.get('hl', 'system');
  function applyAppLocale() {
    const hl = appLocale();
    if (hl === 'system') return false;
    const url = new URL(location.href);
    if (url.searchParams.get('hl') === hl) return false;
    url.searchParams.set('hl', hl);
    location.replace(url.href);
    return true;
  }
  function setAppLocale(v) {
    store.set('hl', v);
    const url = new URL(location.href);
    if (v === 'system') url.searchParams.delete('hl'); else url.searchParams.set('hl', v);
    location.replace(url.href);
  }
  if (applyAppLocale()) return;

  // Заголовок окна — «Gemini» вместо «… - Поиск в Google» (Google меняет его после каждого вопроса),
  // значок окна и панели задач — Gemini вместо «G» Google.
  // Значок вставляется как data: URL: так Edge точно покажет его как значок страницы.
  const TITLE = 'Gemini';
  let icon = null;
  fetch(chrome.runtime.getURL('gemini.png')).then((r) => r.blob()).then((b) => {
    const fr = new FileReader();
    fr.onload = () => { icon = fr.result; keepTitle(); };
    fr.readAsDataURL(b);
  }).catch(() => {});
  const keepTitle = () => {
    if (document.title !== TITLE) document.title = TITLE;
    if (!icon || !document.head) return;
    const links = document.head.querySelectorAll('link[rel~="icon"]');
    if (links.length === 1 && links[0].href === icon) return;
    links.forEach((l) => l.remove());
    const l = document.createElement('link');
    l.rel = 'icon'; l.type = 'image/png'; l.href = icon;
    document.head.appendChild(l);
  };
  keepTitle();
  new MutationObserver(keepTitle).observe(document.head || document.documentElement, { childList: true, subtree: true, characterData: true });

  // Логотип «G» никуда не ведёт (дублирует pointer-events:none из hide.css на случай перехода с клавиатуры)
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a[href*="/webhp"]')) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  const uiCode = () => { const l = appLocale(); return (l === 'system' ? document.documentElement.lang || navigator.language : l).slice(0, 2).toLowerCase(); };

  const DICT_LANGS = ['ru-RU', 'en-US', 'en-GB', 'uk-UA', 'be-BY', 'kk-KZ', 'uz-UZ', 'ky-KG', 'az-AZ', 'hy-AM', 'ka-GE',
    'mn-MN', 'de-DE', 'fr-FR', 'es-ES', 'es-MX', 'it-IT', 'pt-BR', 'pt-PT', 'pl-PL', 'cs-CZ', 'sk-SK', 'sl-SI', 'hr-HR',
    'sr-RS', 'bg-BG', 'ro-RO', 'hu-HU', 'el-GR', 'nl-NL', 'sv-SE', 'nb-NO', 'da-DK', 'fi-FI', 'et-EE', 'lv-LV', 'lt-LT',
    'tr-TR', 'ar-SA', 'he-IL', 'fa-IR', 'ur-PK', 'hi-IN', 'bn-IN', 'ta-IN', 'th-TH', 'vi-VN', 'id-ID', 'ms-MY', 'fil-PH',
    'zh-CN', 'zh-TW', 'zh-HK', 'ja-JP', 'ko-KR'];
  function langName(code, inLang) {
    try {
      const n = new Intl.DisplayNames([inLang || code], { type: 'language' }).of(code);
      return n.charAt(0).toUpperCase() + n.slice(1);
    } catch { return code; }
  }
  function defaultDictLang() {
    const nav = navigator.language || 'ru-RU';
    return DICT_LANGS.find(c => c.toLowerCase() === nav.toLowerCase()) || DICT_LANGS.find(c => c.slice(0, 2) === nav.slice(0, 2)) || 'ru-RU';
  }
  let lang = store.get('lang', defaultDictLang());
  if (!DICT_LANGS.includes(lang)) lang = defaultDictLang();

  // ---------- тексты панели ----------
  const I18N = {
    ru: {
      mic: 'Голосовой ввод (Ctrl+Пробел)', dict: 'Язык диктовки', settings: 'Настройки',
      appLang: 'Язык приложения', system: 'Как в аккаунте Google', dictSet: 'Язык диктовки: ',
      listen: 'Говорите… «отправить» — отправить сообщение.', noInput: 'Не нашёл поле ввода. Откройте чат.',
      notAllowed: 'Нет доступа к микрофону. Разрешите его в значке замка слева от адреса.', noMic: 'Микрофон не найден.',
      network: 'Сервис распознавания речи недоступен (сеть).', langNS: 'Этот язык не поддерживается распознаванием.',
      micFail: 'Не удалось включить микрофон: ', noSR: 'Распознавание речи недоступно в этом браузере',
    },
    uk: {
      mic: 'Голосове введення (Ctrl+Пробіл)', dict: 'Мова диктування', settings: 'Налаштування',
      appLang: 'Мова застосунку', system: 'Як в акаунті Google', dictSet: 'Мова диктування: ',
      listen: 'Говоріть… «надіслати» — надіслати повідомлення.', noInput: 'Не знайшов поле введення. Відкрийте чат.',
      notAllowed: 'Немає доступу до мікрофона. Дозвольте його в значку замка ліворуч від адреси.', noMic: 'Мікрофон не знайдено.',
      network: 'Сервіс розпізнавання мовлення недоступний (мережа).', langNS: 'Ця мова не підтримується розпізнаванням.',
      micFail: 'Не вдалося увімкнути мікрофон: ', noSR: 'Розпізнавання мовлення недоступне в цьому браузері',
    },
    en: {
      mic: 'Voice input (Ctrl+Space)', dict: 'Dictation language', settings: 'Settings',
      appLang: 'App language', system: 'Google Account default', dictSet: 'Dictation language: ',
      listen: 'Speak… say "send" to send the message.', noInput: 'Chat input not found. Open a chat.',
      notAllowed: 'Microphone access denied. Allow it via the lock icon left of the address.', noMic: 'No microphone found.',
      network: 'Speech recognition service unavailable (network).', langNS: 'This language is not supported for recognition.',
      micFail: 'Could not start the microphone: ', noSR: 'Speech recognition is not available in this browser',
    },
  };
  const t = I18N[uiCode()] || (uiCode() === 'be' || uiCode() === 'kk' ? I18N.ru : I18N.en);
  const uiLocale = appLocale() === 'system' ? document.documentElement.lang || navigator.language : appLocale();

  // ---------- UI ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:96px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  // Страницы Google требуют Trusted Types, поэтому без innerHTML: разметка собирается через createElement.
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids);
    return n;
  };
  root.append(el('style', {}, `
      :host{--bg:#fff;--fg:#1f1f1f;--muted:#5f6368;--line:#dadce0}
      .wrap{position:relative;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:13px system-ui,sans-serif}
      .row{display:none}
      .b{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;font-size:20px;position:relative;
        background:#1a73e8;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);display:grid;place-items:center}
      .b.off{background:#80868b}
      .b.rec{background:#e5484d;animation:p 1.2s infinite}
      @keyframes p{0%,100%{box-shadow:0 0 0 0 rgba(229,72,77,.6)}50%{box-shadow:0 0 0 10px rgba(229,72,77,0)}}
      .tip{max-width:300px;padding:6px 10px;border-radius:8px;background:rgba(20,20,20,.85);color:#fff;display:none}
      .tip.show{display:block}
      .panel{display:none;width:280px;padding:14px;border-radius:12px;background:var(--bg);color:var(--fg);
        border:1px solid var(--line);box-shadow:0 8px 28px rgba(0,0,0,.25)}
      .panel.show{display:block}
      .panel h3{margin:0 0 10px;font-size:14px}
      .panel label{display:block;margin:10px 0 4px;color:var(--muted);font-size:12px}
      .panel select{width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font-size:13px}
    `),
    el('div', { class: 'wrap' },
      el('div', { class: 'panel', id: 'panel' },
        el('h3', { id: 'pTitle' }),
        el('label', { id: 'lApp' }), el('select', { id: 'appLang' }),
        el('label', { id: 'lDict' }), el('select', { id: 'dictLang' })),
      el('div', { class: 'tip', id: 'tip' }),
      el('div', { class: 'row' },
        el('button', { class: 'b', id: 'gear' }, '⚙️'),
        el('button', { class: 'b off', id: 'mic' }, '🎤'))));
  const $ = (id) => root.getElementById(id);
  const micBtn = $('mic'), tip = $('tip'), panel = $('panel');
  (document.body ? Promise.resolve() : new Promise(r => addEventListener('DOMContentLoaded', r)))
    .then(() => document.body.appendChild(host));

  let tipTimer;
  function say(text, ms = 3000) {
    tip.textContent = text; tip.classList.add('show');
    clearTimeout(tipTimer);
    if (ms) tipTimer = setTimeout(() => tip.classList.remove('show'), ms);
  }

  // тексты
  micBtn.title = t.mic; $('gear').title = t.settings;
  $('pTitle').textContent = t.settings; $('lApp').textContent = t.appLang; $('lDict').textContent = t.dict;

  // язык приложения
  const appSel = $('appLang');
  appSel.add(new Option(t.system, 'system'));
  APP_LOCALES.map(c => [c, langName(c)]).sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([c, n]) => appSel.add(new Option(n, c)));
  appSel.value = appLocale();
  appSel.onchange = () => setAppLocale(appSel.value);

  // язык диктовки
  const dictSel = $('dictLang');
  const dictItems = DICT_LANGS.map(c => [c, langName(c)]).sort((a, b) => a[1].localeCompare(b[1]));
  dictItems.forEach(([c, n]) => dictSel.add(new Option(n, c)));
  function setDictLang(v, announce) {
    lang = v; store.set('lang', v);
    dictSel.value = v;
    if (announce) say(t.dictSet + langName(v));
    if (listening) { stopMic(); startMic(); }
  }
  dictSel.onchange = () => setDictLang(dictSel.value, true);

  $('gear').onclick = (e) => { e.stopPropagation(); panel.classList.toggle('show'); };
  document.addEventListener('click', (e) => { if (!e.composedPath().includes(host)) panel.classList.remove('show'); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Comma') { e.preventDefault(); panel.classList.toggle('show'); }
    else if (e.key === 'Escape') panel.classList.remove('show');
  }, true);

  // ---------- чат по центру ----------
  // Колонка источников справа скрыта (hide.css), поэтому ответ, вопрос и поле ввода ставим по центру
  // свободной области справа от левой панели. Ширина колонки — как у поля ввода.
  function railRight() {
    let best = 0;
    for (let e = document.elementFromPoint(4, innerHeight / 2); e && e !== document.body; e = e.parentElement) {
      const r = e.getBoundingClientRect();
      if (r.left <= 4 && r.width < 400 && r.height > innerHeight * 0.8) best = Math.max(best, r.right);
    }
    return best;
  }
  function centerChat() {
    const target = (railRight() + document.documentElement.clientWidth) / 2;
    const inp = [...document.querySelectorAll('.t0ITR')].filter(e => e.offsetParent).pop();
    let w = 692;
    if (inp) {
      inp.style.transform = '';
      const r = inp.getBoundingClientRect(); w = r.width;
      inp.style.transform = `translateX(${Math.round(target - (r.left + r.width / 2))}px)`;
    }
    const place = (el, flex) => {
      let p = el.parentElement;  // у части обёрток display:contents и нулевая ширина
      while (p && !p.getBoundingClientRect().width) p = p.parentElement;
      if (!p) return;
      const box = p.getBoundingClientRect();
      const cw = Math.min(w, box.width);
      if (flex) el.style.flex = `0 0 ${cw}px`; else el.style.width = cw + 'px';
      el.style.maxWidth = cw + 'px';
      // не даём колонке вылезти за контейнер, иначе появляется горизонтальная прокрутка
      el.style.marginLeft = Math.max(0, Math.min(box.width - cw, Math.round(target - cw / 2 - box.left))) + 'px';
    };
    document.querySelectorAll('.Zkbeff > .pWvJNd').forEach(el => place(el, true));  // ответ
    document.querySelectorAll('.ilZyRc').forEach(el => place(el, false));           // вопрос
  }
  let centerQueued = 0;
  const queueCenter = () => { if (!centerQueued) centerQueued = requestAnimationFrame(() => { centerQueued = 0; centerChat(); }); };
  new MutationObserver(queueCenter).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', queueCenter);
  queueCenter();

  // ---------- поле ввода ----------
  // В «Режиме ИИ» поле вопроса — обычная textarea («Задайте вопрос»), в чате она последняя видимая.
  function input() {
    const list = [...document.querySelectorAll('textarea')].filter(el => el.offsetParent);
    return list[list.length - 1] || null;
  }
  const getText = (ta) => ta.value;
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  function setText(v) {
    const ta = input(); if (!ta) return;
    valueSetter.call(ta, v);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function send() {
    const ta = input(); if (!ta || !ta.value.trim()) return;
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    // запасной путь: кнопка «Отправить» рядом с полем
    setTimeout(() => {
      if (!ta.isConnected || !ta.value.trim()) return;
      let box = ta.parentElement;
      for (let i = 0; i < 8 && box; i++, box = box.parentElement) {
        const btn = [...box.querySelectorAll('button,[role="button"]')]
          .find(b => b.offsetParent && /отправ|send|надісл/i.test(b.getAttribute('aria-label') || ''));
        if (btn) { btn.click(); return; }
      }
    }, 400);
  }

  // ---------- распознавание ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, base = '';
  setDictLang(lang, false);
  if (!SR) { micBtn.disabled = true; micBtn.title = t.noSR; return; }

  const CMD = [
    { re: /\s*(отправ(ить|ь|ляй)|отправка|надіслати|надішли|send( it)?|submit)[.!。]?\s*$/i, run: () => { stopMic(); setTimeout(send, 150); } },
    { re: /\s*(очисти(ть)?|сотри|стереть|очистити|clear( all)?|erase)[.!。]?\s*$/i, run: () => { base = ''; setText(''); } },
  ];
  const noSpaces = () => /^(zh|ja|th)/.test(lang);

  function startMic() {
    const ed = input();
    if (!ed) { say(t.noInput); return; }
    const cur = getText(ed);
    base = cur ? cur.replace(/\s*$/, noSpaces() ? '' : ' ') : '';
    rec = new SR();
    rec.lang = lang; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i], tr = r[0].transcript;
        if (!r.isFinal) { interim += tr; continue; }
        let txt = tr.trim(), cmd = null;
        for (const c of CMD) if (c.re.test(txt)) { cmd = c; txt = txt.replace(c.re, ''); break; }
        if (txt) {
          const sep = noSpaces() || !base || /\s$/.test(base) ? '' : ' ';
          base += sep + txt.charAt(0).toUpperCase() + txt.slice(1) + (noSpaces() ? '' : ' ');
        }
        setText(base.trimEnd());
        if (cmd) { cmd.run(); return; }
      }
      if (interim) setText((base + interim).trimEnd());
    };
    rec.onerror = (e) => {
      const msg = { 'not-allowed': t.notAllowed, 'service-not-allowed': t.notAllowed, 'audio-capture': t.noMic,
        'network': t.network, 'language-not-supported': t.langNS }[e.error];
      if (msg) { stopMic(); say(msg, 6000); }
    };
    rec.onend = () => { if (listening) { try { rec.start(); } catch { stopMic(); } } };
    try { rec.start(); } catch (e) { say(t.micFail + e.message, 6000); return; }
    listening = true;
    micBtn.classList.remove('off'); micBtn.classList.add('rec');
    say(`🎤 ${langName(lang, uiLocale)}: ${t.listen}`, 0); // висит, пока микрофон включён
  }
  function stopMic() {
    listening = false;
    if (rec) { try { rec.stop(); } catch {} rec = null; }
    micBtn.classList.remove('rec'); micBtn.classList.add('off');
    tip.classList.remove('show');
  }
  const toggleMic = () => (listening ? stopMic() : startMic());
  micBtn.onclick = toggleMic;
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.code === 'Space') { e.preventDefault(); toggleMic(); }
  }, true);
})();
