/* ===========================================================================
   Fattakhov Students — направление B «Бумага»
   Лендинг · лента свайпов (десктоп) · лента свайпов (мобайл)

   Светлая редакционная тема. Не инверсия ради разнообразия: студент
   открывает ленту днём на улице, где тёмный экран читается хуже. Графит
   бренда работает как цвет текста и кнопок, а не как фон.

   Вставьте целиком в Scripter (Plugins → Scripter) и нажмите ▶.
   Шрифт: Golos Text (стиль «SemiBold» — без пробела).
   =========================================================================== */

(async () => {
  const page = figma.currentPage;
  const Y = 3800;

  const F = 'Golos Text';
  for (const style of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    await figma.loadFontAsync({ family: F, style });
  }

  const C = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  });
  const S = (h, o) => ({ type: 'SOLID', color: C(h), ...(o !== undefined ? { opacity: o } : {}) });

  const P = {
    bg: '#F2F1ED', card: '#FFFFFF', ink: '#16181A', line: '#E2E0DA', line2: '#D2CFC7',
    dim: '#6E7276', faint: '#9A9C9E',
    accent: '#41597A', accentSoft: '#E8EDF4',
    yes: '#2E6B52', yesSoft: '#E2EFE8', warn: '#8A6A1F', warnSoft: '#F6EEDC',
  };

  function AL(dir, o = {}) {
    const f = figma.createFrame();
    f.name = o.name || 'group';
    f.layoutMode = dir;
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
    f.fills = o.bg ? [S(o.bg, o.bgOp)] : [];
    f.itemSpacing = o.gap || 0;
    if (o.pad) { const [t, r, b, l] = o.pad; f.paddingTop = t; f.paddingRight = r; f.paddingBottom = b; f.paddingLeft = l; }
    f.cornerRadius = o.radius !== undefined ? o.radius : 0;
    if (o.stroke) { f.strokes = [S(o.stroke)]; f.strokeWeight = o.strokeW || 1; }
    if (o.align) f.counterAxisAlignItems = o.align;
    if (o.justify) f.primaryAxisAlignItems = o.justify;
    return f;
  }
  function txt(chars, o = {}) {
    const t = figma.createText();
    t.fontName = { family: F, style: o.style || 'Regular' };
    t.characters = chars; t.fontSize = o.size || 14;
    t.fills = [S(o.color || P.ink, o.op)];
    if (o.lh) t.lineHeight = { unit: 'PERCENT', value: o.lh };
    if (o.ls !== undefined) t.letterSpacing = { unit: 'PERCENT', value: o.ls };
    t.name = chars.slice(0, 24);
    return t;
  }
  function add(parent, node, fill) {
    parent.appendChild(node);
    if (fill) { if (node.type === 'TEXT') node.textAutoResize = 'HEIGHT'; node.layoutSizingHorizontal = 'FILL'; }
    return node;
  }
  function gap(parent, h) {
    const s = figma.createFrame();
    s.name = ' '; s.resize(4, h); s.fills = [];
    parent.appendChild(s);
    s.layoutSizingHorizontal = 'FILL'; s.layoutSizingVertical = 'FIXED';
    return s;
  }
  const shadow = (y, blur, a) => ({ type: 'DROP_SHADOW', color: { r: 0.09, g: 0.1, b: 0.11, a }, offset: { x: 0, y }, radius: blur, spread: 0, visible: true, blendMode: 'NORMAL' });
  function tag(label, tone) {
    const map = { accent: [P.accentSoft, P.accent], yes: [P.yesSoft, P.yes], warn: [P.warnSoft, P.warn], mute: ['#EBE9E4', P.dim] };
    const [bg, fg] = map[tone || 'mute'];
    const p = AL('HORIZONTAL', { name: label, pad: [5, 10, 5, 10], radius: 8, align: 'CENTER', bg });
    p.appendChild(txt(label, { size: 11.5, color: fg, style: 'Medium' }));
    return p;
  }
  const MARK = 'M28 2 L54 17 L54 47 L28 62 L2 47 L2 17 Z M2 17 L28 32 L54 17 M28 32 L28 62';
  function cube(size, weight) {
    const v = figma.createVector();
    v.name = 'FHR mark';
    v.vectorPaths = [{ windingRule: 'NONE', data: MARK }];
    v.strokes = [S(P.ink)]; v.strokeWeight = weight;
    v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; v.fills = [];
    v.resize(56, 64); v.rescale(size / 64);
    return v;
  }
  function brandBlock(size, fs) {
    const b = AL('HORIZONTAL', { name: 'Логотип', gap: 10, align: 'CENTER' });
    b.appendChild(cube(size, 3.4));
    const wm = AL('VERTICAL', { name: 'Wordmark', gap: 1 });
    wm.appendChild(txt('FATTAKHOV', { size: fs, style: 'SemiBold', ls: 7 }));
    wm.appendChild(txt('HR AGENCY', { size: fs, style: 'SemiBold', ls: 7 }));
    b.appendChild(wm);
    return b;
  }
  function logoSquare(size, initials) {
    const a = AL('HORIZONTAL', { name: 'Логотип', radius: size * 0.3, align: 'CENTER', justify: 'CENTER', bg: '#EFEDE8', stroke: P.line });
    a.resize(size, size);
    a.layoutSizingHorizontal = 'FIXED'; a.layoutSizingVertical = 'FIXED';
    a.appendChild(txt(initials, { size: size * 0.3, style: 'SemiBold', color: P.dim }));
    return a;
  }
  /** Белый лист, тонкая линия, мягкая тень. Совпадение — числом:
   *  на светлом фоне тонкое кольцо теряется. */
  function card(d, w, h) {
    const c = AL('VERTICAL', { name: 'Карточка · ' + d.title, pad: [24, 24, 24, 24], radius: 20, bg: P.card, stroke: d.edge ? P.yes : P.line, strokeW: d.edge ? 2 : 1 });
    c.effects = d.edge
      ? [{ type: 'DROP_SHADOW', color: { ...C(P.yes), a: 0.22 }, offset: { x: 0, y: 12 }, radius: 36, spread: 0, visible: true, blendMode: 'NORMAL' }, shadow(20, 44, 0.1)]
      : [shadow(16, 40, 0.08)];
    c.resize(w, h);
    c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'FIXED';
    c.clipsContent = true;
    const top = AL('HORIZONTAL', { name: 'Компания', gap: 12, align: 'CENTER' });
    add(c, top, true);
    top.appendChild(logoSquare(44, d.initials));
    const co = AL('VERTICAL', { name: 'Название', gap: 3 });
    co.appendChild(txt(d.company, { size: 13.5, style: 'Medium' }));
    co.appendChild(txt(d.city, { size: 12.5, color: P.faint }));
    add(top, co, true);
    const m = AL('VERTICAL', { name: 'Совпадение', gap: 1, align: 'MAX' });
    m.appendChild(txt(d.match + '%', { size: 18, style: 'SemiBold', color: P.yes, ls: -2 }));
    m.appendChild(txt('совпадение', { size: 10, color: P.faint }));
    top.appendChild(m);
    gap(c, 20);
    add(c, txt(d.title, { size: 27, style: 'SemiBold', lh: 108, ls: -2.6 }), true);
    gap(c, 8);
    const pay = AL('HORIZONTAL', { name: 'Оплата', gap: 7, align: 'BASELINE' });
    pay.appendChild(txt(d.pay, { size: 16, style: 'SemiBold', color: P.accent }));
    pay.appendChild(txt(d.per, { size: 13, color: P.faint }));
    add(c, pay, true);
    gap(c, 18);
    const rule = figma.createRectangle();
    rule.name = 'Линия'; rule.resize(w - 48, 1); rule.fills = [S(P.line)];
    add(c, rule, true);
    gap(c, 18);
    add(c, txt(d.body, { size: 14, lh: 158, color: P.dim }), true);
    gap(c, 20);
    const days = AL('HORIZONTAL', { name: 'Дни', gap: 4, align: 'CENTER' });
    for (const dd of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      const on = d.days.indexOf(dd) !== -1;
      const ch = AL('HORIZONTAL', { name: dd, pad: [4, 7, 4, 7], radius: 6, bg: on ? '#EAE8E2' : undefined });
      ch.appendChild(txt(dd, { size: 11, style: 'Medium', color: on ? P.ink : P.faint }));
      days.appendChild(ch);
    }
    days.appendChild(txt(d.hours, { size: 11, color: P.faint }));
    add(c, days, true);
    gap(c, 12);
    const tags = AL('HORIZONTAL', { name: 'Теги', gap: 6 });
    d.tags.forEach((t, i) => tags.appendChild(tag(t, i === 0 ? 'accent' : 'mute')));
    add(c, tags, true);
    gap(c, 16);
    add(c, txt('✦   ' + d.why, { size: 12.5, color: P.faint }), true);
    return c;
  }
  function rbtn(size, glyph, tone) {
    const b = AL('HORIZONTAL', { name: glyph, radius: 999, align: 'CENTER', justify: 'CENTER', bg: tone === 'yes' ? P.yes : P.card, stroke: tone === 'yes' ? P.yes : P.line2 });
    b.resize(size, size);
    b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED';
    b.effects = [shadow(6, 18, 0.1)];
    b.appendChild(txt(glyph, { size: tone === 'small' ? 14 : 18, color: tone === 'yes' ? '#FFFFFF' : P.dim }));
    return b;
  }

  const CARD = { title: 'Бариста', company: 'Кофейни «Север»', city: 'Москва, Хамовники', initials: 'КС', match: 92, pay: '3 200 — 4 200 ₽', per: 'за смену', body: 'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен, нужен интерес к кофе.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], hours: 'до 24 ч/нед', tags: ['В офисе', 'Сменный график', 'Без опыта'], why: 'Подходит под все ваши дни' };
  const CARD2 = Object.assign({}, CARD, { title: 'Ассистент таргетолога', company: 'Metrika Digital', city: 'Москва, Белорусская', initials: 'MD', match: 84, pay: '55 000 — 70 000 ₽', per: 'в месяц', body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты, свой пул клиентов через три месяца.', tags: ['Гибрид', 'Аналитика'], why: 'Совпадает 3 из 4 ваших дней' });
  const created = [];

  /* ===================== ЛЕНДИНГ ===================== */
  const L = AL('VERTICAL', { name: 'B «Бумага» · Лендинг — Desktop', bg: P.bg });
  L.x = 0; L.y = Y;
  L.resize(1440, 920);
  L.layoutSizingHorizontal = 'FIXED'; L.layoutSizingVertical = 'FIXED';
  L.clipsContent = true;
  page.appendChild(L);
  created.push(L);

  const lh = AL('HORIZONTAL', { name: 'Шапка', pad: [26, 56, 26, 56], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  lh.strokes = [S(P.line)]; lh.strokeAlign = 'INSIDE';
  lh.strokeTopWeight = 0; lh.strokeLeftWeight = 0; lh.strokeRightWeight = 0; lh.strokeBottomWeight = 1;
  add(L, lh, true);
  lh.appendChild(brandBlock(30, 10.5));
  const lacts = AL('HORIZONTAL', { name: 'Действия', gap: 10, align: 'CENTER' });
  const lg = AL('HORIZONTAL', { name: 'Войти', pad: [11, 16, 11, 16], radius: 10 });
  lg.appendChild(txt('Войти', { size: 13.5, style: 'Medium', color: P.dim }));
  lacts.appendChild(lg);
  const lc = AL('HORIZONTAL', { name: 'Начать', gap: 8, pad: [11, 18, 11, 20], radius: 10, align: 'CENTER', bg: P.ink });
  lc.appendChild(txt('Начать', { size: 13.5, style: 'Medium', color: P.card }));
  lc.appendChild(txt('→', { size: 13.5, style: 'Medium', color: P.card }));
  lacts.appendChild(lc);
  lh.appendChild(lacts);

  const hero = AL('HORIZONTAL', { name: 'Первый экран', gap: 56, pad: [86, 56, 0, 56], align: 'CENTER' });
  add(L, hero, true);
  const copy = AL('VERTICAL', { name: 'Текст' });
  copy.resize(660, 10);
  hero.appendChild(copy);
  copy.layoutSizingHorizontal = 'FIXED'; copy.layoutSizingVertical = 'HUG';
  add(copy, txt('FATTAKHOV HR AGENCY · ДЛЯ СТУДЕНТОВ', { size: 11, style: 'Medium', color: P.accent, ls: 16 }), true);
  gap(copy, 26);
  add(copy, txt('Работа, которая\nпомещается\nмежду парами', { size: 62, style: 'Bold', lh: 100, ls: -4 }), true);
  gap(copy, 26);
  const sub = txt('Смахните вправо — отклик уходит работодателю в ту же секунду. Никаких сопроводительных писем и ожидания на неделю.', { size: 17, lh: 158, color: P.dim });
  copy.appendChild(sub);
  sub.textAutoResize = 'HEIGHT'; sub.resize(520, sub.height);
  gap(copy, 34);
  const btns = AL('HORIZONTAL', { name: 'Кнопки', gap: 12, align: 'CENTER' });
  const b1 = AL('HORIZONTAL', { name: 'Создать профиль', gap: 10, pad: [17, 24, 17, 28], radius: 14, align: 'CENTER', bg: P.ink });
  b1.effects = [shadow(10, 26, 0.18)];
  b1.appendChild(txt('Создать профиль', { size: 15, style: 'Medium', color: P.card }));
  b1.appendChild(txt('→', { size: 15, style: 'Medium', color: P.card }));
  btns.appendChild(b1);
  const b2 = AL('HORIZONTAL', { name: 'Есть аккаунт', pad: [17, 26, 17, 26], radius: 14, bg: P.card, stroke: P.line2 });
  b2.appendChild(txt('У меня уже есть аккаунт', { size: 15, style: 'Medium' }));
  btns.appendChild(b2);
  copy.appendChild(btns);
  gap(copy, 30);
  const trust = AL('HORIZONTAL', { name: 'Про ПДн', gap: 9, align: 'CENTER' });
  trust.appendChild(txt('◈', { size: 12, color: P.accent }));
  const tt = txt('Персональные данные шифруются и передаются только тем компаниям, которым вы сами откликнулись', { size: 12.5, lh: 150, color: P.faint });
  trust.appendChild(tt);
  tt.textAutoResize = 'HEIGHT'; tt.resize(430, tt.height);
  copy.appendChild(trust);
  hero.appendChild(card(CARD, 384, 470));

  /* ===================== ЛЕНТА — DESKTOP ===================== */
  const D = AL('VERTICAL', { name: 'B «Бумага» · Лента свайпов — Desktop', bg: P.bg });
  D.x = 1560; D.y = Y;
  D.resize(1440, 1024);
  D.layoutSizingHorizontal = 'FIXED'; D.layoutSizingVertical = 'FIXED';
  D.clipsContent = true;
  page.appendChild(D);
  created.push(D);

  const dh = AL('HORIZONTAL', { name: 'Шапка', pad: [21, 40, 21, 40], align: 'CENTER', justify: 'SPACE_BETWEEN', bg: P.card });
  dh.strokes = [S(P.line)]; dh.strokeAlign = 'INSIDE';
  dh.strokeTopWeight = 0; dh.strokeLeftWeight = 0; dh.strokeRightWeight = 0; dh.strokeBottomWeight = 1;
  add(D, dh, true);
  dh.appendChild(brandBlock(28, 10));
  const dtabs = AL('HORIZONTAL', { name: 'Вкладки', gap: 4, align: 'CENTER' });
  for (const [l, badge, active] of [['Лента', null, true], ['Отклики', '2', false], ['Пропущенные', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 7, pad: [9, 15, 9, 15], radius: 10, align: 'CENTER', bg: active ? P.ink : undefined });
    t.appendChild(txt(l, { size: 13.5, style: 'Medium', color: active ? P.card : P.dim }));
    if (badge) {
      const bd = AL('HORIZONTAL', { name: 'b', pad: [2, 6, 2, 6], radius: 999, bg: active ? '#FFFFFF' : '#E7E5E0' });
      bd.appendChild(txt(badge, { size: 10.5, color: active ? P.ink : P.dim }));
      t.appendChild(bd);
    }
    dtabs.appendChild(t);
  }
  dh.appendChild(dtabs);
  const dchip = AL('HORIZONTAL', { name: 'Пользователь', gap: 10, pad: [4, 14, 4, 4], radius: 999, bg: '#EBE9E4', align: 'CENTER' });
  const dav = figma.createEllipse();
  dav.name = 'Аватар'; dav.resize(30, 30); dav.fills = [S('#D6D3CC')];
  dchip.appendChild(dav);
  const dun = AL('VERTICAL', { name: 'Имя', gap: 1 });
  dun.appendChild(txt('Алиса Ковалёва', { size: 13, style: 'Medium' }));
  dun.appendChild(txt('НИУ ВШЭ', { size: 11, color: P.faint }));
  dchip.appendChild(dun);
  dh.appendChild(dchip);

  const dbody = AL('VERTICAL', { name: 'Содержимое', pad: [40, 40, 0, 40], align: 'CENTER' });
  add(D, dbody, true);
  const dcol = AL('VERTICAL', { name: 'Колонка' });
  dcol.resize(430, 10);
  dbody.appendChild(dcol);
  dcol.layoutSizingHorizontal = 'FIXED'; dcol.layoutSizingVertical = 'HUG';
  add(dcol, txt('Ваша подборка', { size: 32, style: 'Bold', ls: -2.8 }), true);
  gap(dcol, 8);
  add(dcol, txt('Вправо — отклик уходит работодателю. Влево — вакансия уйдёт в «Пропущенные».', { size: 13.5, lh: 150, color: P.dim }), true);
  gap(dcol, 22);
  const dmeter = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(dcol, dmeter, true);
  dmeter.appendChild(txt('11 вакансий в подборке', { size: 12.5, color: P.faint }));
  const dcnt = AL('HORIZONTAL', { name: 'Итог', gap: 14, align: 'CENTER' });
  dcnt.appendChild(txt('✓ 1', { size: 12.5, color: P.yes, style: 'Medium' }));
  dcnt.appendChild(txt('0 пропущено', { size: 12.5, color: P.faint }));
  dmeter.appendChild(dcnt);
  gap(dcol, 8);
  const dbar = figma.createFrame();
  dbar.name = 'Прогресс'; dbar.resize(430, 3); dbar.cornerRadius = 999;
  dbar.fills = [S('#DEDBD4')]; dbar.clipsContent = true;
  const dbf = figma.createRectangle();
  dbf.name = 'Заполнение'; dbf.resize(40, 3); dbf.cornerRadius = 999; dbf.fills = [S(P.ink)];
  dbar.appendChild(dbf);
  add(dcol, dbar, true);
  gap(dcol, 26);

  const ddeck = figma.createFrame();
  ddeck.name = 'Колода'; ddeck.resize(430, 560); ddeck.fills = []; ddeck.clipsContent = false;
  add(dcol, ddeck, true);
  ddeck.layoutSizingVertical = 'FIXED';
  const dback = card(CARD2, 384, 462);
  ddeck.appendChild(dback);
  dback.rescale(0.95);
  const dfront = card(Object.assign({}, CARD, { edge: true }), 384, 462);
  ddeck.appendChild(dfront);
  dfront.rotation = -6;
  dfront.x = 34; dfront.y = 6;
  const dfb = dfront.absoluteBoundingBox, ddb = ddeck.absoluteBoundingBox;
  dback.x = (430 - dback.width) / 2;
  dback.y = (dfb.y - ddb.y + dfb.height) + 16 - dback.height;
  const dstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [8, 14, 8, 14], radius: 8, bg: P.yes });
  dstamp.appendChild(txt('ОТКЛИК', { size: 15, style: 'Bold', color: '#FFFFFF', ls: 10 }));
  ddeck.appendChild(dstamp);
  dstamp.rotation = 6; dstamp.x = 12; dstamp.y = -10;

  gap(dcol, 26);
  const dctrl = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 20, align: 'CENTER', justify: 'CENTER' });
  add(dcol, dctrl, true);
  dctrl.appendChild(rbtn(56, '✕'));
  dctrl.appendChild(rbtn(44, '↺', 'small'));
  dctrl.appendChild(rbtn(56, '✦', 'yes'));
  gap(dcol, 16);
  const dhint = txt('←   Смахните карточку или нажмите стрелку   →', { size: 12.5, color: P.faint });
  dhint.textAlignHorizontal = 'CENTER';
  add(dcol, dhint, true);

  /* ===================== ЛЕНТА — MOBILE ===================== */
  const M = AL('VERTICAL', { name: 'B «Бумага» · Лента свайпов — Mobile', bg: P.bg });
  M.x = 3160; M.y = Y;
  M.resize(390, 844);
  M.layoutSizingHorizontal = 'FIXED'; M.layoutSizingVertical = 'FIXED';
  M.clipsContent = true;
  page.appendChild(M);
  created.push(M);

  const msb = AL('HORIZONTAL', { name: 'Статус-бар', pad: [14, 24, 8, 26], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(M, msb, true);
  msb.appendChild(txt('9:41', { size: 13.5, style: 'SemiBold' }));
  const mic = AL('HORIZONTAL', { name: 'Иконки', gap: 6, align: 'CENTER' });
  mic.appendChild(txt('▮▮▮', { size: 10 }));
  mic.appendChild(txt('◗', { size: 12 }));
  mic.appendChild(txt('▰', { size: 12 }));
  msb.appendChild(mic);

  const mh = AL('HORIZONTAL', { name: 'Шапка', pad: [8, 20, 12, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(M, mh, true);
  mh.appendChild(brandBlock(24, 8.5));
  const mchip = AL('HORIZONTAL', { name: 'Пользователь', pad: [4, 4, 4, 4], radius: 999, bg: '#EBE9E4', align: 'CENTER' });
  const mav = figma.createEllipse();
  mav.name = 'Аватар'; mav.resize(28, 28); mav.fills = [S('#D6D3CC')];
  mchip.appendChild(mav);
  mh.appendChild(mchip);

  const mtw = AL('HORIZONTAL', { name: 'Вкладки', pad: [0, 20, 14, 20], gap: 6 });
  add(M, mtw, true);
  for (const [l, badge, active] of [['Лента', null, true], ['Отклики', '2', false], ['Пропущ.', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 6, pad: [8, 13, 8, 13], radius: 10, align: 'CENTER', bg: active ? P.ink : P.card, stroke: active ? undefined : P.line });
    t.appendChild(txt(l, { size: 12.5, style: 'Medium', color: active ? P.card : P.dim }));
    if (badge) {
      const bd = AL('HORIZONTAL', { name: 'b', pad: [1, 5, 1, 5], radius: 999, bg: active ? '#FFFFFF' : '#E7E5E0' });
      bd.appendChild(txt(badge, { size: 10, color: active ? P.ink : P.dim }));
      t.appendChild(bd);
    }
    mtw.appendChild(t);
  }

  const mb = AL('VERTICAL', { name: 'Содержимое', pad: [6, 20, 0, 20] });
  add(M, mb, true);
  const mmeter = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(mb, mmeter, true);
  mmeter.appendChild(txt('11 вакансий в подборке', { size: 11.5, color: P.faint }));
  mmeter.appendChild(txt('✓ 1   ·   0 пропущено', { size: 11.5, color: P.faint }));
  gap(mb, 7);
  const mbar = figma.createFrame();
  mbar.name = 'Прогресс'; mbar.resize(350, 3); mbar.cornerRadius = 999;
  mbar.fills = [S('#DEDBD4')]; mbar.clipsContent = true;
  const mbf = figma.createRectangle();
  mbf.name = 'Заполнение'; mbf.resize(32, 3); mbf.cornerRadius = 999; mbf.fills = [S(P.ink)];
  mbar.appendChild(mbf);
  add(mb, mbar, true);
  gap(mb, 20);

  const mdeck = figma.createFrame();
  mdeck.name = 'Колода'; mdeck.resize(350, 470); mdeck.fills = []; mdeck.clipsContent = false;
  add(mb, mdeck, true);
  mdeck.layoutSizingVertical = 'FIXED';
  const mback = card(Object.assign({}, CARD2, { body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты и свой пул клиентов.' }), 350, 428);
  mdeck.appendChild(mback);
  mback.rescale(0.94);
  const mfront = card(Object.assign({}, CARD, { edge: true }), 350, 428);
  mdeck.appendChild(mfront);
  mfront.rotation = -5;
  mfront.x = 20; mfront.y = 4;
  const mfb = mfront.absoluteBoundingBox, mdb = mdeck.absoluteBoundingBox;
  mback.x = (350 - mback.width) / 2;
  mback.y = (mfb.y - mdb.y + mfb.height) + 14 - mback.height;
  const mstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [7, 12, 7, 12], radius: 8, bg: P.yes });
  mstamp.appendChild(txt('ОТКЛИК', { size: 13.5, style: 'Bold', color: '#FFFFFF', ls: 10 }));
  mdeck.appendChild(mstamp);
  mstamp.rotation = 7; mstamp.x = 2; mstamp.y = -8;

  const mctrl = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 18, align: 'CENTER', justify: 'CENTER', pad: [22, 0, 0, 0] });
  add(mb, mctrl, true);
  mctrl.appendChild(rbtn(54, '✕'));
  mctrl.appendChild(rbtn(42, '↺', 'small'));
  mctrl.appendChild(rbtn(54, '✦', 'yes'));
  const mhb = figma.createRectangle();
  mhb.name = 'Home indicator'; mhb.resize(134, 5); mhb.cornerRadius = 999; mhb.fills = [S(P.ink, 0.25)];
  M.appendChild(mhb);
  mhb.layoutPositioning = 'ABSOLUTE';
  mhb.x = (390 - 134) / 2; mhb.y = 828;

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
})();
