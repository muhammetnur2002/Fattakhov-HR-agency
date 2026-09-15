/* ===========================================================================
   Fattakhov Students — направление D «Сигнал»
   Лендинг · лента свайпов (десктоп) · лента свайпов (мобайл)

   Тёмная база, но цвет несёт смысл: у каждой компании своя подложка,
   отклик — зелёный, приглашение — янтарное. Крупная пластика, широкие
   скругления. Версия для двадцатилетних: аудитории 18–22 цвет удерживает
   внимание в ленте лучше, чем монохром.

   Вставьте целиком в Scripter (Plugins → Scripter) и нажмите ▶.
   Шрифт: Manrope (стили «SemiBold», «ExtraBold» — без пробела).

   ВНИМАНИЕ: этот скрипт, в отличие от остальных, ещё не прогонялся
   в Figma — упёрся в лимит вызовов. Если что-то встанет криво, скажите.
   =========================================================================== */

(async () => {
  const page = figma.currentPage;
  const Y = 6200;

  const F = 'Manrope';
  for (const style of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']) {
    await figma.loadFontAsync({ family: F, style });
  }

  const C = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  });
  const S = (h, o) => ({ type: 'SOLID', color: C(h), ...(o !== undefined ? { opacity: o } : {}) });

  const P = {
    bg: '#0B0B12', surface: '#16161F', surface2: '#1F1F2B', line: '#F5F4FF',
    paper: '#F5F4FF',
    violet: '#7C5CFF', violetSoft: '#A78BFA',
    green: '#00D68F', greenDeep: '#0C3B2E',
    amber: '#FFB020', coral: '#FF8A4C', cyan: '#3DD6F5',
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
    if (o.stroke) { f.strokes = [S(o.stroke, o.strokeOp)]; f.strokeWeight = o.strokeW || 1; }
    if (o.align) f.counterAxisAlignItems = o.align;
    if (o.justify) f.primaryAxisAlignItems = o.justify;
    return f;
  }
  function txt(chars, o = {}) {
    const t = figma.createText();
    t.fontName = { family: F, style: o.style || 'Regular' };
    t.characters = chars; t.fontSize = o.size || 14;
    t.fills = [S(o.color || P.paper, o.op)];
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
  /** Цветное пятно на фоне: у направления «Сигнал» цвет — часть языка,
   *  а не исключение, поэтому свечений несколько и они разные */
  function blob(root, w, h, hex, alpha, x, y) {
    const e = figma.createEllipse();
    e.name = 'Свечение'; e.resize(w, h);
    const c = C(hex);
    e.fills = [{ type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
      { position: 0, color: { ...c, a: alpha } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }] }];
    e.effects = [{ type: 'LAYER_BLUR', radius: 100, visible: true }];
    root.appendChild(e);
    e.layoutPositioning = 'ABSOLUTE';
    e.x = x; e.y = y;
    return e;
  }
  function tag(label, hex) {
    const p = AL('HORIZONTAL', { name: label, pad: [6, 12, 6, 12], radius: 999, align: 'CENTER', bg: hex, bgOp: 0.16, stroke: hex, strokeOp: 0.4 });
    p.appendChild(txt(label, { size: 11.5, style: 'SemiBold', color: hex }));
    return p;
  }
  const MARK = 'M28 2 L54 17 L54 47 L28 62 L2 47 L2 17 Z M2 17 L28 32 L54 17 M28 32 L28 62';
  function cube(size, weight) {
    const v = figma.createVector();
    v.name = 'FHR mark';
    v.vectorPaths = [{ windingRule: 'NONE', data: MARK }];
    v.strokes = [S(P.paper)]; v.strokeWeight = weight;
    v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; v.fills = [];
    v.resize(56, 64); v.rescale(size / 64);
    return v;
  }
  function brandBlock(size, fs) {
    const b = AL('HORIZONTAL', { name: 'Логотип', gap: 10, align: 'CENTER' });
    b.appendChild(cube(size, 3.4));
    const wm = AL('VERTICAL', { name: 'Wordmark', gap: 1 });
    wm.appendChild(txt('FATTAKHOV', { size: fs, style: 'ExtraBold', ls: 7 }));
    wm.appendChild(txt('HR AGENCY', { size: fs, style: 'ExtraBold', ls: 7 }));
    b.appendChild(wm);
    return b;
  }
  function pillBtn(label, glyph, tone) {
    const filled = tone === 'filled';
    const b = AL('HORIZONTAL', { name: label, gap: 10, pad: [17, 26, 17, 28], radius: 999, align: 'CENTER', bg: filled ? P.violet : P.surface2, bgOp: filled ? 1 : 0.9, stroke: filled ? undefined : P.paper, strokeOp: filled ? undefined : 0.14 });
    if (filled) b.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.violet), a: 0.5 }, offset: { x: 0, y: 10 }, radius: 32, spread: -6, visible: true, blendMode: 'NORMAL' }];
    b.appendChild(txt(label, { size: 15, style: 'SemiBold' }));
    if (glyph) b.appendChild(txt(glyph, { size: 15, style: 'SemiBold' }));
    return b;
  }
  /** Карточка с цветной шапкой компании. Оттенок закреплён за компанией:
   *  в ленте это единственное, что даёт узнавание до чтения названия. */
  function card(d, w, h) {
    const c = AL('VERTICAL', { name: 'Карточка · ' + d.title, radius: 32, bg: P.surface });
    c.strokes = [S(d.edge ? P.green : P.paper, d.edge ? 0.85 : 0.1)];
    c.strokeWeight = d.edge ? 2 : 1;
    c.effects = d.edge
      ? [{ type: 'DROP_SHADOW', color: { ...C(P.green), a: 0.45 }, offset: { x: 0, y: 14 }, radius: 54, spread: -8, visible: true, blendMode: 'NORMAL' },
         { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.85 }, offset: { x: 0, y: 28 }, radius: 60, spread: -18, visible: true, blendMode: 'NORMAL' }]
      : [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.8 }, offset: { x: 0, y: 24 }, radius: 56, spread: -18, visible: true, blendMode: 'NORMAL' }];
    c.resize(w, h);
    c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'FIXED';
    c.clipsContent = true;

    // цветная шапка компании
    const head = AL('HORIZONTAL', { name: 'Шапка компании', gap: 12, pad: [22, 24, 22, 24], align: 'CENTER' });
    const hc = C(d.hex);
    head.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0.35, 0], [-0.35, 1, 0.1]], gradientStops: [
      { position: 0, color: { ...hc, a: 0.55 } },
      { position: 1, color: { ...hc, a: 0.12 } }] }];
    add(c, head, true);
    const logo = AL('HORIZONTAL', { name: 'Логотип', radius: 16, align: 'CENTER', justify: 'CENTER', bg: P.bg, bgOp: 0.45, stroke: P.paper, strokeOp: 0.18 });
    logo.resize(46, 46);
    logo.layoutSizingHorizontal = 'FIXED'; logo.layoutSizingVertical = 'FIXED';
    logo.appendChild(txt(d.initials, { size: 15, style: 'ExtraBold' }));
    head.appendChild(logo);
    const co = AL('VERTICAL', { name: 'Название', gap: 3 });
    co.appendChild(txt(d.company, { size: 14, style: 'Bold' }));
    co.appendChild(txt(d.city, { size: 12, op: 0.62 }));
    add(head, co, true);
    // Совпадение — заливкой, а не тонким кольцом: на цветной шапке
    // контурное кольцо теряется
    const m = AL('VERTICAL', { name: 'Совпадение', align: 'CENTER', justify: 'CENTER', radius: 999, bg: d.match >= 75 ? P.green : P.violetSoft });
    m.resize(50, 50);
    m.layoutSizingHorizontal = 'FIXED'; m.layoutSizingVertical = 'FIXED';
    m.appendChild(txt(String(d.match), { size: 17, style: 'ExtraBold', color: P.bg }));
    head.appendChild(m);

    const body = AL('VERTICAL', { name: 'Тело', pad: [24, 24, 24, 24] });
    add(c, body, true);
    add(body, txt(d.title, { size: 29, style: 'ExtraBold', lh: 106, ls: -3 }), true);
    gap(body, 10);
    const pay = AL('HORIZONTAL', { name: 'Оплата', gap: 8, align: 'BASELINE' });
    pay.appendChild(txt(d.pay, { size: 17, style: 'Bold', color: P.green }));
    pay.appendChild(txt(d.per, { size: 13, op: 0.5 }));
    add(body, pay, true);
    gap(body, 18);
    add(body, txt(d.body, { size: 14, lh: 158, op: 0.68 }), true);
    gap(body, 20);
    const days = AL('HORIZONTAL', { name: 'Дни', gap: 5, align: 'CENTER' });
    for (const dd of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      const on = d.days.indexOf(dd) !== -1;
      const ch = AL('HORIZONTAL', { name: dd, pad: [5, 8, 5, 8], radius: 999, bg: on ? P.violet : P.paper, bgOp: on ? 0.25 : 0.04 });
      ch.appendChild(txt(dd, { size: 11, style: 'SemiBold', color: on ? P.violetSoft : P.paper, op: on ? undefined : 0.3 }));
      days.appendChild(ch);
    }
    add(body, days, true);
    gap(body, 14);
    const tags = AL('HORIZONTAL', { name: 'Теги', gap: 7 });
    d.tags.forEach((t, i) => tags.appendChild(tag(t, [P.violetSoft, P.cyan, P.coral][i % 3])));
    add(body, tags, true);
    gap(body, 16);
    add(body, txt('✦   ' + d.why, { size: 12.5, op: 0.5 }), true);
    return c;
  }
  function roundBtn(size, glyph, tone) {
    const filled = tone === 'yes';
    const b = AL('HORIZONTAL', { name: glyph, radius: 999, align: 'CENTER', justify: 'CENTER', bg: filled ? P.green : P.surface2, bgOp: filled ? 1 : 0.9, stroke: filled ? undefined : P.paper, strokeOp: filled ? undefined : 0.14 });
    b.resize(size, size);
    b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED';
    b.appendChild(txt(glyph, { size: tone === 'small' ? 14 : 19, style: 'Bold', color: filled ? P.bg : P.paper, op: tone === 'small' ? 0.55 : undefined }));
    if (filled) b.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.green), a: 0.5 }, offset: { x: 0, y: 10 }, radius: 32, spread: -6, visible: true, blendMode: 'NORMAL' }];
    return b;
  }

  const CARD = { title: 'Бариста', company: 'Кофейни «Север»', city: 'Москва, Хамовники', initials: 'КС', hex: P.coral, match: 92, pay: '3 200 — 4 200 ₽', per: 'за смену', body: 'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], tags: ['В офисе', 'Сменный график', 'Без опыта'], why: 'Подходит под все ваши дни' };
  const CARD2 = { title: 'Ассистент таргетолога', company: 'Metrika Digital', city: 'Москва, Белорусская', initials: 'MD', hex: P.cyan, match: 84, pay: '55 000 — 70 000 ₽', per: 'в месяц', body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты и свой пул клиентов.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'], tags: ['Гибрид', 'Аналитика'], why: 'Совпадает 3 из 4 ваших дней' };
  const created = [];

  /* ===================== ЛЕНДИНГ ===================== */
  const L = AL('VERTICAL', { name: 'D «Сигнал» · Лендинг — Desktop', bg: P.bg });
  L.x = 0; L.y = Y;
  L.resize(1440, 920);
  L.layoutSizingHorizontal = 'FIXED'; L.layoutSizingVertical = 'FIXED';
  L.clipsContent = true;
  page.appendChild(L);
  created.push(L);
  blob(L, 900, 520, P.violet, 0.5, -180, -200);
  blob(L, 700, 420, P.cyan, 0.28, 820, -140);
  blob(L, 620, 380, P.coral, 0.2, 380, 560);

  const lh = AL('HORIZONTAL', { name: 'Шапка', pad: [26, 56, 26, 56], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(L, lh, true);
  lh.appendChild(brandBlock(30, 10.5));
  const lacts = AL('HORIZONTAL', { name: 'Действия', gap: 10, align: 'CENTER' });
  const lg = AL('HORIZONTAL', { name: 'Войти', pad: [12, 18, 12, 18], radius: 999 });
  lg.appendChild(txt('Войти', { size: 14, style: 'SemiBold', op: 0.8 }));
  lacts.appendChild(lg);
  const lc = AL('HORIZONTAL', { name: 'Начать', gap: 8, pad: [12, 20, 12, 22], radius: 999, align: 'CENTER', bg: P.paper });
  lc.appendChild(txt('Начать', { size: 14, style: 'Bold', color: P.bg }));
  lc.appendChild(txt('→', { size: 14, style: 'Bold', color: P.bg }));
  lacts.appendChild(lc);
  lh.appendChild(lacts);

  const hero = AL('HORIZONTAL', { name: 'Первый экран', gap: 52, pad: [80, 56, 0, 56], align: 'CENTER' });
  add(L, hero, true);
  const copy = AL('VERTICAL', { name: 'Текст' });
  copy.resize(660, 10);
  hero.appendChild(copy);
  copy.layoutSizingHorizontal = 'FIXED'; copy.layoutSizingVertical = 'HUG';
  const badge = AL('HORIZONTAL', { name: 'Плашка', gap: 8, pad: [8, 16, 8, 14], radius: 999, align: 'CENTER', bg: P.violet, bgOp: 0.2, stroke: P.violet, strokeOp: 0.45 });
  badge.appendChild(txt('✦', { size: 12, color: P.violetSoft }));
  badge.appendChild(txt('ПОДРАБОТКА ДЛЯ СТУДЕНТОВ', { size: 11, style: 'ExtraBold', color: P.violetSoft, ls: 12 }));
  copy.appendChild(badge);
  gap(copy, 28);
  add(copy, txt('Работа, которая\nпомещается\nмежду парами', { size: 64, style: 'ExtraBold', lh: 98, ls: -4.5 }), true);
  gap(copy, 26);
  const sub = txt('Смахнул вправо — отклик уже у работодателя. Без сопроводительных писем и ожидания на неделю.', { size: 17.5, lh: 156, op: 0.68 });
  copy.appendChild(sub);
  sub.textAutoResize = 'HEIGHT'; sub.resize(520, sub.height);
  gap(copy, 34);
  const btns = AL('HORIZONTAL', { name: 'Кнопки', gap: 12, align: 'CENTER' });
  btns.appendChild(pillBtn('Создать профиль', '→', 'filled'));
  btns.appendChild(pillBtn('У меня есть аккаунт', null));
  copy.appendChild(btns);
  gap(copy, 32);
  const chips = AL('HORIZONTAL', { name: 'Признаки', gap: 8 });
  chips.appendChild(tag('Смены от 4 часов', P.green));
  chips.appendChild(tag('Оплата в день смены', P.amber));
  chips.appendChild(tag('ПДн шифруются', P.violetSoft));
  copy.appendChild(chips);
  hero.appendChild(card(CARD, 392, 520));

  /* ===================== ЛЕНТА — DESKTOP ===================== */
  const D = AL('VERTICAL', { name: 'D «Сигнал» · Лента свайпов — Desktop', bg: P.bg });
  D.x = 1560; D.y = Y;
  D.resize(1440, 1024);
  D.layoutSizingHorizontal = 'FIXED'; D.layoutSizingVertical = 'FIXED';
  D.clipsContent = true;
  page.appendChild(D);
  created.push(D);
  blob(D, 900, 500, P.violet, 0.4, -120, -220);
  blob(D, 640, 380, P.green, 0.18, 900, 520);

  const dh = AL('HORIZONTAL', { name: 'Шапка', pad: [22, 40, 22, 40], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(D, dh, true);
  dh.appendChild(brandBlock(28, 10));
  const dtabs = AL('HORIZONTAL', { name: 'Вкладки', gap: 4, pad: [5, 5, 5, 5], radius: 999, bg: P.surface, bgOp: 0.85, stroke: P.paper, strokeOp: 0.1, align: 'CENTER' });
  for (const [l, badgeTxt, active] of [['Лента', null, true], ['Отклики', '2', false], ['Пропущенные', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 7, pad: [9, 16, 9, 16], radius: 999, align: 'CENTER', bg: active ? P.violet : undefined });
    t.appendChild(txt(l, { size: 13.5, style: 'SemiBold', op: active ? 1 : 0.55 }));
    if (badgeTxt) {
      const bd = AL('HORIZONTAL', { name: 'b', pad: [2, 7, 2, 7], radius: 999, bg: P.paper, bgOp: active ? 0.28 : 0.09 });
      bd.appendChild(txt(badgeTxt, { size: 10.5, style: 'Bold', op: active ? 1 : 0.6 }));
      t.appendChild(bd);
    }
    dtabs.appendChild(t);
  }
  dh.appendChild(dtabs);
  const dchip = AL('HORIZONTAL', { name: 'Пользователь', gap: 10, pad: [5, 16, 5, 5], radius: 999, bg: P.surface, bgOp: 0.85, stroke: P.paper, strokeOp: 0.1, align: 'CENTER' });
  const dav = AL('HORIZONTAL', { name: 'Аватар', radius: 999, align: 'CENTER', justify: 'CENTER', bg: P.violet });
  dav.resize(32, 32);
  dav.layoutSizingHorizontal = 'FIXED'; dav.layoutSizingVertical = 'FIXED';
  dav.appendChild(txt('АК', { size: 12, style: 'ExtraBold' }));
  dchip.appendChild(dav);
  const dun = AL('VERTICAL', { name: 'Имя', gap: 1 });
  dun.appendChild(txt('Алиса Ковалёва', { size: 13, style: 'SemiBold' }));
  dun.appendChild(txt('НИУ ВШЭ', { size: 11, op: 0.5 }));
  dchip.appendChild(dun);
  dh.appendChild(dchip);

  const dbody = AL('VERTICAL', { name: 'Содержимое', pad: [32, 40, 0, 40], align: 'CENTER' });
  add(D, dbody, true);
  const dcol = AL('VERTICAL', { name: 'Колонка' });
  dcol.resize(430, 10);
  dbody.appendChild(dcol);
  dcol.layoutSizingHorizontal = 'FIXED'; dcol.layoutSizingVertical = 'HUG';
  add(dcol, txt('Ваша подборка', { size: 34, style: 'ExtraBold', ls: -3 }), true);
  gap(dcol, 8);
  add(dcol, txt('Вправо — отклик уходит сразу. Влево — вакансия ждёт в «Пропущенных».', { size: 14, lh: 150, op: 0.62 }), true);
  gap(dcol, 22);
  const dmeter = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(dcol, dmeter, true);
  dmeter.appendChild(txt('11 вакансий в подборке', { size: 12.5, op: 0.5 }));
  const dcnt = AL('HORIZONTAL', { name: 'Итог', gap: 14, align: 'CENTER' });
  dcnt.appendChild(txt('✓ 1', { size: 12.5, style: 'Bold', color: P.green }));
  dcnt.appendChild(txt('0 пропущено', { size: 12.5, op: 0.5 }));
  dmeter.appendChild(dcnt);
  gap(dcol, 9);
  const dbar = figma.createFrame();
  dbar.name = 'Прогресс'; dbar.resize(430, 5); dbar.cornerRadius = 999;
  dbar.fills = [S(P.paper, 0.08)]; dbar.clipsContent = true;
  const dbf = figma.createRectangle();
  dbf.name = 'Заполнение'; dbf.resize(42, 5); dbf.cornerRadius = 999;
  dbf.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...C(P.violet), a: 1 } }, { position: 1, color: { ...C(P.cyan), a: 1 } }] }];
  dbar.appendChild(dbf);
  add(dcol, dbar, true);
  gap(dcol, 26);

  const ddeck = figma.createFrame();
  ddeck.name = 'Колода'; ddeck.resize(430, 600); ddeck.fills = []; ddeck.clipsContent = false;
  add(dcol, ddeck, true);
  ddeck.layoutSizingVertical = 'FIXED';
  const dback = card(CARD2, 392, 500);
  ddeck.appendChild(dback);
  dback.rescale(0.95);
  const dfront = card(Object.assign({}, CARD, { edge: true }), 392, 500);
  ddeck.appendChild(dfront);
  dfront.rotation = -6;
  dfront.x = 34; dfront.y = 6;
  const dfb = dfront.absoluteBoundingBox, ddb = ddeck.absoluteBoundingBox;
  dback.x = (430 - dback.width) / 2;
  dback.y = (dfb.y - ddb.y + dfb.height) + 16 - dback.height;
  dback.opacity = 0.6;
  const dstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [10, 18, 10, 18], radius: 999, bg: P.green });
  dstamp.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.green), a: 0.55 }, offset: { x: 0, y: 8 }, radius: 28, spread: -4, visible: true, blendMode: 'NORMAL' }];
  dstamp.appendChild(txt('ОТКЛИК', { size: 15, style: 'ExtraBold', color: P.bg, ls: 10 }));
  ddeck.appendChild(dstamp);
  dstamp.rotation = 6; dstamp.x = 10; dstamp.y = -12;

  gap(dcol, 26);
  const dctrl = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 20, align: 'CENTER', justify: 'CENTER' });
  add(dcol, dctrl, true);
  dctrl.appendChild(roundBtn(60, '✕'));
  dctrl.appendChild(roundBtn(46, '↺', 'small'));
  dctrl.appendChild(roundBtn(60, '✦', 'yes'));

  /* ===================== ЛЕНТА — MOBILE ===================== */
  const M = AL('VERTICAL', { name: 'D «Сигнал» · Лента свайпов — Mobile', bg: P.bg });
  M.x = 3160; M.y = Y;
  M.resize(390, 844);
  M.layoutSizingHorizontal = 'FIXED'; M.layoutSizingVertical = 'FIXED';
  M.clipsContent = true;
  page.appendChild(M);
  created.push(M);
  blob(M, 560, 360, P.violet, 0.45, -100, -170);
  blob(M, 420, 300, P.green, 0.16, 180, 620);

  const msb = AL('HORIZONTAL', { name: 'Статус-бар', pad: [14, 24, 8, 26], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(M, msb, true);
  msb.appendChild(txt('9:41', { size: 13.5, style: 'Bold' }));
  const mic = AL('HORIZONTAL', { name: 'Иконки', gap: 6, align: 'CENTER' });
  mic.appendChild(txt('▮▮▮', { size: 10 }));
  mic.appendChild(txt('◗', { size: 12 }));
  mic.appendChild(txt('▰', { size: 12 }));
  msb.appendChild(mic);

  const mh = AL('HORIZONTAL', { name: 'Шапка', pad: [8, 20, 12, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(M, mh, true);
  mh.appendChild(brandBlock(24, 8.5));
  const mav = AL('HORIZONTAL', { name: 'Аватар', radius: 999, align: 'CENTER', justify: 'CENTER', bg: P.violet });
  mav.resize(32, 32);
  mav.layoutSizingHorizontal = 'FIXED'; mav.layoutSizingVertical = 'FIXED';
  mav.appendChild(txt('АК', { size: 12, style: 'ExtraBold' }));
  mh.appendChild(mav);

  const mtw = AL('HORIZONTAL', { name: 'Вкладки', pad: [0, 20, 14, 20] });
  add(M, mtw, true);
  const mtabs = AL('HORIZONTAL', { name: 'Ряд', gap: 4, pad: [4, 4, 4, 4], radius: 999, bg: P.surface, bgOp: 0.85, stroke: P.paper, strokeOp: 0.1, align: 'CENTER' });
  mtw.appendChild(mtabs);
  for (const [l, badgeTxt, active] of [['Лента', null, true], ['Отклики', '2', false], ['Пропущ.', '1', false]]) {
    const t = AL('HORIZONTAL', { name: l, gap: 6, pad: [8, 14, 8, 14], radius: 999, align: 'CENTER', bg: active ? P.violet : undefined });
    t.appendChild(txt(l, { size: 12.5, style: 'SemiBold', op: active ? 1 : 0.55 }));
    if (badgeTxt) {
      const bd = AL('HORIZONTAL', { name: 'b', pad: [1, 6, 1, 6], radius: 999, bg: P.paper, bgOp: active ? 0.28 : 0.09 });
      bd.appendChild(txt(badgeTxt, { size: 10, style: 'Bold', op: active ? 1 : 0.6 }));
      t.appendChild(bd);
    }
    mtabs.appendChild(t);
  }

  const mb = AL('VERTICAL', { name: 'Содержимое', pad: [4, 20, 0, 20] });
  add(M, mb, true);
  const mmeter = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(mb, mmeter, true);
  mmeter.appendChild(txt('11 вакансий в подборке', { size: 11.5, op: 0.5 }));
  const mcnt = AL('HORIZONTAL', { name: 'Итог', gap: 10, align: 'CENTER' });
  mcnt.appendChild(txt('✓ 1', { size: 11.5, style: 'Bold', color: P.green }));
  mcnt.appendChild(txt('0 пропущено', { size: 11.5, op: 0.5 }));
  mmeter.appendChild(mcnt);
  gap(mb, 8);
  const mbar = figma.createFrame();
  mbar.name = 'Прогресс'; mbar.resize(350, 5); mbar.cornerRadius = 999;
  mbar.fills = [S(P.paper, 0.08)]; mbar.clipsContent = true;
  const mbf = figma.createRectangle();
  mbf.name = 'Заполнение'; mbf.resize(34, 5); mbf.cornerRadius = 999;
  mbf.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...C(P.violet), a: 1 } }, { position: 1, color: { ...C(P.cyan), a: 1 } }] }];
  mbar.appendChild(mbf);
  add(mb, mbar, true);
  gap(mb, 18);

  const mdeck = figma.createFrame();
  mdeck.name = 'Колода'; mdeck.resize(350, 500); mdeck.fills = []; mdeck.clipsContent = false;
  add(mb, mdeck, true);
  mdeck.layoutSizingVertical = 'FIXED';
  const mback = card(CARD2, 350, 452);
  mdeck.appendChild(mback);
  mback.rescale(0.94);
  mback.opacity = 0.6;
  const mfront = card(Object.assign({}, CARD, { edge: true }), 350, 452);
  mdeck.appendChild(mfront);
  mfront.rotation = -5;
  mfront.x = 20; mfront.y = 4;
  const mfb = mfront.absoluteBoundingBox, mdb = mdeck.absoluteBoundingBox;
  mback.x = (350 - mback.width) / 2;
  mback.y = (mfb.y - mdb.y + mfb.height) + 14 - mback.height;
  const mstamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [8, 15, 8, 15], radius: 999, bg: P.green });
  mstamp.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.green), a: 0.55 }, offset: { x: 0, y: 8 }, radius: 26, spread: -4, visible: true, blendMode: 'NORMAL' }];
  mstamp.appendChild(txt('ОТКЛИК', { size: 13.5, style: 'ExtraBold', color: P.bg, ls: 10 }));
  mdeck.appendChild(mstamp);
  mstamp.rotation = 7; mstamp.x = 2; mstamp.y = -10;

  const mctrl = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 18, align: 'CENTER', justify: 'CENTER', pad: [22, 0, 0, 0] });
  add(mb, mctrl, true);
  mctrl.appendChild(roundBtn(56, '✕'));
  mctrl.appendChild(roundBtn(44, '↺', 'small'));
  mctrl.appendChild(roundBtn(56, '✦', 'yes'));

  const mhb = figma.createRectangle();
  mhb.name = 'Home indicator'; mhb.resize(134, 5); mhb.cornerRadius = 999; mhb.fills = [S(P.paper, 0.3)];
  M.appendChild(mhb);
  mhb.layoutPositioning = 'ABSOLUTE';
  mhb.x = (390 - 134) / 2; mhb.y = 828;

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
})();
