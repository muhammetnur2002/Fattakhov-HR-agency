/* ===========================================================================
   Fattakhov Students — направление A «Графит», десктоп
   Лендинг · лента свайпов · мои отклики · кабинет работодателя · панель HR

   Вставьте целиком в Scripter (Plugins → Scripter) и нажмите ▶.
   Фреймы лягут на текущую страницу.
   Шрифт: Inter (стиль «Semi Bold» — с пробелом).
   =========================================================================== */

(async () => {
  const page = figma.currentPage;

  const F = 'Inter';
  for (const style of ['Regular', 'Medium', 'Semi Bold']) {
    await figma.loadFontAsync({ family: F, style });
  }

  // ---------- палитра ----------
  const C = (h) => ({
    r: parseInt(h.slice(1, 3), 16) / 255,
    g: parseInt(h.slice(3, 5), 16) / 255,
    b: parseInt(h.slice(5, 7), 16) / 255,
  });
  const S = (h, o) => ({ type: 'SOLID', color: C(h), ...(o !== undefined ? { opacity: o } : {}) });

  const P = {
    ink: '#000000', g950: '#0B0C0D', g900: '#121415', g850: '#181A1C', g800: '#1E2124',
    g700: '#2F3337', paper: '#F8F8F8',
    a500: '#546E88', a400: '#6E88A2', a300: '#8DA3B9', a200: '#B0C0D0', a100: '#D3DCE5',
    yes: '#4FA37F', yesGlow: '#71D9AC', warn: '#C9A227',
  };

  // ---------- помощники ----------
  /** Авто-лейаут одной строкой. createFrame() заливается белым — гасим здесь. */
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
    t.characters = chars;
    t.fontSize = o.size || 14;
    t.fills = [S(o.color || P.paper, o.op)];
    if (o.lh) t.lineHeight = { unit: 'PERCENT', value: o.lh };
    if (o.ls !== undefined) t.letterSpacing = { unit: 'PERCENT', value: o.ls };
    t.name = chars.slice(0, 26);
    return t;
  }
  /** Сначала в родителя, потом FILL — иначе Figma отвергает значение */
  function add(parent, node, fill) {
    parent.appendChild(node);
    if (fill) {
      if (node.type === 'TEXT') node.textAutoResize = 'HEIGHT';
      node.layoutSizingHorizontal = 'FILL';
    }
    return node;
  }
  /** Вертикальный ритм задаём распорками: единый gap уравнял бы всё подряд */
  function gap(parent, h) {
    const s = figma.createFrame();
    s.name = ' '; s.resize(4, h); s.fills = [];
    parent.appendChild(s);
    s.layoutSizingHorizontal = 'FILL';
    s.layoutSizingVertical = 'FIXED';
    return s;
  }
  function tag(label, tone) {
    const map = {
      accent: [P.a500, 0.15, P.a400, 0.35, P.a200],
      yes: [P.yes, 0.14, P.yes, 0.45, P.yesGlow],
      warn: [P.warn, 0.12, P.warn, 0.4, P.warn],
      mute: [P.paper, 0.04, P.paper, 0.09, P.paper],
    };
    const [bg, bgOp, st, stOp, fg] = map[tone || 'mute'];
    const p = AL('HORIZONTAL', { name: label, pad: [5, 10, 5, 10], radius: 999, align: 'CENTER', bg, bgOp, stroke: st, strokeOp: stOp });
    p.appendChild(txt(label, { size: 11.5, color: fg, op: tone ? undefined : 0.65 }));
    return p;
  }
  const MARK = 'M28 2 L54 17 L54 47 L28 62 L2 47 L2 17 Z M2 17 L28 32 L54 17 M28 32 L28 62';
  function cube(size, opacity, weight) {
    const v = figma.createVector();
    v.name = 'FHR mark';
    v.vectorPaths = [{ windingRule: 'NONE', data: MARK }];
    v.strokes = [S(P.paper, opacity)];
    v.strokeWeight = weight;
    v.strokeCap = 'ROUND'; v.strokeJoin = 'ROUND';
    v.fills = [];
    v.resize(56, 64);
    v.rescale(size / 64);
    return v;
  }
  function brandBlock(size, fs) {
    const b = AL('HORIZONTAL', { name: 'Логотип', gap: 11, align: 'CENTER' });
    b.appendChild(cube(size, 1, 3.4));
    const wm = AL('VERTICAL', { name: 'Wordmark', gap: 2 });
    wm.appendChild(txt('FATTAKHOV', { size: fs, style: 'Semi Bold', ls: 7 }));
    wm.appendChild(txt('HR AGENCY', { size: fs, style: 'Semi Bold', ls: 7 }));
    b.appendChild(wm);
    return b;
  }
  function avatar(size, hue) {
    const a = figma.createFrame();
    a.name = 'Аватар'; a.resize(size, size); a.cornerRadius = size / 2;
    a.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [
      { position: 0, color: { r: hue[0], g: hue[1], b: hue[2], a: 1 } },
      { position: 1, color: { r: 0.05, g: 0.06, b: 0.08, a: 1 } }] }];
    a.strokes = [S(P.paper, 0.09)]; a.strokeWeight = 1;
    return a;
  }
  function squareLogo(size, initials, hue) {
    const a = figma.createFrame();
    a.name = 'Логотип'; a.resize(size, size); a.cornerRadius = size * 0.32;
    a.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.7, 0.7, 0], [-0.7, 0.7, 0.5]], gradientStops: [
      { position: 0, color: { r: hue[0], g: hue[1], b: hue[2], a: 1 } },
      { position: 1, color: { r: 0.05, g: 0.06, b: 0.08, a: 1 } }] }];
    a.strokes = [S(P.paper, 0.09)]; a.strokeWeight = 1;
    const t = txt(initials, { size: size * 0.33, style: 'Medium', op: 0.85 });
    a.appendChild(t);
    t.textAlignHorizontal = 'CENTER'; t.textAutoResize = 'HEIGHT'; t.resize(size, t.height);
    t.x = 0; t.y = (size - t.height) / 2;
    return a;
  }
  /** Холодное свечение сверху — источник света, от которого стекло получает блик */
  function aurora(root, w, h, alpha, y) {
    const e = figma.createEllipse();
    e.name = 'Свечение'; e.resize(w, h);
    const ac = C(P.a500);
    e.fills = [{ type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
      { position: 0, color: { ...ac, a: alpha } },
      { position: 0.55, color: { ...ac, a: alpha * 0.26 } },
      { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }] }];
    e.effects = [{ type: 'LAYER_BLUR', radius: 90, visible: true }];
    root.appendChild(e);
    e.layoutPositioning = 'ABSOLUTE';
    e.x = -30; e.y = y;
    return e;
  }
  function frame(name, x, y, w, h, hug) {
    const r = AL('VERTICAL', { name, bg: P.ink });
    r.x = x; r.y = y;
    r.resize(w, h);
    r.layoutSizingHorizontal = 'FIXED';
    r.layoutSizingVertical = hug ? 'HUG' : 'FIXED';
    r.clipsContent = true;
    page.appendChild(r);
    return r;
  }
  function appHeader(root, tabs, userName, userSub) {
    const h = AL('HORIZONTAL', { name: 'Шапка', pad: [21, 40, 21, 40], align: 'CENTER', justify: 'SPACE_BETWEEN', bg: P.ink, bgOp: 0.7 });
    h.strokes = [S(P.paper, 0.09)];
    h.strokeAlign = 'INSIDE';
    h.strokeTopWeight = 0; h.strokeLeftWeight = 0; h.strokeRightWeight = 0; h.strokeBottomWeight = 1;
    add(root, h, true);
    h.appendChild(brandBlock(28, 10));
    if (tabs) {
      const t = AL('HORIZONTAL', { name: 'Вкладки', gap: 2, pad: [4, 4, 4, 4], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09, align: 'CENTER' });
      for (const [label, badge, active] of tabs) {
        const b = AL('HORIZONTAL', { name: label, gap: 6, pad: [9, 14, 9, 14], radius: 999, align: 'CENTER', bg: active ? P.paper : undefined, bgOp: active ? 0.09 : undefined, stroke: active ? P.paper : undefined, strokeOp: active ? 0.16 : undefined });
        b.appendChild(txt(label, { size: 13, style: 'Medium', op: active ? 1 : 0.55 }));
        if (badge) {
          const bd = AL('HORIZONTAL', { name: 'badge', pad: [2, 6, 2, 6], radius: 999, bg: active ? P.a500 : P.paper, bgOp: active ? 0.35 : 0.08 });
          bd.appendChild(txt(badge, { size: 10.5, color: active ? P.a100 : P.paper, op: active ? undefined : 0.6 }));
          b.appendChild(bd);
        }
        t.appendChild(b);
      }
      h.appendChild(t);
    } else {
      h.appendChild(txt(' ', { size: 12 }));
    }
    const user = AL('HORIZONTAL', { name: 'Пользователь', gap: 6, align: 'CENTER' });
    const chip = AL('HORIZONTAL', { name: 'Чип', gap: 10, pad: [4, 14, 4, 4], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09, align: 'CENTER' });
    chip.appendChild(avatar(30, [0.2, 0.24, 0.29]));
    const un = AL('VERTICAL', { name: 'Имя', gap: 1 });
    un.appendChild(txt(userName, { size: 13, style: 'Medium' }));
    un.appendChild(txt(userSub, { size: 11, op: 0.38 }));
    chip.appendChild(un);
    user.appendChild(chip);
    const ex = AL('HORIZONTAL', { name: 'Выйти', pad: [10, 12, 10, 12], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09 });
    ex.appendChild(txt('⤺', { size: 14, op: 0.55 }));
    user.appendChild(ex);
    h.appendChild(user);
    return h;
  }
  /** Карточка вакансии — тот же состав полей, что и в продукте */
  function vacancyCard(d, w, h) {
    const c = AL('VERTICAL', { name: 'Карточка · ' + d.title, pad: [24, 26, 24, 26], radius: 28 });
    c.strokes = [S(d.edge ? P.yesGlow : P.paper, d.edge ? 0.8 : 0.09)];
    c.strokeWeight = d.edge ? 2 : 1;
    c.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0, 1, 0], [-1, 0, 1]], gradientStops: [
      { position: 0, color: { r: 0.094, g: 0.106, b: 0.118, a: 0.98 } },
      { position: 1, color: { r: 0.043, g: 0.047, b: 0.051, a: 1 } }] }];
    // Свайп вправо подсвечивает кромку, влево — гасит. Согласие светится.
    c.effects = d.edge
      ? [{ type: 'DROP_SHADOW', color: { ...C(P.yes), a: 0.42 }, offset: { x: 0, y: 14 }, radius: 52, spread: -8, visible: true, blendMode: 'NORMAL' },
         { type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.9 }, offset: { x: 0, y: 30 }, radius: 60, spread: -20, visible: true, blendMode: 'NORMAL' }]
      : [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.9 }, offset: { x: 0, y: 26 }, radius: 58, spread: -20, visible: true, blendMode: 'NORMAL' }];
    c.resize(w, h);
    c.layoutSizingHorizontal = 'FIXED';
    c.layoutSizingVertical = 'FIXED';
    c.clipsContent = true;

    const top = AL('HORIZONTAL', { name: 'Компания', gap: 12, align: 'CENTER' });
    add(c, top, true);
    top.appendChild(squareLogo(46, d.initials, d.hue));
    const co = AL('VERTICAL', { name: 'Название', gap: 3 });
    co.appendChild(txt(d.company, { size: 13.5, style: 'Medium', op: 0.85 }));
    co.appendChild(txt(d.city, { size: 12.5, op: 0.38 }));
    add(top, co, true);
    const ring = figma.createFrame();
    ring.name = 'Совпадение'; ring.resize(46, 46); ring.cornerRadius = 999;
    ring.fills = []; ring.strokes = [S(d.match >= 75 ? P.yesGlow : P.a300)]; ring.strokeWeight = 3;
    const rn = txt(String(d.match), { size: 13, style: 'Medium' });
    ring.appendChild(rn);
    rn.textAlignHorizontal = 'CENTER'; rn.textAutoResize = 'HEIGHT'; rn.resize(46, rn.height);
    rn.x = 0; rn.y = (46 - rn.height) / 2;
    top.appendChild(ring);

    gap(c, 20);
    add(c, txt(d.title, { size: 28, style: 'Semi Bold', lh: 106, ls: -2.8 }), true);
    gap(c, 10);
    const pay = AL('HORIZONTAL', { name: 'Оплата', gap: 7, align: 'BASELINE' });
    pay.appendChild(txt(d.pay, { size: 15, style: 'Medium', color: P.a200 }));
    pay.appendChild(txt(d.per, { size: 13, op: 0.38 }));
    add(c, pay, true);
    gap(c, 16);
    const rule = figma.createRectangle();
    rule.name = 'Разделитель'; rule.resize(w - 52, 1); rule.fills = [S(P.paper, 0.12)];
    add(c, rule, true);
    gap(c, 16);
    add(c, txt(d.body, { size: 14, lh: 156, op: 0.62 }), true);
    gap(c, 18);
    const days = AL('HORIZONTAL', { name: 'Дни', gap: 4, align: 'CENTER' });
    for (const dd of ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']) {
      const on = d.days.indexOf(dd) !== -1;
      const chip = AL('HORIZONTAL', { name: dd, pad: [3, 6, 3, 6], radius: 6, bg: P.paper, bgOp: on ? 0.09 : 0.03 });
      chip.appendChild(txt(dd, { size: 11, style: 'Medium', op: on ? 0.75 : 0.28 }));
      days.appendChild(chip);
    }
    days.appendChild(txt(d.hours, { size: 11, op: 0.38 }));
    add(c, days, true);
    gap(c, 12);
    const tags = AL('HORIZONTAL', { name: 'Теги', gap: 6 });
    d.tags.forEach((t, i) => tags.appendChild(tag(t, i === 0 ? 'accent' : null)));
    add(c, tags, true);
    gap(c, 16);
    d.why.forEach((r, i) => {
      add(c, txt('✦   ' + r, { size: 12.5, op: 0.38 }), true);
      if (i < d.why.length - 1) gap(c, 6);
    });
    return c;
  }

  const VACANCIES = {
    barista: { title: 'Бариста', company: 'Кофейни «Север»', city: 'Москва, Хамовники', initials: 'К«', hue: [0.17, 0.21, 0.25], match: 92, pay: '3 200 — 4 200 ₽', per: 'за смену', body: 'Небольшая сеть спешелти-кофеен ищет бариста на утренние и вечерние смены. Обучение на месте — опыт не нужен, нужен интерес к кофе.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], hours: 'до 24 ч/нед', tags: ['В офисе', 'Сменный график', 'Без опыта'], why: ['Подходит под все ваши дни', 'Опубликована сегодня'] },
    target: { title: 'Ассистент таргетолога', company: 'Metrika Digital', city: 'Москва, Белорусская', initials: 'MD', hue: [0.16, 0.2, 0.26], match: 84, pay: '55 000 — 70 000 ₽', per: 'в месяц', body: 'Диджитал-агентство берёт стажёра в перформанс-отдел. Реальные бюджеты, свой пул клиентов через три месяца.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'], hours: 'до 24 ч/нед', tags: ['Гибрид', 'Аналитика'], why: ['Совпадает 3 из 4 ваших дней'] },
    picker: { title: 'Сборщик заказов', company: 'Даркстор «Ближний»', city: 'Москва, Академическая', initials: 'Д«', hue: [0.14, 0.17, 0.21], match: 70, pay: '380 — 450 ₽', per: 'в час', body: 'Сборка онлайн-заказов на складе у дома. Смены от 4 часов, выбираете сами в приложении.', days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], hours: 'до 20 ч/нед', tags: ['В офисе', 'Почасовая оплата'], why: ['Подходит под все ваши дни'] },
  };
  const created = [];

  /* ======================= 1. ЛЕНДИНГ ======================= */
  const L = frame('A · Лендинг — Desktop 1440', 0, 0, 1440, 900, true);
  created.push(L);
  aurora(L, 1500, 700, 0.6, -280);

  const lh = AL('HORIZONTAL', { name: 'Шапка', pad: [24, 56, 24, 56], align: 'CENTER', justify: 'SPACE_BETWEEN' });
  add(L, lh, true);
  lh.appendChild(brandBlock(30, 10.5));
  const lacts = AL('HORIZONTAL', { name: 'Действия', gap: 8, align: 'CENTER' });
  const lghost = AL('HORIZONTAL', { name: 'Войти', pad: [10, 14, 10, 14], radius: 12 });
  lghost.appendChild(txt('Войти', { size: 13, style: 'Medium', op: 0.8 }));
  lacts.appendChild(lghost);
  const lcta = AL('HORIZONTAL', { name: 'Начать', gap: 8, pad: [10, 16, 10, 18], radius: 12, align: 'CENTER', bg: P.paper });
  lcta.appendChild(txt('Начать', { size: 13, style: 'Medium', color: P.ink }));
  lcta.appendChild(txt('→', { size: 13, style: 'Medium', color: P.ink }));
  lacts.appendChild(lcta);
  lh.appendChild(lacts);

  const hero = AL('HORIZONTAL', { name: 'Первый экран', gap: 48, pad: [92, 56, 104, 56], align: 'CENTER' });
  add(L, hero, true);
  const copy = AL('VERTICAL', { name: 'Текст' });
  copy.resize(640, 10);
  hero.appendChild(copy);
  copy.layoutSizingHorizontal = 'FIXED';
  copy.layoutSizingVertical = 'HUG';
  add(copy, txt('FATTAKHOV HR AGENCY · ДЛЯ СТУДЕНТОВ', { size: 11, style: 'Medium', color: P.a300, ls: 18 }), true);
  gap(copy, 26);
  add(copy, txt('Работа, которая\nпомещается\nмежду парами', { size: 60, style: 'Semi Bold', lh: 100, ls: -4 }), true);
  gap(copy, 28);
  const sub = txt('Смахните вправо — отклик уходит работодателю в ту же секунду. Никаких сопроводительных писем и ожидания на неделю: только проверенные компании и график под вашу учёбу.', { size: 16.5, lh: 158, op: 0.62 });
  copy.appendChild(sub);
  sub.textAutoResize = 'HEIGHT';
  sub.resize(520, sub.height);
  gap(copy, 36);
  const hbtns = AL('HORIZONTAL', { name: 'Кнопки', gap: 12, align: 'CENTER' });
  const hb1 = AL('HORIZONTAL', { name: 'Создать профиль', gap: 10, pad: [17, 24, 17, 28], radius: 18, align: 'CENTER', bg: P.paper });
  hb1.effects = [{ type: 'DROP_SHADOW', color: { r: 1, g: 1, b: 1, a: 0.26 }, offset: { x: 0, y: 8 }, radius: 26, spread: -8, visible: true, blendMode: 'NORMAL' }];
  hb1.appendChild(txt('Создать профиль', { size: 15, style: 'Medium', color: P.ink }));
  hb1.appendChild(txt('→', { size: 15, style: 'Medium', color: P.ink }));
  hbtns.appendChild(hb1);
  const hb2 = AL('HORIZONTAL', { name: 'Есть аккаунт', pad: [17, 26, 17, 26], radius: 18, bg: P.g900, bgOp: 0.6, stroke: P.paper, strokeOp: 0.16 });
  hb2.appendChild(txt('У меня уже есть аккаунт', { size: 15, style: 'Medium' }));
  hbtns.appendChild(hb2);
  copy.appendChild(hbtns);
  gap(copy, 32);
  const trust = AL('HORIZONTAL', { name: 'Про ПДн', gap: 8, align: 'CENTER' });
  trust.appendChild(txt('◈', { size: 12, color: P.a400 }));
  const trustText = txt('Персональные данные шифруются и передаются только тем компаниям, которым вы сами откликнулись', { size: 12.5, lh: 150, op: 0.38 });
  trust.appendChild(trustText);
  trustText.textAutoResize = 'HEIGHT';
  trustText.resize(430, trustText.height);
  copy.appendChild(trust);
  hero.appendChild(vacancyCard(Object.assign({}, VACANCIES.barista, { why: ['Подходит под все ваши дни'] }), 376, 486));

  // цифры
  const statsWrap = AL('VERTICAL', { name: 'Цифры', pad: [0, 56, 0, 56] });
  add(L, statsWrap, true);
  const stats = AL('HORIZONTAL', { name: 'Строка', gap: 1, radius: 24, bg: P.paper, bgOp: 0.09, stroke: P.paper, strokeOp: 0.09 });
  stats.clipsContent = true;
  add(statsWrap, stats, true);
  for (const [n, l] of [['860+', 'студентов в базе'], ['48', 'компаний-партнёров'], ['3', 'дня до первого ответа'], ['71%', 'доходят до собеседования']]) {
    const cell = AL('VERTICAL', { name: l, gap: 12, pad: [34, 32, 34, 32], bg: P.ink });
    cell.appendChild(txt(n, { size: 40, style: 'Semi Bold', ls: -4, lh: 100 }));
    cell.appendChild(txt(l, { size: 13, op: 0.38 }));
    stats.appendChild(cell);
    cell.layoutSizingHorizontal = 'FILL';
  }

  // три шага
  const steps = AL('VERTICAL', { name: 'Как это работает', pad: [110, 56, 0, 56] });
  add(L, steps, true);
  add(steps, txt('Три шага вместо\nтрёх недель', { size: 46, style: 'Semi Bold', lh: 104, ls: -3.6 }), true);
  gap(steps, 52);
  const stepRow = AL('HORIZONTAL', { name: 'Шаги', gap: 16 });
  add(steps, stepRow, true);
  const STEPS = [
    ['01', '⬒', 'Профиль за три минуты', 'Вуз, специальность, свободные дни и навыки. Шесть коротких шагов — дальше подбор идёт сам.'],
    ['02', '✧', 'Смахивайте вакансии', 'Вправо — отклик уходит работодателю сразу. Влево — вакансия уходит в «Пропущенные», откуда её всегда можно вернуть.'],
    ['03', '◫', 'Работодатель отвечает', 'Компания видит ваш профиль и резюме в своём кабинете. Статус отклика меняется у вас на глазах.'],
  ];
  for (const [num, icon, title, body] of STEPS) {
    const c = AL('VERTICAL', { name: title, pad: [28, 28, 28, 28], radius: 24, bg: P.g850, bgOp: 0.85, stroke: P.paper, strokeOp: 0.09 });
    const head = AL('HORIZONTAL', { name: 'head', justify: 'SPACE_BETWEEN', align: 'CENTER' });
    const ic = AL('HORIZONTAL', { name: 'icon', pad: [10, 12, 10, 12], radius: 14, bg: P.a500, bgOp: 0.14, stroke: P.a500, strokeOp: 0.32, align: 'CENTER' });
    ic.appendChild(txt(icon, { size: 16, color: P.a200 }));
    head.appendChild(ic);
    head.appendChild(txt(num, { size: 40, style: 'Semi Bold', op: 0.08, ls: -3 }));
    add(c, head, true);
    gap(c, 26);
    add(c, txt(title, { size: 19, style: 'Semi Bold', ls: -2 }), true);
    gap(c, 10);
    add(c, txt(body, { size: 14.5, lh: 155, op: 0.62 }), true);
    stepRow.appendChild(c);
    c.layoutSizingHorizontal = 'FILL';
    c.layoutSizingVertical = 'FILL';
  }

  // компании
  const brands = AL('VERTICAL', { name: 'Компании', pad: [96, 0, 0, 0] });
  add(L, brands, true);
  const bl = AL('VERTICAL', { name: 'label', pad: [0, 56, 0, 56] });
  add(brands, bl, true);
  add(bl, txt('КТО УЖЕ ИЩЕТ СТУДЕНТОВ', { size: 11, style: 'Medium', op: 0.38, ls: 18 }), true);
  gap(brands, 22);
  const brow = AL('HORIZONTAL', { name: 'Лента компаний', gap: 12, pad: [0, 0, 0, 56] });
  add(brands, brow, true);
  brow.clipsContent = true;
  for (const co of ['Кофейни «Север»', 'Metrika Digital', 'Grand Plaza Hotel', 'Даркстор «Ближний»', 'Технопарк «Вектор»', 'Агентство «Формат»', 'Лаборатория Гагарина']) {
    const chip = AL('HORIZONTAL', { name: co, pad: [11, 20, 11, 20], radius: 999, bg: P.g900, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09 });
    chip.appendChild(txt(co, { size: 14, op: 0.7 }));
    brow.appendChild(chip);
  }

  // призыв
  const ctaWrap = AL('VERTICAL', { name: 'Призыв', pad: [104, 56, 88, 56] });
  add(L, ctaWrap, true);
  const panel = AL('VERTICAL', { name: 'Панель', pad: [88, 64, 88, 64], radius: 34, align: 'CENTER', bg: P.g850, bgOp: 0.8, stroke: P.paper, strokeOp: 0.09 });
  add(ctaWrap, panel, true);
  panel.clipsContent = true;
  const glow = figma.createEllipse();
  glow.name = 'Блик'; glow.resize(620, 260);
  const gc = C(P.a500);
  glow.fills = [{ type: 'GRADIENT_RADIAL', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...gc, a: 0.5 } }, { position: 1, color: { r: 0, g: 0, b: 0, a: 0 } }] }];
  glow.effects = [{ type: 'LAYER_BLUR', radius: 80, visible: true }];
  panel.appendChild(glow);
  glow.layoutPositioning = 'ABSOLUTE';
  glow.x = 340; glow.y = -130;
  panel.appendChild(cube(54, 0.7, 3));
  gap(panel, 30);
  const h2 = txt('Первая подборка ждёт вас', { size: 40, style: 'Semi Bold', lh: 108, ls: -3.4 });
  h2.textAlignHorizontal = 'CENTER';
  add(panel, h2, true);
  gap(panel, 18);
  const ctaSub = txt('Заполните профиль — и лента соберётся под ваш график, город и навыки.\nОтказаться от вакансии можно одним движением, вернуть — тоже.', { size: 15.5, lh: 160, op: 0.62 });
  ctaSub.textAlignHorizontal = 'CENTER';
  add(panel, ctaSub, true);
  gap(panel, 34);
  const cbtns = AL('HORIZONTAL', { name: 'Кнопки', gap: 12, align: 'CENTER' });
  const cb1 = AL('HORIZONTAL', { name: 'Создать профиль', gap: 10, pad: [17, 24, 17, 28], radius: 18, align: 'CENTER', bg: P.paper });
  cb1.appendChild(txt('Создать профиль', { size: 15, style: 'Medium', color: P.ink }));
  cb1.appendChild(txt('→', { size: 15, style: 'Medium', color: P.ink }));
  cbtns.appendChild(cb1);
  const cb2 = AL('HORIZONTAL', { name: 'Я работодатель', pad: [17, 26, 17, 26], radius: 18 });
  cb2.appendChild(txt('Я работодатель', { size: 15, style: 'Medium', op: 0.8 }));
  cbtns.appendChild(cb2);
  panel.appendChild(cbtns);

  // подвал
  const footWrap = AL('VERTICAL', { name: 'Подвал', pad: [0, 56, 40, 56] });
  add(L, footWrap, true);
  const line = figma.createRectangle();
  line.name = 'Линия'; line.resize(1328, 1); line.fills = [S(P.paper, 0.09)];
  add(footWrap, line, true);
  gap(footWrap, 32);
  const foot = AL('HORIZONTAL', { name: 'Строка', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(footWrap, foot, true);
  foot.appendChild(brandBlock(28, 10.5));
  const flinks = AL('HORIZONTAL', { name: 'Ссылки', gap: 22, align: 'CENTER' });
  for (const l of ['Вход для студентов', 'Кабинет работодателя', 'HR-менеджеру']) flinks.appendChild(txt(l, { size: 13, op: 0.38 }));
  foot.appendChild(flinks);
  const fright = AL('HORIZONTAL', { name: 'Право', gap: 10, align: 'CENTER' });
  const pdn = AL('HORIZONTAL', { name: 'ПДн', pad: [5, 10, 5, 10], radius: 999, bg: P.paper, bgOp: 0.04, stroke: P.paper, strokeOp: 0.09 });
  pdn.appendChild(txt('ПДн шифруются', { size: 11.5, op: 0.65 }));
  fright.appendChild(pdn);
  fright.appendChild(txt('© 2026', { size: 12.5, op: 0.38 }));
  foot.appendChild(fright);

  /* ======================= 2. ЛЕНТА СВАЙПОВ ======================= */
  const D = frame('A · Лента свайпов — Desktop', 1620, 0, 1440, 1024);
  created.push(D);
  aurora(D, 1500, 620, 0.42, -300);
  appHeader(D, [['Лента', null, true], ['Отклики', '2', false], ['Пропущенные', '1', false]], 'Алиса Ковалёва', 'НИУ ВШЭ');

  const dbody = AL('VERTICAL', { name: 'Содержимое', pad: [34, 40, 0, 40], align: 'CENTER' });
  add(D, dbody, true);
  dbody.layoutSizingVertical = 'FILL';
  const dcol = AL('VERTICAL', { name: 'Колонка' });
  dcol.resize(416, 10);
  dbody.appendChild(dcol);
  dcol.layoutSizingHorizontal = 'FIXED';
  dcol.layoutSizingVertical = 'HUG';

  add(dcol, txt('Ваша подборка', { size: 30, style: 'Semi Bold', ls: -2.6 }), true);
  gap(dcol, 8);
  add(dcol, txt('Вправо — отклик уходит работодателю. Влево — вакансия уйдёт в «Пропущенные».', { size: 13.5, lh: 150, op: 0.62 }), true);
  gap(dcol, 20);
  const meter = AL('HORIZONTAL', { name: 'Счётчик', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(dcol, meter, true);
  meter.appendChild(txt('11 вакансий в подборке', { size: 12.5, op: 0.38 }));
  const counters = AL('HORIZONTAL', { name: 'Итог', gap: 14, align: 'CENTER' });
  counters.appendChild(txt('✓ 1', { size: 12.5, color: P.yesGlow }));
  counters.appendChild(txt('0 пропущено', { size: 12.5, op: 0.38 }));
  meter.appendChild(counters);
  gap(dcol, 8);
  const bar = figma.createFrame();
  bar.name = 'Прогресс'; bar.resize(416, 3); bar.cornerRadius = 999;
  bar.fills = [S(P.paper, 0.07)]; bar.clipsContent = true;
  const barFill = figma.createRectangle();
  barFill.name = 'Заполнение'; barFill.resize(38, 3); barFill.cornerRadius = 999;
  barFill.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [
    { position: 0, color: { ...C(P.a500), a: 1 } }, { position: 1, color: { ...C(P.a300), a: 1 } }] }];
  bar.appendChild(barFill);
  add(dcol, bar, true);
  gap(dcol, 26);

  const deck = figma.createFrame();
  deck.name = 'Колода'; deck.resize(416, 560); deck.fills = []; deck.clipsContent = false;
  add(dcol, deck, true);
  deck.layoutSizingVertical = 'FIXED';

  const b2 = vacancyCard(VACANCIES.picker, 392, 462);
  deck.appendChild(b2);
  b2.rescale(0.9);
  const b1 = vacancyCard(VACANCIES.target, 392, 462);
  deck.appendChild(b1);
  b1.rescale(0.95);
  const fr = vacancyCard(Object.assign({}, VACANCIES.barista, { edge: true }), 392, 462);
  deck.appendChild(fr);
  fr.rotation = -6;
  fr.x = 40; fr.y = 8;
  // Наклон увеличивает габаритный прямоугольник — считаем низ по нему,
  // иначе задние карточки спрячутся под передней
  const frBox = fr.absoluteBoundingBox, dkBox = deck.absoluteBoundingBox;
  const bottom = frBox.y - dkBox.y + frBox.height;
  b1.x = (416 - b1.width) / 2; b1.y = bottom + 16 - b1.height; b1.opacity = 0.7;
  b2.x = (416 - b2.width) / 2; b2.y = bottom + 34 - b2.height; b2.opacity = 0.4;

  // Штамп свешивается за угол: так он читается как наложение и не
  // закрывает название компании
  const stamp = AL('HORIZONTAL', { name: 'Штамп ОТКЛИК', pad: [7, 14, 7, 14], radius: 12, stroke: P.yesGlow, strokeOp: 0.95, strokeW: 3, bg: P.g950, bgOp: 0.82 });
  stamp.appendChild(txt('ОТКЛИК', { size: 16, style: 'Semi Bold', color: P.yesGlow, ls: 10 }));
  deck.appendChild(stamp);
  stamp.rotation = 7; stamp.x = 16; stamp.y = -10;

  gap(dcol, 26);
  const controls = AL('HORIZONTAL', { name: 'Кнопки решения', gap: 20, align: 'CENTER', justify: 'CENTER' });
  add(dcol, controls, true);
  function roundBtn(size, glyph, tone) {
    const b = AL('HORIZONTAL', { name: glyph, radius: 999, align: 'CENTER', justify: 'CENTER', bg: tone === 'yes' ? '#1C3A2F' : P.g850, bgOp: tone === 'yes' ? 0.85 : 0.8, stroke: tone === 'yes' ? P.yes : P.paper, strokeOp: tone === 'yes' ? 0.5 : 0.16 });
    b.resize(size, size);
    b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED';
    b.appendChild(txt(glyph, { size: tone === 'small' ? 14 : 18, color: tone === 'yes' ? P.yesGlow : P.paper, op: tone === 'small' ? 0.55 : 0.75 }));
    if (tone === 'yes') b.effects = [{ type: 'DROP_SHADOW', color: { ...C(P.yes), a: 0.45 }, offset: { x: 0, y: 10 }, radius: 34, spread: -8, visible: true, blendMode: 'NORMAL' }];
    return b;
  }
  controls.appendChild(roundBtn(56, '✕'));
  controls.appendChild(roundBtn(44, '↺', 'small'));
  controls.appendChild(roundBtn(56, '✦', 'yes'));
  gap(dcol, 18);
  const hint = txt('←   Смахните карточку или нажмите стрелку   →', { size: 12.5, op: 0.38 });
  hint.textAlignHorizontal = 'CENTER';
  add(dcol, hint, true);

  /* ======================= 3. МОИ ОТКЛИКИ ======================= */
  const A = frame('A · Мои отклики — Desktop', 3240, 0, 1440, 1024);
  created.push(A);
  aurora(A, 1500, 620, 0.36, -320);
  appHeader(A, [['Лента', null, false], ['Отклики', '2', true], ['Пропущенные', '1', false]], 'Алиса Ковалёва', 'НИУ ВШЭ');

  const abody = AL('VERTICAL', { name: 'Содержимое', pad: [40, 40, 0, 40], align: 'CENTER' });
  add(A, abody, true);
  const acol = AL('VERTICAL', { name: 'Колонка' });
  acol.resize(960, 10);
  abody.appendChild(acol);
  acol.layoutSizingHorizontal = 'FIXED'; acol.layoutSizingVertical = 'HUG';
  add(acol, txt('Мои отклики', { size: 42, style: 'Semi Bold', ls: -3.4 }), true);
  gap(acol, 12);
  add(acol, txt('2 отклика · 2 в работе', { size: 14.5, op: 0.62 }), true);
  gap(acol, 34);

  const STAGES = ['Новый отклик', 'Просмотрен', 'Приглашение', 'Собеседование', 'Вышел на работу'];
  const APPS = [
    { co: 'Metrika Digital', ini: 'MD', hue: [0.16, 0.2, 0.26], title: 'Контент-менеджер соцсетей', pay: '48 000 — 60 000 ₽', city: 'Москва', stage: 2, status: 'Приглашение', tone: 'warn', when: 'Отклик отправлен 2 часа назад · статус обновлён 12 минут назад', note: 'Здравствуйте! Готовы обсудить график — напишите, когда удобно созвониться.' },
    { co: 'Кофейни «Север»', ini: 'К«', hue: [0.17, 0.21, 0.25], title: 'Бариста', pay: '3 200 — 4 200 ₽', city: 'Москва', stage: 0, status: 'Новый отклик', tone: 'accent', when: 'Отклик отправлен 6 часов назад', note: null },
  ];
  for (const a of APPS) {
    const card = AL('VERTICAL', { name: 'Отклик · ' + a.title, pad: [24, 26, 24, 26], radius: 26, bg: P.g850, bgOp: 0.9, stroke: P.paper, strokeOp: 0.09 });
    add(acol, card, true);
    const row = AL('HORIZONTAL', { name: 'Шапка', gap: 16, align: 'CENTER' });
    add(card, row, true);
    row.appendChild(squareLogo(46, a.ini, a.hue));
    const info = AL('VERTICAL', { name: 'Инфо', gap: 4 });
    info.appendChild(txt(a.co, { size: 13, op: 0.38 }));
    info.appendChild(txt(a.title, { size: 18, style: 'Semi Bold', ls: -2 }));
    const meta = AL('HORIZONTAL', { name: 'Мета', gap: 14, align: 'CENTER' });
    meta.appendChild(txt(a.pay, { size: 13, color: P.a200 }));
    meta.appendChild(txt('◍ ' + a.city, { size: 13, op: 0.38 }));
    info.appendChild(meta);
    add(row, info, true);
    row.appendChild(tag(a.status, a.tone));
    gap(card, 22);
    // Воронка отклика: отказ не рисуется как шаг назад, этап просто гаснет
    const funnel = AL('HORIZONTAL', { name: 'Воронка', gap: 4 });
    add(card, funnel, true);
    STAGES.forEach((_, i) => {
      const seg = figma.createFrame();
      seg.name = STAGES[i]; seg.resize(100, 4); seg.cornerRadius = 999;
      seg.fills = [S(i < a.stage ? P.a500 : i === a.stage ? P.a300 : P.paper, i <= a.stage ? 1 : 0.1)];
      funnel.appendChild(seg);
      seg.layoutSizingHorizontal = 'FILL';
    });
    gap(card, 10);
    add(card, txt('Этап: ' + a.status, { size: 11.5, op: 0.38 }), true);
    gap(card, 10);
    add(card, txt(a.when, { size: 12.5, op: 0.38 }), true);
    if (a.note) {
      gap(card, 14);
      const note = AL('VERTICAL', { name: 'Комментарий', pad: [12, 14, 12, 14], radius: 14, bg: P.g950, bgOp: 0.6, stroke: P.paper, strokeOp: 0.09 });
      add(card, note, true);
      add(note, txt(a.note, { size: 13, lh: 155, op: 0.62 }), true);
    }
    gap(acol, 12);
  }

  /* ======================= 4. КАБИНЕТ РАБОТОДАТЕЛЯ ======================= */
  const E = frame('A · Кабинет работодателя — Desktop', 4860, 0, 1440, 1024);
  created.push(E);
  aurora(E, 1500, 620, 0.36, -320);
  appHeader(E, null, 'Кофейни «Север»', 'Анна Верещагина');

  const ebody = AL('VERTICAL', { name: 'Содержимое', pad: [40, 40, 0, 40], align: 'CENTER' });
  add(E, ebody, true);
  const ecol = AL('VERTICAL', { name: 'Колонка' });
  ecol.resize(1060, 10);
  ebody.appendChild(ecol);
  ecol.layoutSizingHorizontal = 'FIXED'; ecol.layoutSizingVertical = 'HUG';
  add(ecol, txt('КАБИНЕТ РАБОТОДАТЕЛЯ', { size: 11, style: 'Medium', color: P.a300, ls: 18 }), true);
  gap(ecol, 14);
  add(ecol, txt('Кофейни «Север»', { size: 42, style: 'Semi Bold', ls: -3.4 }), true);
  gap(ecol, 28);
  const ekpi = AL('HORIZONTAL', { name: 'Показатели', gap: 1, radius: 20, bg: P.paper, bgOp: 0.09, stroke: P.paper, strokeOp: 0.09 });
  ekpi.clipsContent = true;
  add(ecol, ekpi, true);
  for (const [v, l, accent] of [['6', 'откликов', false], ['2', 'новых', true], ['2', 'вакансии', false]]) {
    const cell = AL('VERTICAL', { name: l, gap: 9, pad: [22, 24, 22, 24], bg: P.ink });
    cell.appendChild(txt(v, { size: 27, style: 'Semi Bold', ls: -3, color: accent ? P.a200 : P.paper }));
    cell.appendChild(txt(l, { size: 12.5, op: 0.38 }));
    ekpi.appendChild(cell);
    cell.layoutSizingHorizontal = 'FILL';
  }
  gap(ecol, 24);
  const filters = AL('HORIZONTAL', { name: 'Фильтры', gap: 8 });
  add(ecol, filters, true);
  for (const [l, n, active] of [['Все вакансии', '6', true], ['Бариста', '4', false], ['Помощник управляющего кофейни', '2', false]]) {
    const f = AL('HORIZONTAL', { name: l, gap: 7, pad: [9, 16, 9, 16], radius: 999, align: 'CENTER', bg: active ? P.a500 : P.g900, bgOp: active ? 0.2 : 0.45, stroke: active ? P.a400 : P.paper, strokeOp: active ? 0.55 : 0.09 });
    f.appendChild(txt(l, { size: 13, style: 'Medium', op: active ? 1 : 0.6 }));
    const cc = AL('HORIZONTAL', { name: 'n', pad: [2, 6, 2, 6], radius: 999, bg: P.paper, bgOp: 0.09 });
    cc.appendChild(txt(n, { size: 10.5, op: 0.6 }));
    f.appendChild(cc);
    filters.appendChild(f);
  }
  gap(ecol, 20);

  const CANDS = [
    { name: 'Алиса Ковалёва', age: '21 год', uni: 'НИУ ВШЭ, 3 курс', spec: 'Реклама и связи с общественностью', hue: [0.22, 0.19, 0.26], on: 'Бариста', when: '6 часов назад', status: 'Приглашение', tone: 'warn', skills: ['Excel', 'SMM', 'Английский B2', 'Копирайтинг', 'Figma'], open: true },
    { name: 'Артём Соболев', age: '22 года', uni: 'МИСиС, 3 курс', spec: 'Материаловедение', hue: [0.16, 0.21, 0.24], on: 'Помощник управляющего кофейни', when: '1 день назад', status: 'Новый отклик', tone: 'accent', skills: ['Excel', 'Химия', 'Лаборатория'], open: false },
    { name: 'Дарья Пшеничная', age: '20 лет', uni: 'РЭУ им. Плеханова, 2 курс', spec: 'Маркетинг', hue: [0.24, 0.2, 0.22], on: 'Бариста', when: '2 дня назад', status: 'Просмотрен', tone: null, skills: ['SMM', 'Excel', 'Копирайтинг'], open: false },
  ];
  for (const c of CANDS) {
    const card = AL('VERTICAL', { name: 'Кандидат · ' + c.name, pad: [20, 22, 20, 22], radius: 26, bg: P.g850, bgOp: 0.9, stroke: P.paper, strokeOp: 0.09 });
    add(ecol, card, true);
    const row = AL('HORIZONTAL', { name: 'Строка', gap: 16 });
    add(card, row, true);
    row.appendChild(avatar(56, c.hue));
    const info = AL('VERTICAL', { name: 'Инфо', gap: 6 });
    const nameRow = AL('HORIZONTAL', { name: 'Имя', gap: 12, align: 'CENTER', justify: 'SPACE_BETWEEN' });
    const nameLeft = AL('VERTICAL', { name: 'left', gap: 5 });
    nameLeft.appendChild(txt(c.name, { size: 17, style: 'Semi Bold', ls: -2 }));
    const lineRow = AL('HORIZONTAL', { name: 'мета', gap: 10, align: 'CENTER' });
    lineRow.appendChild(txt(c.age, { size: 13, op: 0.62 }));
    lineRow.appendChild(txt('·', { size: 13, op: 0.3 }));
    lineRow.appendChild(txt('◈ ' + c.uni, { size: 13, op: 0.62 }));
    nameLeft.appendChild(lineRow);
    nameLeft.appendChild(txt(c.spec, { size: 13, op: 0.38 }));
    add(nameRow, nameLeft, true);
    nameRow.appendChild(tag(c.status, c.tone));
    add(info, nameRow, true);
    gap(info, 10);
    add(info, txt('Откликнулся на «' + c.on + '» ' + c.when, { size: 12.5, op: 0.38 }), true);
    gap(info, 12);
    const sk = AL('HORIZONTAL', { name: 'Навыки', gap: 6 });
    for (const s of c.skills) sk.appendChild(tag(s));
    add(info, sk, true);
    add(row, info, true);
    row.appendChild(txt(c.open ? '⌃' : '⌄', { size: 15, op: 0.38 }));

    if (c.open) {
      gap(card, 18);
      const div = figma.createRectangle();
      div.name = 'Линия'; div.resize(960, 1); div.fills = [S(P.paper, 0.09)];
      add(card, div, true);
      gap(card, 18);
      const cols = AL('HORIZONTAL', { name: 'Детали', gap: 40 });
      add(card, cols, true);
      // Контакты открыты сразу: студент сам откликнулся на эту вакансию
      const left = AL('VERTICAL', { name: 'Контакты', gap: 10 });
      left.appendChild(txt('КОНТАКТЫ', { size: 11, style: 'Medium', op: 0.38, ls: 14 }));
      left.appendChild(txt('✉  student@demo.ru', { size: 14 }));
      left.appendChild(txt('☎  +7 916 240-11-08', { size: 14 }));
      const resume = AL('HORIZONTAL', { name: 'Резюме', gap: 8, pad: [9, 14, 9, 14], radius: 12, bg: P.a500, bgOp: 0.14, stroke: P.a500, strokeOp: 0.35, align: 'CENTER' });
      resume.appendChild(txt('⤓  Ковалёва_резюме.pdf', { size: 13, color: P.a100 }));
      left.appendChild(resume);
      add(cols, left, true);
      const right = AL('VERTICAL', { name: 'График', gap: 10 });
      right.appendChild(txt('ГРАФИК', { size: 11, style: 'Medium', op: 0.38, ls: 14 }));
      const dd = AL('HORIZONTAL', { name: 'Дни', gap: 5 });
      for (const d of ['Пн', 'Ср', 'Пт', 'Сб']) {
        const ch = AL('HORIZONTAL', { name: d, pad: [4, 8, 4, 8], radius: 7, bg: P.paper, bgOp: 0.08 });
        ch.appendChild(txt(d, { size: 12, op: 0.75 }));
        dd.appendChild(ch);
      }
      right.appendChild(dd);
      right.appendChild(txt('до 22 часов в неделю · Москва', { size: 13, op: 0.62 }));
      add(cols, right, true);
      gap(card, 20);
      add(card, txt('ЭТАП ОТБОРА', { size: 11, style: 'Medium', op: 0.38, ls: 14 }), true);
      gap(card, 12);
      const stagesRow = AL('HORIZONTAL', { name: 'Этапы', gap: 6 });
      add(card, stagesRow, true);
      for (const [l, on] of [['Новый отклик', false], ['Просмотрен', false], ['Приглашение', true], ['Собеседование', false], ['Вышел на работу', false], ['Отказ', false]]) {
        const b = AL('HORIZONTAL', { name: l, pad: [8, 14, 8, 14], radius: 999, bg: on ? P.a500 : P.g900, bgOp: on ? 0.2 : 0.45, stroke: on ? P.a400 : P.paper, strokeOp: on ? 0.55 : 0.09 });
        b.appendChild(txt(l, { size: 12.5, style: 'Medium', op: on ? 1 : 0.6 }));
        stagesRow.appendChild(b);
      }
    }
    gap(ecol, 12);
  }

  /* ======================= 5. ПАНЕЛЬ HR-МЕНЕДЖЕРА ======================= */
  const H = frame('A · Панель HR-менеджера — Desktop', 6480, 0, 1440, 1500);
  created.push(H);
  aurora(H, 1500, 620, 0.34, -330);
  appHeader(H, null, 'Администратор', 'Fattakhov HR Agency');

  const hbody = AL('VERTICAL', { name: 'Содержимое', pad: [38, 48, 0, 48] });
  add(H, hbody, true);
  const titleRow = AL('HORIZONTAL', { name: 'Заголовок', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(hbody, titleRow, true);
  const tl = AL('VERTICAL', { name: 'left' });
  tl.appendChild(txt('HR-МЕНЕДЖЕР', { size: 11, style: 'Medium', color: P.a300, ls: 18 }));
  gap(tl, 14);
  tl.appendChild(txt('Панель управления', { size: 42, style: 'Semi Bold', ls: -3.4 }));
  gap(tl, 10);
  tl.appendChild(txt('Последняя синхронизация с CRM — 1 час назад', { size: 14, op: 0.62 }));
  titleRow.appendChild(tl);
  const syncBtn = AL('HORIZONTAL', { name: 'Синхронизировать', gap: 10, pad: [16, 22, 16, 20], radius: 18, align: 'CENTER', bg: P.g900, bgOp: 0.6, stroke: P.paper, strokeOp: 0.16 });
  syncBtn.appendChild(txt('⟳', { size: 15, op: 0.8 }));
  syncBtn.appendChild(txt('Синхронизировать вакансии', { size: 15, style: 'Medium' }));
  titleRow.appendChild(syncBtn);
  gap(hbody, 32);

  const kpi = AL('HORIZONTAL', { name: 'KPI', gap: 1, radius: 24, bg: P.paper, bgOp: 0.09, stroke: P.paper, strokeOp: 0.09 });
  kpi.clipsContent = true;
  add(hbody, kpi, true);
  for (const [v, l, n] of [['6', 'студентов в базе', '+1 за неделю'], ['7', 'откликов всего', '13 решений в ленте'], ['14%', 'доходят до выхода', null], ['14', 'активных вакансий', '14 всего в базе']]) {
    const cell = AL('VERTICAL', { name: l, gap: 10, pad: [26, 28, 26, 28], bg: P.ink });
    cell.appendChild(txt(v, { size: 34, style: 'Semi Bold', ls: -4, lh: 100 }));
    cell.appendChild(txt(l, { size: 13, op: 0.62 }));
    if (n) cell.appendChild(txt(n, { size: 11.5, op: 0.38 }));
    kpi.appendChild(cell);
    cell.layoutSizingHorizontal = 'FILL';
  }
  gap(hbody, 40);

  // «В процессе» стоит выше графиков: именно там лежат люди, которых
  // можно потерять, если не позвонить
  const ipHead = AL('HORIZONTAL', { name: 'Заголовок раздела', justify: 'SPACE_BETWEEN', align: 'BASELINE' });
  add(hbody, ipHead, true);
  ipHead.appendChild(txt('Кто в процессе', { size: 28, style: 'Semi Bold', ls: -2.4 }));
  ipHead.appendChild(txt('4 человека между просмотром и выходом', { size: 13, op: 0.38 }));
  gap(hbody, 18);
  const ipCard = AL('VERTICAL', { name: 'В процессе', radius: 24, bg: P.g850, bgOp: 0.9, stroke: P.paper, strokeOp: 0.09 });
  ipCard.clipsContent = true;
  add(hbody, ipCard, true);
  const IP = [
    ['Алиса Ковалёва', 'НИУ ВШЭ', 'Бариста', 'Кофейни «Север»', 'Приглашение', 'warn', '3 минуты назад', [0.22, 0.19, 0.26]],
    ['Марк Гурьев', 'МГТУ им. Баумана', 'Контент-менеджер соцсетей', 'Metrika Digital', 'Просмотрен', null, '12 часов назад', [0.16, 0.2, 0.26]],
    ['Дарья Пшеничная', 'РЭУ им. Плеханова', 'Сборщик заказов', 'Даркстор «Ближний»', 'Приглашение', 'warn', '18 часов назад', [0.24, 0.2, 0.22]],
    ['Тимур Насыров', 'МФТИ', 'Преподаватель математики', 'Образовательный центр «Логос»', 'Собеседование', 'warn', '1 день назад', [0.15, 0.22, 0.24]],
  ];
  IP.forEach(([name, uni, vac, co, st, tone, when, hue], i) => {
    const row = AL('HORIZONTAL', { name: name, gap: 16, pad: [16, 22, 16, 22], align: 'CENTER' });
    if (i > 0) {
      row.strokes = [S(P.paper, 0.09)]; row.strokeAlign = 'INSIDE';
      row.strokeTopWeight = 1; row.strokeBottomWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
    }
    add(ipCard, row, true);
    row.appendChild(avatar(40, hue));
    const l = AL('VERTICAL', { name: 'Студент', gap: 3 });
    l.appendChild(txt(name, { size: 14.5, style: 'Medium' }));
    l.appendChild(txt(uni, { size: 12.5, op: 0.38 }));
    add(row, l, true);
    const m = AL('VERTICAL', { name: 'Вакансия', gap: 3 });
    m.appendChild(txt(vac, { size: 13.5, op: 0.62 }));
    m.appendChild(txt(co, { size: 12.5, op: 0.38 }));
    add(row, m, true);
    const r = AL('VERTICAL', { name: 'Статус', gap: 6, align: 'MAX' });
    r.appendChild(tag(st, tone));
    r.appendChild(txt(when, { size: 11.5, op: 0.38 }));
    row.appendChild(r);
  });
  gap(hbody, 40);

  function panelBlock(title, subtitle, icon) {
    const p = AL('VERTICAL', { name: title, pad: [22, 24, 24, 24], radius: 24, bg: P.g850, bgOp: 0.9, stroke: P.paper, strokeOp: 0.09 });
    add(p, txt((icon ? icon + '  ' : '') + title, { size: 15, style: 'Semi Bold', ls: -1.5 }), true);
    gap(p, 6);
    add(p, txt(subtitle, { size: 12.5, op: 0.38 }), true);
    gap(p, 20);
    return p;
  }
  /** Одна заливка на все полосы: длина уже кодирует величину, второй раз
   *  кодировать её оттенком незачем. Цвет появляется там, где он значит
   *  статус — закрытый положительный исход. */
  function barRow(parent, label, value, share, ratio, tone) {
    const row = AL('VERTICAL', { name: label });
    add(parent, row, true);
    const head = AL('HORIZONTAL', { name: 'head', justify: 'SPACE_BETWEEN', align: 'BASELINE' });
    add(row, head, true);
    head.appendChild(txt(label, { size: 13, op: 0.62 }));
    const right = AL('HORIZONTAL', { name: 'v', gap: 7, align: 'BASELINE' });
    right.appendChild(txt(String(value), { size: 13 }));
    right.appendChild(txt(share, { size: 11.5, op: 0.38 }));
    head.appendChild(right);
    gap(row, 7);
    const track = figma.createFrame();
    track.name = 'Дорожка'; track.resize(300, 8); track.cornerRadius = 999;
    track.fills = [S(P.paper, 0.06)]; track.clipsContent = true;
    const fillBar = figma.createRectangle();
    fillBar.name = 'Значение'; fillBar.resize(Math.max(6, 300 * ratio), 8); fillBar.cornerRadius = 999;
    fillBar.fills = [S(tone === 'good' ? P.yes : tone === 'mute' ? P.paper : P.a400, tone === 'mute' ? 0.2 : 1)];
    track.appendChild(fillBar);
    add(row, track, true);
    gap(parent, 14);
  }

  const panels = AL('HORIZONTAL', { name: 'Показатели', gap: 16 });
  add(hbody, panels, true);
  const p1 = panelBlock('Воронка откликов', '7 всего');
  panels.appendChild(p1); p1.layoutSizingHorizontal = 'FILL'; p1.layoutSizingVertical = 'FILL';
  barRow(p1, 'Новый отклик', 2, '29%', 1);
  barRow(p1, 'Просмотрен', 1, '14%', 0.5);
  barRow(p1, 'Приглашение', 2, '29%', 1);
  barRow(p1, 'Собеседование', 1, '14%', 0.5);
  barRow(p1, 'Вышел на работу', 1, '14%', 0.5, 'good');
  barRow(p1, 'Отказ', 0, '0%', 0.02, 'mute');

  const p2 = panelBlock('Студенты по статусам', '6 в базе');
  panels.appendChild(p2); p2.layoutSizingHorizontal = 'FILL'; p2.layoutSizingVertical = 'FILL';
  barRow(p2, 'Ищет', 2, '33%', 1);
  barRow(p2, 'В процессе', 2, '33%', 1);
  barRow(p2, 'Трудоустроен', 1, '17%', 0.5, 'good');
  barRow(p2, 'На паузе', 1, '17%', 0.5, 'mute');

  // Не два цветных сегмента: в монохромном бренде соседние оттенки
  // неразличимы для дальтоника. Заполнена доля «вправо», остальное — фон.
  const p3 = panelBlock('Решения в ленте', 'Свайпы за всё время');
  panels.appendChild(p3); p3.layoutSizingHorizontal = 'FILL'; p3.layoutSizingVertical = 'FILL';
  const shareHead = AL('HORIZONTAL', { name: 'head', justify: 'SPACE_BETWEEN', align: 'BASELINE' });
  add(p3, shareHead, true);
  shareHead.appendChild(txt('Всего решений', { size: 13, op: 0.62 }));
  shareHead.appendChild(txt('13', { size: 13 }));
  gap(p3, 10);
  const strack = figma.createFrame();
  strack.name = 'Дорожка'; strack.resize(300, 10); strack.cornerRadius = 999;
  strack.fills = [S(P.paper, 0.06)]; strack.clipsContent = true;
  const sfill = figma.createRectangle();
  sfill.name = 'Вправо'; sfill.resize(162, 10); sfill.cornerRadius = 999;
  sfill.fills = [S(P.a400)];
  strack.appendChild(sfill);
  add(p3, strack, true);
  gap(p3, 12);
  const legend = AL('HORIZONTAL', { name: 'Легенда', justify: 'SPACE_BETWEEN', align: 'CENTER' });
  add(p3, legend, true);
  const lgL = AL('HORIZONTAL', { name: 'l', gap: 7, align: 'CENTER' });
  const dotY = figma.createEllipse(); dotY.resize(8, 8); dotY.fills = [S(P.a400)]; dotY.name = '•';
  lgL.appendChild(dotY);
  lgL.appendChild(txt('Вправо: 7 (54%)', { size: 12, op: 0.62 }));
  legend.appendChild(lgL);
  const lgR = AL('HORIZONTAL', { name: 'r', gap: 7, align: 'CENTER' });
  const dotN = figma.createEllipse(); dotN.resize(8, 8); dotN.fills = [S(P.paper, 0.2)]; dotN.name = '•';
  lgR.appendChild(dotN);
  lgR.appendChild(txt('Влево: 6', { size: 12, op: 0.38 }));
  legend.appendChild(lgR);
  gap(p3, 26);
  add(p3, txt('Доля свайпов вправо — качество подборки. Если она падает ниже 30%, лента показывает студентам не то: стоит проверить фильтры графика и города.', { size: 12.5, lh: 155, op: 0.38 }), true);
  gap(hbody, 16);

  const bottom2 = AL('HORIZONTAL', { name: 'Низ', gap: 16 });
  add(hbody, bottom2, true);
  const sync = panelBlock('История синхронизаций', 'Последние запуски');
  bottom2.appendChild(sync); sync.layoutSizingHorizontal = 'FILL'; sync.layoutSizingVertical = 'FILL';
  for (const [ok, lineText, meta] of [[true, 'Создано 0 · обновлено 14 · снято 0', '8 сент., 19:09 · источник crm'], [true, 'Создано 14 · обновлено 0 · снято 0', '8 сент., 17:56 · источник crm']]) {
    const r = AL('HORIZONTAL', { name: lineText, gap: 12, pad: [14, 16, 14, 16], radius: 16, bg: P.g950, bgOp: 0.5, stroke: P.paper, strokeOp: 0.09 });
    add(sync, r, true);
    r.appendChild(txt(ok ? '✓' : '!', { size: 14, color: ok ? P.yes : P.warn }));
    const cc = AL('VERTICAL', { name: 'txt', gap: 4 });
    cc.appendChild(txt(lineText, { size: 13.5 }));
    cc.appendChild(txt(meta, { size: 12, op: 0.38 }));
    add(r, cc, true);
    gap(sync, 10);
  }
  const audit = panelBlock('Журнал обращений к данным', 'Кто и что делал', '▤');
  bottom2.appendChild(audit); audit.layoutSizingHorizontal = 'FILL'; audit.layoutSizingVertical = 'FILL';
  for (const [action, actor, when] of [
    ['sync.run', 'ADMIN:Администратор · 127.0.0.1', 'только что'],
    ['auth.login', 'ADMIN:Администратор · 127.0.0.1', '2 минуты назад'],
    ['application.status', 'EMPLOYER:Кофейни «Север» · 127.0.0.1', '3 минуты назад'],
    ['auth.employer', 'EMPLOYER:Кофейни «Север» · 127.0.0.1', '5 минут назад'],
    ['application.created', 'STUDENT:Алиса Ковалёва · 127.0.0.1', '10 минут назад'],
  ]) {
    const r = AL('HORIZONTAL', { name: action, gap: 12, pad: [8, 10, 8, 10], radius: 12, align: 'CENTER', justify: 'SPACE_BETWEEN' });
    add(audit, r, true);
    const cc = AL('VERTICAL', { name: 'txt', gap: 3 });
    cc.appendChild(txt(action, { size: 13, op: 0.62 }));
    cc.appendChild(txt(actor, { size: 11.5, op: 0.38 }));
    add(r, cc, true);
    r.appendChild(txt(when, { size: 11.5, op: 0.38 }));
    gap(audit, 4);
  }

  figma.currentPage.selection = created;
  figma.viewport.scrollAndZoomIntoView(created);
})();
