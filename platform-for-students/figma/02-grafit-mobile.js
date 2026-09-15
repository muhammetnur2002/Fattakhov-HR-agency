/* ===========================================================================
   Fattakhov Students — направление A «Графит», мобайл 390 × 844
   Лендинг · регистрация (шаг 4) · лента свайпов · мои отклики · пропущенные

   Вставьте целиком в Scripter (Plugins → Scripter) и нажмите ▶.
   Шрифт: Inter (стиль «Semi Bold» — с пробелом).
   =========================================================================== */

(async () => {
  const page = figma.currentPage;
  const Y = 2700; // ниже десктопных фреймов из 01-grafit-desktop.js

  const F = 'Inter';
  for (const style of ['Regular', 'Medium', 'Semi Bold']) {
    await figma.loadFontAsync({ family: F, style });
  }

  const C = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  });
  const S = (h, o) => ({ type: 'SOLID', color: C(h), ...(o !== undefined ? { opacity: o } : {}) });
  const P = {
    ink: '#000000', g950: '#0B0C0D', g900: '#121415', g850: '#181A1C', paper: '#F8F8F8',
    a500: '#546E88', a400: '#6E88A2', a300: '#8DA3B9', a200: '#B0C0D0',
    yes: '#4FA37F', yesGlow: '#71D9AC', warn: '#C9A227',
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
  function tag(label, tone) {
    const map = {
      accent: [P.a500, 0.16, P.a400, 0.4, P.a200],
      warn: [P.warn, 0.12, P.warn, 0.4, P.warn],
      mute: [P.paper, 0.04, P.paper, 0.09, P.paper],
    };
    const [bg, bgOp, st, stOp, fg] = map[tone || 'mute'];
    const p = AL('HORIZONTAL', { name: label, pad: [5, 9, 5, 9], radius: 999, align: 'CENTER', bg, bgOp, stroke: st, strokeOp: stOp });
    p.appendChild(txt(label, { size: 11, color: fg, op: tone ? undefined : 0.65 }));
    return p;
  }
  const MARK = 'M28 2 L54 17 L54 47 L28 62 L2 47 L2 17 Z M2 17 L28 32 L54 17 M28 32 L28 62';
  function cube(size, opacity, weight) {
    const v = figma.createVector();
    v.name = 'FHR mark';
    v.vectorPaths = [{ windingRule: 'NONE', data: MARK }];
    v.strokes = [S(P.paper, opacity)]; v.strokeWeight = weight;
    v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND'; v.fills = [];
    v.resize(56, 64); v.rescale(size / 64);
    return v;
  }
  function brandBlock() {
    const b = AL('HORIZONTAL', { name: 'Логотип', gap: 9, align: 'CENTER' });
    b.appendChild(cube(24, 1, 3.6));
    const wm = AL('VERTICAL', { name: 'Wordmark', gap: 1 });
    wm.appendChild(txt('FATTAKHOV', { size: 8.5, style: 'Semi Bold', ls: 7 }));
    wm.appendChild(txt('HR AGENCY', { size: 8.5, style: 'Semi Bold', ls: 7 }));
    b.appendChild(wm);
    return b;
  }
  function squareLogo(size, initials, hue) {
    const a = figma.createFrame();
    a.name = 'Логотип'; a.resize(size, size); a.cornerRadius = size * 0.32;
    a.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [
      { position: 0, color: { r: hue[0], g: hue[1], b: hue[2], a: 1 } },
      { position: 1, color: { r: 0.05, g: 0.06, b: 0.08, a: 1 } }] }];
    a.strokes = [S(P.paper, 0.09)]; a.strokeWeight = 1;
    const t = txt(initials, { size: size * 0.32, style: 'Medium', op: 0.85 });
    a.appendChild(t);
    t.textAlignHorizontal = 'CENTER'; t.textAutoResize = 'HEIGHT'; t.resize(size, t.height);
    t.x = 0; t.y = (size - t.height) / 2;
    return a;
  }
  /** Экран телефона со строкой состояния — без неё макет не читается как телефон */
  function phone(name, x) {
    const r = AL('VERTICAL', { name, bg: P.ink });
    r.x = x; r.y = Y;
    r.resize(390, 844);
    r.layoutSizingHorizontal = 'FIXED'; r.layoutSizingVertical = 'FIXED';
    r.clipsContent = true;
    page.appendChild(r);
    const au = figma.createEllipse();
    au.name = 'Свечение'; au.resize(560, 380);
    const ac = C(P.a500);
    au.fills = [{ type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
      { position: 0, color: { ...ac, a: 0.38 } },
      { position: 0.55, color: { ...ac, a: 0.1 } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }] }];
    au.effects = [{ type: 'LAYER_BLUR', radius: 70, visible: true }];
    r.appendChild(au);
    au.layoutPositioning = 'ABSOLUTE'; au.x = -85; au.y = -205;
    const sb = AL('HORIZONTAL', { name: 'Статус-бар', pad: [14, 24, 8, 26], align: 'CENTER', justify: 'SPACE_BETWEEN' });
    add(r, sb, true);
    sb.appendChild(txt('9:41', { size: 13.5, style: 'Semi Bold' }));
    const ic = AL('HORIZONTAL', { name: 'Иконки', gap: 6, align: 'CENTER' });
    ic.appendChild(txt('▮▮▮', { size: 10, op: 0.85 }));
    ic.appendChild(txt('◗', { size: 12, op: 0.85 }));
    ic.appendChild(txt('▰', { size: 12, op: 0.85 }));
    sb.appendChild(ic);
    return r;
  }
  function homeBar(r) {
    const hb = figma.createRectangle();
    hb.name = 'Home indicator'; hb.resize(134, 5); hb.cornerRadius = 999;
    hb.fills = [S(P.paper, 0.3)];
    r.appendChild(hb);
    hb.layoutPositioning = 'ABSOLUTE';
    hb.x = (390 - 134) / 2; hb.y = 828;
  }
  function appBar(r, activeTab) {
    const h = AL('HORIZONTAL', { name: 'Шапка', pad: [8, 20, 12, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
    add(r, h, true);
    h.appendChild(brandBlock());
    const u = AL('HORIZONTAL', { name: 'Пользователь', gap: 6, align: 'CENTER' });
    const chip = AL('HORIZONTAL', { name: 'Чип', pad: [4, 4, 4, 4], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09, align: 'CENTER' });
    const av = figma.createEllipse();
    av.name = 'Аватар'; av.resize(28, 28);
    av.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [
      { position: 0, color: { r: 0.22, g: 0.19, b: 0.26, a: 1 } },
      { position: 1, color: { r: 0.06, g: 0.07, b: 0.09, a: 1 } }] }];
    chip.appendChild(av);
    u.appendChild(chip);
    const ex = AL('HORIZONTAL', { name: 'Выйти', pad: [9, 11, 9, 11], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09 });
    ex.appendChild(txt('⤺', { size: 13, op: 0.55 }));
    u.appendChild(ex);
    h.appendChild(u);

    // Вкладки уезжают под шапку отдельной строкой: втиснуть их в один ряд
    // с логотипом можно, но тогда всё съедет в нечитаемые 11 пикселей
    const tw = AL('HORIZONTAL', { name: 'Вкладки', pad: [0, 20, 16, 20] });
    add(r, tw, true);
    const tabs = AL('HORIZONTAL', { name: 'Ряд', gap: 2, pad: [4, 4, 4, 4], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09, align: 'CENTER' });
    tw.appendChild(tabs);
    for (const [l, badge] of [['Лента', null], ['Отклики', '2'], ['Пропущенные', '1']]) {
      const active = l === activeTab;
      const t = AL('HORIZONTAL', { name: l, gap: 5, pad: [8, 13, 8, 13], radius: 999, align: 'CENTER', bg: active ? P.paper : undefined, bgOp: active ? 0.09 : undefined, stroke: active ? P.paper : undefined, strokeOp: active ? 0.16 : undefined });
      t.appendChild(txt(l, { size: 12.5, style: 'Medium', op: active ? 1 : 0.55 }));
      if (badge) {
        const bd = AL('HORIZONTAL', { name: 'b', pad: [2, 5, 2, 5], radius: 999, bg: active ? P.a500 : P.paper, bgOp: active ? 0.35 : 0.08 });
        bd.appendChild(txt(badge, { size: 10, color: active ? P.a200 : P.paper, op: active ? undefined : 0.6 }));
        t.appendChild(bd);
      }
      tabs.appendChild(t);
    }
    return r;
  }
  function mobileCard(d, w) {
    const c = AL('VERTICAL', { name: 'Карточка · ' + d.title, pad: [20, 20, 20, 20], radius: 26 });
    c.strokes = [S(d.edge ? P.yesGlow : P.paper, d.edge ? 0.8 : 0.09)];
    c.strokeWeight = d.edge ? 2 : 1;
    c.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [
      { position: 0, color: { r: 0.094, g: 0.106, b: 0.118, a: 0.98 } },
      { position: 1, color: { r: 0.043, g: 0.047, b: 0.051, a: 1 } }] }];
    c.effects = d.edge
      ? [{ type: 'DROP_SHADOW', color: { ...C(P.yes), a: 0.4 }, offset: { x: 0, y: 12 }, radius: 44, spread: -8, visible: true, blendMode: 'NORMAL' },
         { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.9 }, offset: { x: 0, y: 24 }, radius: 52, spread: -18, visible: true, blendMode: 'NORMAL' }]
      : [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.9 }, offset: { x: 0, y: 22 }, radius: 50, spread: -18, visible: true, blendMode: 'NORMAL' }];
    c.resize(w, d.h || 424);
    c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'FIXED';
    c.clipsContent = true;

    const top = AL('HORIZONTAL', { name: 'Компания', gap: 10, align: 'CENTER' });
    add(c, top, true);
    top.appendChild(squareLogo(40, d.initials, d.hue));
    const co = AL('VERTICAL', { name: 'Название', gap: 2 });
    co.appendChild(txt(d.company, { size: 12.5, style: 'Medium', op: 0.85 }));
    co.appendChild(txt(d.city, { size: 11.5, op: 0.38 }));
    add(top, co, true);
    const ring = figma.createFrame();
    ring.name = 'Совпадение'; ring.resize(40, 40); ring.cornerRadius = 999;
    ring.fills = []; ring.strokes = [S(d.match >= 75 ? P.yesGlow : P.a300)]; ring.strokeWeight = 2.6;
    const rn = txt(String(d.match), { size: 12, style: 'Medium' });
    ring.appendChild(rn);
    rn.textAlignHorizontal = 'CENTER'; rn.textAutoResize = 'HEIGHT'; rn.resize(40, rn.height);
    rn.x = 0; rn.y = (40 - rn.height) / 2;
    top.appendChild(ring);

    gap(c, 18);
    add(c, txt(d.title, { size: 24, style: 'Semi Bold', lh: 106, ls: -2.8 }), true);
    gap(c, 8);
    const pay = AL('HORIZONTAL', { name: 'Оплата', gap: 6, align: 'BASELINE' });
    pay.appendChild(txt(d.pay, { size: 14, style: 'Medium', color: P.a200 }));
    pay.appendChild(txt(d.per, { size: 12, op: 0.38 }));
    add(c, pay, true);
    gap(c, 14);
    const rule = figma.createRectangle();
    rule.name = 'Разделитель'; rule.resize(w - 40, 1); rule.fills = [S(P.paper, 0.12)];
    add(c, rule, true);
    gap(c, 14);
    add(c, txt(d.body, { size: 13, lh: 156, op: 0.62 }), true);
    gap(c, 16);
    const days = AL('HORIZONTAL', { name: 'Дни', gap: 3, align: 'CENTER' });
    for (const dd of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      const on = d.days.indexOf(dd) !== -1;
      const ch = AL('HORIZONTAL', { name: dd, pad: [3, 5, 3, 5], radius: 6, bg: P.paper, bgOp: on ? 0.09 : 0.03 });
      ch.appendChild(txt(dd, { size: 10.5, style: 'Medium', op: on ? 0.75 : 0.28 }));
      days.appendChild(ch);
    }
    add(c, days, true);
    gap(c, 10);
    const tags = AL('HORIZONTAL', { name: 'Теги', gap: 5 });
    d.tags.forEach((t, i) => tags.appendChild(tag(t, i === 0 ? 'accent' : null)));
    add(c, tags, true);
    gap(c, 14);
    add(c, txt('✦   ' + d.why, { size: 11.5, op: 0.38 }), true);
    return c;
  }
  function roundBtn(size, glyph, tone) {
    const b = AL('HORIZONTAL', { name: glyph, radius: 999, align: 'CENTER', justify: 'CENTER', bg: tone === 'yes' ? '#1C3A2F' : P.g850, bgOp: tone === 'yes' ? 0.85 : 0.8, stroke: tone === 'yes' ? P.yes : P.paper, strokeOp: tone === 'yes' ? 0.5 : 0.16 });
    b.resize(size, size);
    b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED';
    b.appendChild(txt(glyph, { size: tone === 'small' ? 13 : 17, color: tone === 'yes' ? P.yesGlow : P.paper, op: tone === 'small' ? 0.55 : 0.75 }));
    if (tone === 'yes') b.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.yes), a: 0.45 }, offset: { x: 0, y: 10 }, radius: 30, spread: -8, visible: true, blendMode: 'NORMAL' }];
    return b;
  }

  const CARD = { title: 'Бариста', company: 'Кофейни «Север»', city: 'Москва, Хамовники', initials: 'К«', hue: [0.17, 0.21, 0.25], match: 92, pay: '3 200 — 4 200 ₽', per: 'за смену', body: 'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], tags: ['В офисе', 'Сменный график'], why: 'Подходит под все ваши дни' };
  const CARD2 = Object.assign({}, CARD, { title: 'Ассистент таргетолога', company: 'Metrika Digital', city: 'Москва, Белорусская', initials: 'MD', hue: [0.16, 0.2, 0.26], match: 84, pay: '55 000 — 70 000 ₽', per: 'в месяц', body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты и свой пул клиентов.', tags: ['Гибрид', 'Аналитика'], why: 'Совпадает 3 из 4 ваших дней' });
  const created = [];

  /* ===================== 1. ЛЕНДИНГ ===================== */
  const m1 = phone('A · Лендинг — Mobile 390', 0);
  created.push(m1);
  const h1 = AL('HORIZONTAL', { name: 'Шапка', pad: [10, 20, 10, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(m1, h1, true);
  h1.appendChild(brandBlock());
  const ha = AL('HORIZONTAL', { name: 'Действия', gap: 6, align: 'CENTER' });
  const g1 = AL('HORIZONTAL', { name: 'Войти', pad: [8, 12, 8, 12], radius: 11 });
  g1.appendChild(txt('Войти', { size: 12.5, style: 'Medium', op: 0.8 }));
  ha.appendChild(g1);
  const c1 = AL('HORIZONTAL', { name: 'Начать', gap: 6, pad: [8, 13, 8, 14], radius: 11, align: 'CENTER', bg: P.paper });
  c1.appendChild(txt('Начать', { size: 12.5, style: 'Medium', color: P.ink }));
  c1.appendChild(txt('→', { size: 12.5, style: 'Medium', color: P.ink }));
  ha.appendChild(c1);
  h1.appendChild(ha);

  const b1 = AL('VERTICAL', { name: 'Содержимое', pad: [40, 20, 0, 20] });
  add(m1, b1, true);
  add(b1, txt('FATTAKHOV HR AGENCY · ДЛЯ СТУДЕНТОВ', { size: 9.5, style: 'Medium', color: P.a300, ls: 16 }), true);
  gap(b1, 18);
  add(b1, txt('Работа,\nкоторая\nпомещается\nмежду парами', { size: 38, style: 'Semi Bold', lh: 102, ls: -4 }), true);
  gap(b1, 20);
  add(b1, txt('Смахните вправо — отклик уходит работодателю в ту же секунду. Только проверенные компании и график под вашу учёбу.', { size: 14.5, lh: 158, op: 0.62 }), true);
  gap(b1, 26);
  const mb1 = AL('VERTICAL', { name: 'Кнопки', gap: 10 });
  add(b1, mb1, true);
  const mbp = AL('HORIZONTAL', { name: 'Создать профиль', gap: 9, pad: [16, 22, 16, 24], radius: 16, align: 'CENTER', justify: 'CENTER', bg: P.paper });
  mbp.appendChild(txt('Создать профиль', { size: 15, style: 'Medium', color: P.ink }));
  mbp.appendChild(txt('→', { size: 15, style: 'Medium', color: P.ink }));
  add(mb1, mbp, true);
  const mbg = AL('HORIZONTAL', { name: 'Есть аккаунт', pad: [16, 22, 16, 22], radius: 16, justify: 'CENTER', bg: P.g900, bgOp: 0.6, stroke: P.paper, strokeOp: 0.16 });
  mbg.appendChild(txt('У меня уже есть аккаунт', { size: 15, style: 'Medium' }));
  add(mb1, mbg, true);
  gap(b1, 30);
  const peek = mobileCard(Object.assign({}, CARD, { h: 420 }), 350);
  add(b1, peek, true);
  peek.layoutSizingHorizontal = 'FIXED';
  homeBar(m1);

  /* ===================== 2. РЕГИСТРАЦИЯ, ШАГ 4 ===================== */
  const m2 = phone('A · Регистрация, шаг 4 — Mobile 390', 460);
  created.push(m2);
  const h2 = AL('HORIZONTAL', { name: 'Шапка', pad: [10, 20, 14, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(m2, h2, true);
  h2.appendChild(brandBlock());
  h2.appendChild(txt('Шаг 4 из 6', { size: 12, op: 0.38 }));

  const prog = AL('VERTICAL', { name: 'Прогресс', pad: [0, 20, 0, 20] });
  add(m2, prog, true);
  const ptrack = figma.createFrame();
  ptrack.name = 'Дорожка'; ptrack.resize(350, 3); ptrack.cornerRadius = 999;
  ptrack.fills = [S(P.paper, 0.07)]; ptrack.clipsContent = true;
  const pfill = figma.createRectangle();
  pfill.name = 'Заполнение'; pfill.resize(233, 3); pfill.cornerRadius = 999;
  pfill.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...C(P.a500), a: 1 } }, { position: 1, color: { ...C(P.a200), a: 1 } }] }];
  ptrack.appendChild(pfill);
  add(prog, ptrack, true);

  const b2 = AL('VERTICAL', { name: 'Содержимое', pad: [56, 20, 0, 20] });
  add(m2, b2, true);
  add(b2, txt('Когда можете\nработать', { size: 32, style: 'Semi Bold', lh: 106, ls: -3.2 }), true);
  gap(b2, 10);
  add(b2, txt('Главный фильтр подбора', { size: 14, op: 0.62 }), true);
  gap(b2, 36);
  add(b2, txt('В КАКИЕ ДНИ ГОТОВЫ РАБОТАТЬ', { size: 10.5, style: 'Medium', op: 0.38, ls: 14 }), true);
  gap(b2, 14);
  const dayWrap = AL('HORIZONTAL', { name: 'Дни', gap: 8 });
  add(b2, dayWrap, true);
  for (const [d, on] of [['Пн', true], ['Вт', false], ['Ср', true], ['Чт', false], ['Пт', true], ['Сб', true], ['Вс', false]]) {
    const ch = AL('HORIZONTAL', { name: d, gap: 5, pad: [11, 12, 11, 12], radius: 999, align: 'CENTER', justify: 'CENTER', bg: on ? P.a500 : P.g900, bgOp: on ? 0.22 : 0.5, stroke: on ? P.a400 : P.paper, strokeOp: on ? 0.6 : 0.09 });
    // Выбранное состояние показано и заливкой, и галочкой: на тёмном фоне
    // одна лишь смена оттенка плохо различима
    if (on) ch.appendChild(txt('✓', { size: 10.5, color: P.a200 }));
    ch.appendChild(txt(d, { size: 13.5, style: 'Medium', op: on ? 1 : 0.7 }));
    dayWrap.appendChild(ch);
    ch.layoutSizingHorizontal = 'FILL';
  }
  gap(b2, 34);
  add(b2, txt('СКОЛЬКО ЧАСОВ В НЕДЕЛЮ', { size: 10.5, style: 'Medium', op: 0.38, ls: 14 }), true);
  gap(b2, 14);
  const hrs1 = AL('HORIZONTAL', { name: 'Часы 1', gap: 8 });
  add(b2, hrs1, true);
  const hrs2 = AL('HORIZONTAL', { name: 'Часы 2', gap: 8 });
  add(b2, hrs2, true);
  [['до 8 ч', false], ['до 12 ч', false], ['до 16 ч', false], ['до 20 ч', true]].forEach(([l, on]) => {
    const ch = AL('HORIZONTAL', { name: l, gap: 5, pad: [10, 14, 10, 14], radius: 999, align: 'CENTER', bg: on ? P.a500 : P.g900, bgOp: on ? 0.22 : 0.5, stroke: on ? P.a400 : P.paper, strokeOp: on ? 0.6 : 0.09 });
    if (on) ch.appendChild(txt('✓', { size: 10.5, color: P.a200 }));
    ch.appendChild(txt(l, { size: 13, style: 'Medium', op: on ? 1 : 0.7 }));
    hrs1.appendChild(ch);
  });
  gap(b2, 8);
  ['до 24 ч', 'до 30 ч', 'до 40 ч'].forEach((l) => {
    const ch = AL('HORIZONTAL', { name: l, pad: [10, 14, 10, 14], radius: 999, align: 'CENTER', bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09 });
    ch.appendChild(txt(l, { size: 13, style: 'Medium', op: 0.7 }));
    hrs2.appendChild(ch);
  });
  gap(b2, 18);
  add(b2, txt('Вакансии с большей нагрузкой опустятся ниже в ленте, но не исчезнут.', { size: 12, lh: 150, op: 0.38 }), true);

  const nav2 = AL('HORIZONTAL', { name: 'Навигация', pad: [0, 20, 34, 20], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  m2.appendChild(nav2);
  nav2.layoutPositioning = 'ABSOLUTE';
  nav2.resize(390, 60);
  nav2.x = 0; nav2.y = 754;
  const back2 = AL('HORIZONTAL', { name: 'Назад', gap: 8, pad: [14, 16, 14, 12], radius: 16, align: 'CENTER' });
  back2.appendChild(txt('←', { size: 14, op: 0.7 }));
  back2.appendChild(txt('Назад', { size: 14.5, style: 'Medium', op: 0.7 }));
  nav2.appendChild(back2);
  const next2 = AL('HORIZONTAL', { name: 'Далее', gap: 9, pad: [14, 20, 14, 24], radius: 16, align: 'CENTER', bg: P.paper });
  next2.appendChild(txt('Далее', { size: 14.5, style: 'Medium', color: P.ink }));
  next2.appendChild(txt('→', { size: 14.5, style: 'Medium', color: P.ink }));
  nav2.appendChild(next2);
  homeBar(m2);

  /* ===================== 3. ЛЕНТА СВАЙПОВ ===================== */
  const m3 = phone('A · Лента свайпов — Mobile 390', 920);
  created.push(m3);
  appBar(m3, 'Лента');
  const b3 = AL('VERTICAL', { name: 'Содержимое', pad: [4, 20, 0, 20] });
  add(m3, b3, true);
  const meter3 = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(b3, meter3, true);
  meter3.appendChild(txt('11 вакансий в подборке', { size: 11.5, op: 0.38 }));
  const cnt3 = AL('HORIZONTAL', { name: 'Итог', gap: 12, align: 'CENTER' });
  cnt3.appendChild(txt('✓ 1', { size: 11.5, color: P.yesGlow }));
  cnt3.appendChild(txt('0 пропущено', { size: 11.5, op: 0.38 }));
  meter3.appendChild(cnt3);
  gap(b3, 7);
  const bar3 = figma.createFrame();
  bar3.name = 'Прогресс'; bar3.resize(350, 3); bar3.cornerRadius = 999;
  bar3.fills = [S(P.paper, 0.07)]; bar3.clipsContent = true;
  const bf3 = figma.createRectangle();
  bf3.name = 'Заполнение'; bf3.resize(32, 3); bf3.cornerRadius = 999;
  bf3.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...C(P.a500), a: 1 } }, { position: 1, color: { ...C(P.a300), a: 1 } }] }];
  bar3.appendChild(bf3);
  add(b3, bar3, true);
  gap(b3, 18);

  const deck3 = figma.createFrame();
  deck3.name = 'Колода'; deck3.resize(350, 470); deck3.fills = []; deck3.clipsContent = false;
  add(b3, deck3, true);
  deck3.layoutSizingVertical = 'FIXED';
  const back3 = mobileCard(CARD2, 350);
  deck3.appendChild(back3);
  back3.rescale(0.94);
  back3.opacity = 0.6;
  const front3 = mobileCard(Object.assign({}, CARD, { edge: true }), 350);
  deck3.appendChild(front3);
  front3.rotation = -5;
  front3.x = 22; front3.y = 4;
  const fb3 = front3.absoluteBoundingBox, db3 = deck3.absoluteBoundingBox;
  back3.x = (350 - back3.width) / 2;
  back3.y = (fb3.y - db3.y + fb3.height) + 14 - back3.height;
  const stamp3 = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [6, 12, 6, 12], radius: 10, stroke: P.yesGlow, strokeOp: 0.95, strokeW: 2.6, bg: P.g950, bgOp: 0.82 });
  stamp3.appendChild(txt('ОТКЛИК', { size: 14, style: 'Semi Bold', color: P.yesGlow, ls: 10 }));
  deck3.appendChild(stamp3);
  stamp3.rotation = 8; stamp3.x = 4; stamp3.y = -8;

  const ctrl3 = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 18, align: 'CENTER', justify: 'CENTER', pad: [22, 0, 0, 0] });
  add(b3, ctrl3, true);
  ctrl3.appendChild(roundBtn(54, '✕'));
  ctrl3.appendChild(roundBtn(42, '↺', 'small'));
  ctrl3.appendChild(roundBtn(54, '✦', 'yes'));
  homeBar(m3);

  /* ===================== 4. МОИ ОТКЛИКИ ===================== */
  const m4 = phone('A · Мои отклики — Mobile 390', 1380);
  created.push(m4);
  appBar(m4, 'Отклики');
  const b4 = AL('VERTICAL', { name: 'Содержимое', pad: [6, 20, 0, 20] });
  add(m4, b4, true);
  add(b4, txt('Мои отклики', { size: 30, style: 'Semi Bold', ls: -3 }), true);
  gap(b4, 8);
  add(b4, txt('2 отклика · 2 в работе', { size: 13.5, op: 0.62 }), true);
  gap(b4, 24);
  const APPS = [
    { co: 'Metrika Digital', ini: 'MD', hue: [0.16, 0.2, 0.26], title: 'Контент-менеджер\nсоцсетей', pay: '48 000 — 60 000 ₽', stage: 2, status: 'Приглашение', tone: 'warn', when: 'Отклик отправлен 2 часа назад', note: 'Готовы обсудить график — напишите, когда удобно созвониться.' },
    { co: 'Кофейни «Север»', ini: 'К«', hue: [0.17, 0.21, 0.25], title: 'Бариста', pay: '3 200 — 4 200 ₽', stage: 0, status: 'Новый отклик', tone: 'accent', when: 'Отклик отправлен 6 часов назад', note: null },
  ];
  for (const a of APPS) {
    const card = AL('VERTICAL', { name: 'Отклик · ' + a.co, pad: [18, 18, 18, 18], radius: 22, bg: P.g850, bgOp: 0.9, stroke: P.paper, strokeOp: 0.09 });
    add(b4, card, true);
    const row = AL('HORIZONTAL', { name: 'Шапка', gap: 12 });
    add(card, row, true);
    row.appendChild(squareLogo(40, a.ini, a.hue));
    const info = AL('VERTICAL', { name: 'Инфо', gap: 3 });
    info.appendChild(txt(a.co, { size: 11.5, op: 0.38 }));
    info.appendChild(txt(a.title, { size: 16, style: 'Semi Bold', ls: -1.8, lh: 118 }));
    info.appendChild(txt(a.pay, { size: 12.5, color: P.a200 }));
    add(row, info, true);
    row.appendChild(tag(a.status, a.tone));
    gap(card, 16);
    const funnel = AL('HORIZONTAL', { name: 'Воронка', gap: 3 });
    add(card, funnel, true);
    for (let i = 0; i < 5; i++) {
      const seg = figma.createFrame();
      seg.name = 'этап ' + (i + 1); seg.resize(50, 3.5); seg.cornerRadius = 999;
      seg.fills = [S(i < a.stage ? P.a500 : i === a.stage ? P.a300 : P.paper, i <= a.stage ? 1 : 0.1)];
      funnel.appendChild(seg);
      seg.layoutSizingHorizontal = 'FILL';
    }
    gap(card, 9);
    add(card, txt('Этап: ' + a.status, { size: 11, op: 0.38 }), true);
    gap(card, 8);
    add(card, txt(a.when, { size: 11.5, op: 0.38 }), true);
    if (a.note) {
      gap(card, 12);
      const note = AL('VERTICAL', { name: 'Комментарий', pad: [11, 12, 11, 12], radius: 12, bg: P.g950, bgOp: 0.6, stroke: P.paper, strokeOp: 0.09 });
      add(card, note, true);
      add(note, txt(a.note, { size: 12.5, lh: 152, op: 0.62 }), true);
    }
    gap(b4, 10);
  }
  homeBar(m4);

  /* ===================== 5. ПРОПУЩЕННЫЕ ===================== */
  const m5 = phone('A · Пропущенные — Mobile 390', 1840);
  created.push(m5);
  appBar(m5, 'Пропущенные');
  const b5 = AL('VERTICAL', { name: 'Содержимое', pad: [6, 20, 0, 20] });
  add(m5, b5, true);
  add(b5, txt('Пропущенные', { size: 30, style: 'Semi Bold', ls: -3 }), true);
  gap(b5, 8);
  add(b5, txt('3 вакансии · любую можно вернуть в ленту', { size: 13.5, lh: 145, op: 0.62 }), true);
  gap(b5, 24);
  const SKIPPED = [
    { co: 'Grand Plaza Hotel', ini: 'GP', hue: [0.2, 0.18, 0.15], title: 'Официант банкетной службы', pay: '3 500 — 5 200 ₽', city: 'Москва' },
    { co: 'Агентство «Формат»', ini: 'А«', hue: [0.15, 0.2, 0.24], title: 'Промоутер-консультант', pay: '400 — 520 ₽', city: 'Москва' },
    { co: 'Лаборатория Гагарина', ini: 'ЛГ', hue: [0.13, 0.19, 0.22], title: 'Лаборант-исследователь', pay: '45 000 — 58 000 ₽', city: 'Москва' },
  ];
  for (const s of SKIPPED) {
    const row = AL('HORIZONTAL', { name: 'Пропущена · ' + s.title, gap: 12, pad: [14, 14, 14, 14], radius: 22, align: 'CENTER', bg: P.g850, bgOp: 0.88, stroke: P.paper, strokeOp: 0.09 });
    add(b5, row, true);
    const logo = squareLogo(40, s.ini, s.hue);
    logo.opacity = 0.6;
    row.appendChild(logo);
    const info = AL('VERTICAL', { name: 'Инфо', gap: 3 });
    info.appendChild(txt(s.co, { size: 11, op: 0.38 }));
    info.appendChild(txt(s.title, { size: 14, style: 'Medium', op: 0.85, lh: 120 }));
    const meta = AL('HORIZONTAL', { name: 'Мета', gap: 10, align: 'CENTER' });
    meta.appendChild(txt(s.pay, { size: 11.5, op: 0.38 }));
    meta.appendChild(txt('◍ ' + s.city, { size: 11.5, op: 0.38 }));
    info.appendChild(meta);
    add(row, info, true);
    const back = AL('HORIZONTAL', { name: 'Вернуть', gap: 6, pad: [9, 12, 9, 11], radius: 12, align: 'CENTER', bg: P.g900, bgOp: 0.6, stroke: P.paper, strokeOp: 0.16 });
    back.appendChild(txt('↺', { size: 13, op: 0.8 }));
    row.appendChild(back);
    gap(b5, 10);
  }
  gap(b5, 12);
  const hintWrap = AL('VERTICAL', { name: 'Подсказка', pad: [14, 16, 14, 16], radius: 16, bg: P.a500, bgOp: 0.07, stroke: P.a500, strokeOp: 0.25 });
  add(b5, hintWrap, true);
  add(hintWrap, txt('Свайп влево — дешёвое решение. Если оно необратимо, студент начинает раздумывать над каждой карточкой, и лента перестаёт работать.', { size: 12, lh: 155, op: 0.62 }), true);
  homeBar(m5);

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
})();
