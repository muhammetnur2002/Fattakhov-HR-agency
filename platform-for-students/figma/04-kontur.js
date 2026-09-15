/* ===========================================================================
   Fattakhov Students — направление C «Контур»
   Лендинг · лента свайпов (десктоп) · лента свайпов (мобайл)

   Монохромная швейцарская сетка. Ни одной тени и заливки-подложки:
   волосяная линия, типографика и пустота. Акцент — инверсия в чёрный
   блок. Читается как печатный бланк агентства, а не как приложение
   знакомств.

   Вставьте целиком в Scripter (Plugins → Scripter) и нажмите ▶.
   Шрифт: Archivo (стиль «SemiBold» — без пробела).
   =========================================================================== */

(async () => {
  const page = figma.currentPage;
  const Y = 5000;

  const F = 'Archivo';
  for (const style of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    await figma.loadFontAsync({ family: F, style });
  }

  const C = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  });
  const S = (h, o) => ({ type: 'SOLID', color: C(h), ...(o !== undefined ? { opacity: o } : {}) });
  const P = { bg: '#FFFFFF', ink: '#0A0A0A', line: '#0A0A0A', line2: '#C9C9C9', dim: '#5A5A5A', faint: '#8E8E8E' };

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
    if (o.stroke) { f.strokes = [S(o.stroke)]; f.strokeWeight = o.strokeW || 1; f.strokeAlign = 'INSIDE'; }
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
    s.name = ' '; s.resize(4, h); s.fills = []; s.cornerRadius = 0;
    parent.appendChild(s);
    s.layoutSizingHorizontal = 'FILL'; s.layoutSizingVertical = 'FIXED';
    return s;
  }
  function hr(parent, color) {
    const r = figma.createRectangle();
    r.name = '—'; r.resize(100, 1); r.fills = [S(color || P.line2)];
    add(parent, r, true);
    return r;
  }
  /** Кнопка фиксированной ширины. После resize() вертикальный режим
   *  становится FIXED с высотой из resize — возвращаем HUG, иначе
   *  кнопка схлопывается в полоску. */
  function wideBtn(label, glyph, invert, w) {
    const b = AL('HORIZONTAL', { name: label, gap: 14, pad: [16, 22, 16, 22], align: 'CENTER', justify: 'SPACE_BETWEEN', bg: invert ? P.ink : undefined, stroke: invert ? undefined : P.line });
    b.resize(w, 10);
    b.appendChild(txt(label, { size: 12.5, style: 'Medium', color: invert ? P.bg : P.ink, ls: 8 }));
    b.appendChild(txt(glyph, { size: 14, color: invert ? P.bg : P.ink }));
    return b;
  }
  function tag(label, invert) {
    const p = AL('HORIZONTAL', { name: label, pad: [5, 9, 5, 9], radius: 0, align: 'CENTER', bg: invert ? P.ink : undefined, stroke: invert ? undefined : P.line2 });
    p.appendChild(txt(label, { size: 11, style: 'Medium', color: invert ? P.bg : P.dim, ls: 2 }));
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
    b.appendChild(cube(size, 3.2));
    const wm = AL('VERTICAL', { name: 'Wordmark', gap: 1 });
    wm.appendChild(txt('FATTAKHOV', { size: fs, style: 'Bold', ls: 9 }));
    wm.appendChild(txt('HR AGENCY', { size: fs, style: 'Bold', ls: 9 }));
    b.appendChild(wm);
    return b;
  }
  /** Карточка-бланк: рамка, разлиновка, параметры сеткой. Совпадение —
   *  крупным числом: кольцо здесь было бы декором, которого нет нигде. */
  function card(d, w, h) {
    const c = AL('VERTICAL', { name: 'Карточка · ' + d.title, radius: 0, bg: P.bg, stroke: P.line, strokeW: d.edge ? 2 : 1 });
    c.resize(w, h);
    c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'FIXED';
    c.clipsContent = true;

    const head = AL('HORIZONTAL', { name: 'Шапка', pad: [16, 20, 16, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
    head.strokes = [S(P.line)]; head.strokeAlign = 'INSIDE';
    head.strokeTopWeight = 0; head.strokeLeftWeight = 0; head.strokeRightWeight = 0; head.strokeBottomWeight = 1;
    add(c, head, true);
    const co = AL('VERTICAL', { name: 'Компания', gap: 3 });
    co.appendChild(txt(d.company.toUpperCase(), { size: 11, style: 'Bold', ls: 10 }));
    co.appendChild(txt(d.city, { size: 11.5, color: P.faint }));
    head.appendChild(co);
    const mt = AL('VERTICAL', { name: 'Совпадение', align: 'MAX' });
    mt.appendChild(txt(String(d.match), { size: 26, style: 'Bold', ls: -3, lh: 100 }));
    mt.appendChild(txt('СОВПАДЕНИЕ', { size: 8.5, style: 'Medium', color: P.faint, ls: 12 }));
    head.appendChild(mt);

    const main = AL('VERTICAL', { name: 'Тело', pad: [22, 20, 20, 20] });
    add(c, main, true);
    add(main, txt(d.title, { size: 30, style: 'Bold', lh: 100, ls: -3 }), true);
    gap(main, 12);
    const pay = AL('HORIZONTAL', { name: 'Оплата', gap: 8, align: 'BASELINE' });
    pay.appendChild(txt(d.pay, { size: 16, style: 'SemiBold' }));
    pay.appendChild(txt('/ ' + d.per, { size: 12.5, color: P.faint }));
    add(main, pay, true);
    gap(main, 18);
    hr(main, P.line2);
    gap(main, 18);
    add(main, txt(d.body, { size: 13.5, lh: 160, color: P.dim }), true);
    gap(main, 20);
    const grid = AL('HORIZONTAL', { name: 'Параметры' });
    add(main, grid, true);
    for (const [k, v] of [['ДНИ', d.daysShort], ['НАГРУЗКА', d.hours], ['ФОРМАТ', d.format]]) {
      const cell = AL('VERTICAL', { name: k, gap: 5 });
      cell.appendChild(txt(k, { size: 8.5, style: 'Medium', color: P.faint, ls: 12 }));
      cell.appendChild(txt(v, { size: 12.5, style: 'Medium' }));
      grid.appendChild(cell);
      cell.layoutSizingHorizontal = 'FILL';
    }
    gap(main, 20);
    const tags = AL('HORIZONTAL', { name: 'Теги', gap: 6 });
    d.tags.forEach((t, i) => tags.appendChild(tag(t, i === 0)));
    add(main, tags, true);
    gap(main, 16);
    add(main, txt('✦  ' + d.why, { size: 12, color: P.faint }), true);
    return c;
  }
  function sqBtn(label, glyph, invert) {
    const b = AL('HORIZONTAL', { name: label, gap: 10, pad: [18, 22, 18, 22], align: 'CENTER', justify: 'CENTER', bg: invert ? P.ink : undefined, stroke: invert ? undefined : P.line });
    b.appendChild(txt(glyph, { size: 15, color: invert ? P.bg : P.ink }));
    b.appendChild(txt(label, { size: 11.5, style: 'Medium', color: invert ? P.bg : P.ink, ls: 9 }));
    return b;
  }

  const CARD = { title: 'Бариста', company: 'Кофейни «Север»', city: 'Москва, Хамовники', match: 92, pay: '3 200 — 4 200 ₽', per: 'смена', body: 'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен, нужен интерес к кофе.', daysShort: 'Пн — Вс', hours: 'до 24 ч', format: 'В офисе', tags: ['В ОФИСЕ', 'СМЕННЫЙ ГРАФИК'], why: 'Подходит под все ваши дни' };
  const CARD2 = { title: 'Ассистент таргетолога', company: 'Metrika Digital', city: 'Москва, Белорусская', match: 84, pay: '55 000 — 70 000 ₽', per: 'месяц', body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты, свой пул клиентов через три месяца.', daysShort: 'Пн — Пт', hours: 'до 24 ч', format: 'Гибрид', tags: ['ГИБРИД', 'АНАЛИТИКА'], why: 'Совпадает 3 из 4 ваших дней' };
  const created = [];

  /* ===================== ЛЕНДИНГ ===================== */
  const L = AL('VERTICAL', { name: 'C «Контур» · Лендинг — Desktop', bg: P.bg });
  L.x = 0; L.y = Y;
  L.resize(1440, 920);
  L.layoutSizingHorizontal = 'FIXED'; L.layoutSizingVertical = 'FIXED';
  L.clipsContent = true;
  page.appendChild(L);
  created.push(L);

  const lh = AL('HORIZONTAL', { name: 'Шапка', pad: [24, 48, 24, 48], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  lh.strokes = [S(P.line)]; lh.strokeAlign = 'INSIDE';
  lh.strokeTopWeight = 0; lh.strokeLeftWeight = 0; lh.strokeRightWeight = 0; lh.strokeBottomWeight = 1;
  add(L, lh, true);
  lh.appendChild(brandBlock(30, 10));
  const lacts = AL('HORIZONTAL', { name: 'Действия', align: 'CENTER' });
  const lg = AL('HORIZONTAL', { name: 'Войти', pad: [12, 20, 12, 20], stroke: P.line });
  lg.appendChild(txt('ВОЙТИ', { size: 12, style: 'Medium', ls: 10 }));
  lacts.appendChild(lg);
  const lc = AL('HORIZONTAL', { name: 'Начать', gap: 10, pad: [12, 20, 12, 20], align: 'CENTER', bg: P.ink });
  lc.appendChild(txt('НАЧАТЬ', { size: 12, style: 'Medium', color: P.bg, ls: 10 }));
  lc.appendChild(txt('→', { size: 12, color: P.bg }));
  lacts.appendChild(lc);
  lh.appendChild(lacts);

  const lb = AL('HORIZONTAL', { name: 'Первый экран', align: 'MIN' });
  add(L, lb, true);
  const copy = AL('VERTICAL', { name: 'Текст', pad: [76, 48, 60, 48] });
  copy.resize(830, 10);
  lb.appendChild(copy);
  copy.layoutSizingHorizontal = 'FIXED'; copy.layoutSizingVertical = 'HUG';
  copy.strokes = [S(P.line)]; copy.strokeAlign = 'INSIDE';
  copy.strokeTopWeight = 0; copy.strokeLeftWeight = 0; copy.strokeBottomWeight = 0; copy.strokeRightWeight = 1;
  const num = AL('HORIZONTAL', { name: 'Индекс', gap: 14, align: 'CENTER' });
  num.appendChild(txt('01', { size: 11, style: 'Bold', ls: 10 }));
  num.appendChild(txt('ДЛЯ СТУДЕНТОВ', { size: 11, style: 'Medium', color: P.faint, ls: 14 }));
  add(copy, num, true);
  gap(copy, 30);
  add(copy, txt('Работа,\nкоторая\nпомещается\nмежду парами', { size: 74, style: 'Bold', lh: 92, ls: -4.5 }), true);
  gap(copy, 34);
  hr(copy, P.line);
  gap(copy, 26);
  const lrow = AL('HORIZONTAL', { name: 'Подпись', gap: 40, align: 'MIN' });
  add(copy, lrow, true);
  const sub = txt('Смахните вправо — отклик уходит работодателю в ту же секунду. Никаких сопроводительных писем и ожидания на неделю.', { size: 15, lh: 160, color: P.dim });
  lrow.appendChild(sub);
  sub.textAutoResize = 'HEIGHT'; sub.resize(360, sub.height);
  const lbtns = AL('VERTICAL', { name: 'Кнопки', gap: 10 });
  const lb1 = wideBtn('СОЗДАТЬ ПРОФИЛЬ', '→', true, 280);
  lbtns.appendChild(lb1);
  lb1.layoutSizingHorizontal = 'FIXED';
  lb1.layoutSizingVertical = 'HUG';
  const lb2 = wideBtn('У МЕНЯ ЕСТЬ АККАУНТ', '', false, 280);
  lbtns.appendChild(lb2);
  lb2.layoutSizingHorizontal = 'FIXED';
  lb2.layoutSizingVertical = 'HUG';
  lrow.appendChild(lbtns);

  const lright = AL('VERTICAL', { name: 'Карточка', pad: [76, 48, 60, 48], align: 'CENTER' });
  lb.appendChild(lright);
  lright.layoutSizingHorizontal = 'FILL';
  lright.appendChild(card(CARD, 480, 560));

  /* ===================== ЛЕНТА — DESKTOP ===================== */
  const D = AL('VERTICAL', { name: 'C «Контур» · Лента свайпов — Desktop', bg: P.bg });
  D.x = 1560; D.y = Y;
  D.resize(1440, 1024);
  D.layoutSizingHorizontal = 'FIXED'; D.layoutSizingVertical = 'FIXED';
  D.clipsContent = true;
  page.appendChild(D);
  created.push(D);

  const dh = AL('HORIZONTAL', { name: 'Шапка', pad: [20, 40, 20, 40], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  dh.strokes = [S(P.line)]; dh.strokeAlign = 'INSIDE';
  dh.strokeTopWeight = 0; dh.strokeLeftWeight = 0; dh.strokeRightWeight = 0; dh.strokeBottomWeight = 1;
  add(D, dh, true);
  dh.appendChild(brandBlock(28, 9.5));
  const dtabs = AL('HORIZONTAL', { name: 'Вкладки', align: 'CENTER' });
  for (const [l, badge, active] of [['ЛЕНТА', null, true], ['ОТКЛИКИ', '2', false], ['ПРОПУЩЕННЫЕ', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 8, pad: [11, 18, 11, 18], align: 'CENTER', bg: active ? P.ink : undefined, stroke: active ? undefined : P.line2 });
    t.appendChild(txt(l, { size: 11.5, style: 'Medium', color: active ? P.bg : P.dim, ls: 9 }));
    if (badge) t.appendChild(txt(badge, { size: 11.5, style: 'Bold', color: active ? P.bg : P.ink }));
    dtabs.appendChild(t);
  }
  dh.appendChild(dtabs);
  const duser = AL('HORIZONTAL', { name: 'Пользователь', gap: 12, align: 'CENTER' });
  const dav = AL('HORIZONTAL', { name: 'Аватар', align: 'CENTER', justify: 'CENTER', stroke: P.line });
  dav.resize(32, 32);
  dav.layoutSizingHorizontal = 'FIXED'; dav.layoutSizingVertical = 'FIXED';
  dav.appendChild(txt('АК', { size: 11, style: 'Bold' }));
  duser.appendChild(dav);
  const dun = AL('VERTICAL', { name: 'Имя', gap: 2 });
  dun.appendChild(txt('АЛИСА КОВАЛЁВА', { size: 11, style: 'Medium', ls: 8 }));
  dun.appendChild(txt('НИУ ВШЭ', { size: 10.5, color: P.faint, ls: 8 }));
  duser.appendChild(dun);
  dh.appendChild(duser);

  const dbody = AL('HORIZONTAL', { name: 'Содержимое', align: 'MIN' });
  add(D, dbody, true);
  dbody.layoutSizingVertical = 'FILL';

  const dleft = AL('VERTICAL', { name: 'Слева', pad: [48, 44, 40, 48] });
  dleft.resize(560, 10);
  dbody.appendChild(dleft);
  dleft.layoutSizingHorizontal = 'FIXED'; dleft.layoutSizingVertical = 'FILL';
  dleft.strokes = [S(P.line)]; dleft.strokeAlign = 'INSIDE';
  dleft.strokeTopWeight = 0; dleft.strokeLeftWeight = 0; dleft.strokeBottomWeight = 0; dleft.strokeRightWeight = 1;
  add(dleft, txt('02', { size: 11, style: 'Bold', ls: 10 }), true);
  gap(dleft, 24);
  add(dleft, txt('Ваша\nподборка', { size: 54, style: 'Bold', lh: 94, ls: -4 }), true);
  gap(dleft, 26);
  add(dleft, txt('Вправо — отклик уходит работодателю в ту же секунду. Влево — вакансия уйдёт в «Пропущенные», откуда её всегда можно вернуть.', { size: 14.5, lh: 165, color: P.dim }), true);
  gap(dleft, 36);
  hr(dleft, P.line);
  gap(dleft, 24);
  const dstats = AL('HORIZONTAL', { name: 'Счётчики' });
  add(dleft, dstats, true);
  for (const [v, l] of [['11', 'ОСТАЛОСЬ'], ['1', 'ОТКЛИК'], ['0', 'ПРОПУЩЕНО']]) {
    const cell = AL('VERTICAL', { name: l, gap: 6 });
    cell.appendChild(txt(v, { size: 34, style: 'Bold', ls: -3, lh: 100 }));
    cell.appendChild(txt(l, { size: 9, style: 'Medium', color: P.faint, ls: 14 }));
    dstats.appendChild(cell);
    cell.layoutSizingHorizontal = 'FILL';
  }
  gap(dleft, 40);
  const dctrl = AL('HORIZONTAL', { name: 'Кнопки решения' });
  add(dleft, dctrl, true);
  const s1 = sqBtn('ПРОПУСТИТЬ', '✕', false);
  dctrl.appendChild(s1); s1.layoutSizingHorizontal = 'FILL';
  const s2 = sqBtn('ОТКЛИКНУТЬСЯ', '✦', true);
  dctrl.appendChild(s2); s2.layoutSizingHorizontal = 'FILL';
  gap(dleft, 16);
  add(dleft, txt('←   Смахните карточку или нажмите стрелку   →', { size: 11.5, color: P.faint }), true);

  const dright = AL('VERTICAL', { name: 'Справа', pad: [48, 48, 40, 44], align: 'CENTER' });
  dbody.appendChild(dright);
  dright.layoutSizingHorizontal = 'FILL'; dright.layoutSizingVertical = 'FILL';
  const ddeck = figma.createFrame();
  ddeck.name = 'Колода'; ddeck.resize(500, 620); ddeck.fills = []; ddeck.cornerRadius = 0; ddeck.clipsContent = false;
  add(dright, ddeck, true);
  ddeck.layoutSizingHorizontal = 'FIXED'; ddeck.layoutSizingVertical = 'FIXED';
  const dback = card(CARD2, 460, 540);
  ddeck.appendChild(dback);
  dback.x = 20; dback.y = 40; dback.opacity = 0.45;
  const dfront = card(Object.assign({}, CARD, { edge: true }), 460, 540);
  ddeck.appendChild(dfront);
  dfront.rotation = -4;
  dfront.x = 22; dfront.y = 0;
  const dstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [10, 18, 10, 18], bg: P.ink });
  dstamp.appendChild(txt('ОТКЛИК', { size: 15, style: 'Bold', color: P.bg, ls: 14 }));
  ddeck.appendChild(dstamp);
  dstamp.rotation = 4; dstamp.x = 0; dstamp.y = -14;

  /* ===================== ЛЕНТА — MOBILE ===================== */
  const M = AL('VERTICAL', { name: 'C «Контур» · Лента свайпов — Mobile', bg: P.bg });
  M.x = 3160; M.y = Y;
  M.resize(390, 844);
  M.layoutSizingHorizontal = 'FIXED'; M.layoutSizingVertical = 'FIXED';
  M.clipsContent = true;
  page.appendChild(M);
  created.push(M);

  const msb = AL('HORIZONTAL', { name: 'Статус-бар', pad: [14, 24, 8, 26], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(M, msb, true);
  msb.appendChild(txt('9:41', { size: 13.5, style: 'Bold' }));
  const mic = AL('HORIZONTAL', { name: 'Иконки', gap: 6, align: 'CENTER' });
  mic.appendChild(txt('▮▮▮', { size: 10 }));
  mic.appendChild(txt('◗', { size: 12 }));
  mic.appendChild(txt('▰', { size: 12 }));
  msb.appendChild(mic);

  const mh = AL('HORIZONTAL', { name: 'Шапка', pad: [8, 20, 14, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  mh.strokes = [S(P.line)]; mh.strokeAlign = 'INSIDE';
  mh.strokeTopWeight = 0; mh.strokeLeftWeight = 0; mh.strokeRightWeight = 0; mh.strokeBottomWeight = 1;
  add(M, mh, true);
  mh.appendChild(brandBlock(24, 8));
  const mav = AL('HORIZONTAL', { name: 'Аватар', align: 'CENTER', justify: 'CENTER', stroke: P.line });
  mav.resize(30, 30);
  mav.layoutSizingHorizontal = 'FIXED'; mav.layoutSizingVertical = 'FIXED';
  mav.appendChild(txt('АК', { size: 10.5, style: 'Bold' }));
  mh.appendChild(mav);

  const mtabs = AL('HORIZONTAL', { name: 'Вкладки' });
  add(M, mtabs, true);
  for (const [l, badge, active] of [['ЛЕНТА', null, true], ['ОТКЛИКИ', '2', false], ['ПРОПУЩ.', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 6, pad: [12, 10, 12, 10], align: 'CENTER', justify: 'CENTER', bg: active ? P.ink : undefined });
    t.strokes = [S(P.line)]; t.strokeAlign = 'INSIDE';
    t.strokeTopWeight = 0; t.strokeLeftWeight = 0; t.strokeRightWeight = 0; t.strokeBottomWeight = 1;
    t.appendChild(txt(l, { size: 10.5, style: 'Medium', color: active ? P.bg : P.dim, ls: 9 }));
    if (badge) t.appendChild(txt(badge, { size: 10.5, style: 'Bold', color: active ? P.bg : P.ink }));
    mtabs.appendChild(t);
    t.layoutSizingHorizontal = 'FILL';
  }

  const mb = AL('VERTICAL', { name: 'Содержимое', pad: [22, 20, 0, 20] });
  add(M, mb, true);
  const mstats = AL('HORIZONTAL', { name: 'Счётчики' });
  add(mb, mstats, true);
  for (const [v, l] of [['11', 'ОСТАЛОСЬ'], ['1', 'ОТКЛИК'], ['0', 'ПРОПУЩЕНО']]) {
    const cell = AL('VERTICAL', { name: l, gap: 4 });
    cell.appendChild(txt(v, { size: 24, style: 'Bold', ls: -3, lh: 100 }));
    cell.appendChild(txt(l, { size: 8, style: 'Medium', color: P.faint, ls: 12 }));
    mstats.appendChild(cell);
    cell.layoutSizingHorizontal = 'FILL';
  }
  gap(mb, 20);

  const mdeck = figma.createFrame();
  mdeck.name = 'Колода'; mdeck.resize(350, 500); mdeck.fills = []; mdeck.cornerRadius = 0; mdeck.clipsContent = false;
  add(mb, mdeck, true);
  mdeck.layoutSizingVertical = 'FIXED';
  const mback = card(Object.assign({}, CARD2, { body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты и свой пул клиентов.' }), 330, 452);
  mdeck.appendChild(mback);
  mback.x = 14; mback.y = 26; mback.opacity = 0.4;
  const mfront = card(Object.assign({}, CARD, { edge: true }), 330, 452);
  mdeck.appendChild(mfront);
  mfront.rotation = -4;
  mfront.x = 14; mfront.y = 0;
  const mstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [8, 14, 8, 14], bg: P.ink });
  mstamp.appendChild(txt('ОТКЛИК', { size: 13, style: 'Bold', color: P.bg, ls: 14 }));
  mdeck.appendChild(mstamp);
  mstamp.rotation = 4; mstamp.x = 0; mstamp.y = -12;

  const mctrl = AL('HORIZONTAL', { name: 'Кнопки решения', pad: [26, 0, 0, 0] });
  add(mb, mctrl, true);
  const ms1 = sqBtn('ПРОПУСТИТЬ', '✕', false);
  mctrl.appendChild(ms1); ms1.layoutSizingHorizontal = 'FILL';
  const ms2 = sqBtn('ОТКЛИК', '✦', true);
  mctrl.appendChild(ms2); ms2.layoutSizingHorizontal = 'FILL';
  const mhb = figma.createRectangle();
  mhb.name = 'Home indicator'; mhb.resize(134, 5); mhb.cornerRadius = 999; mhb.fills = [S(P.ink, 0.25)];
  M.appendChild(mhb);
  mhb.layoutPositioning = 'ABSOLUTE';
  mhb.x = (390 - 134) / 2; mhb.y = 828;

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
})();
