/* ===== STEPPESHIELD — агрономическая модель Rotation Stress Test ===== */
var SS = (function () {
  // Запасной климат областей (центр области): T2M — средняя температура, °C; P — осадки, мм/мес; tmaxJul — средняя Tmax июля, °C.
  // Приближение к климатологии NASA POWER. Основной источник — живой запрос к NASA POWER по координатам поля (/api/nasa)
  // или загруженный файл NASA POWER. Эти значения используются, только если ни того, ни другого нет.
  var REGIONS = {
    akm: { name: "Акмолинская", city: "Астана", lat: 51.17, lon: 71.45, soil: "chern_s", irr: false, tmaxJul: 26.5,
      T: [-15.5, -15, -8, 5, 13, 18.7, 20.5, 18, 11.5, 3, -7, -13], P: [15, 13, 15, 22, 32, 40, 55, 40, 27, 26, 22, 18] },
    kos: { name: "Костанайская", city: "Костанай", lat: 53.21, lon: 63.62, soil: "chern_s", irr: false, tmaxJul: 27.0,
      T: [-16, -15, -7, 6, 14, 19.5, 21, 19, 12.5, 4, -6, -13], P: [17, 13, 15, 22, 32, 40, 55, 38, 25, 28, 22, 20] },
    sko: { name: "Северо-Казахстанская", city: "Петропавловск", lat: 54.87, lon: 69.15, soil: "chern_o", irr: false, tmaxJul: 25.5,
      T: [-16.5, -15, -8, 4, 12.5, 18, 19.5, 17, 11, 2.5, -7, -13.5], P: [20, 15, 17, 22, 35, 50, 65, 50, 30, 30, 25, 22] },
    pav: { name: "Павлодарская", city: "Павлодар", lat: 52.29, lon: 76.97, soil: "dkash", irr: false, tmaxJul: 27.5,
      T: [-16, -15.5, -7.5, 5.5, 14, 20, 21.5, 19, 12, 4, -6, -13.5], P: [15, 11, 12, 18, 28, 38, 50, 33, 22, 25, 22, 18] },
    vko: { name: "Восточно-Казахстанская", city: "Усть-Каменогорск", lat: 49.95, lon: 82.61, soil: "chern_s", irr: false, tmaxJul: 27.5,
      T: [-15, -14, -6, 6, 13.5, 19, 21, 19, 12.5, 4.5, -5, -12], P: [25, 22, 22, 30, 45, 48, 55, 40, 30, 40, 38, 30] },
    zko: { name: "Западно-Казахстанская", city: "Уральск", lat: 51.23, lon: 51.37, soil: "dkash", irr: false, tmaxJul: 29.0,
      T: [-10, -9.5, -3, 8, 16, 21, 23, 21.5, 14.5, 6, -2, -7.5], P: [28, 22, 24, 25, 33, 38, 38, 30, 30, 32, 30, 28] },
    akt: { name: "Актюбинская", city: "Актобе", lat: 50.28, lon: 57.17, soil: "kash", irr: false, tmaxJul: 29.5,
      T: [-13, -12.5, -5, 7, 15.5, 21, 23, 21, 14, 5, -3.5, -10], P: [18, 16, 18, 22, 30, 28, 28, 22, 20, 26, 25, 22] },
    kar: { name: "Карагандинская", city: "Караганда", lat: 49.80, lon: 73.10, soil: "kash", irr: false, tmaxJul: 27.0,
      T: [-13.5, -13, -6, 5, 13, 18.5, 20.5, 18.5, 12, 3.5, -5.5, -11.5], P: [15, 13, 14, 20, 32, 38, 45, 32, 20, 24, 22, 18] },
    alm: { name: "Алматинская", city: "Талдыкорган", lat: 45.02, lon: 78.37, soil: "kash", irr: true, tmaxJul: 31.0,
      T: [-10, -8, 0, 10, 16, 21, 23.5, 22, 16, 8, -1, -7], P: [25, 25, 35, 50, 50, 35, 25, 15, 15, 30, 35, 30] },
    zha: { name: "Жамбылская", city: "Тараз", lat: 42.90, lon: 71.37, soil: "seroz", irr: true, tmaxJul: 32.5,
      T: [-4, -2, 5, 12, 17.5, 22.5, 25, 23.5, 17.5, 10, 3, -2], P: [25, 30, 45, 50, 40, 20, 10, 6, 8, 25, 30, 28] },
    tur: { name: "Туркестанская", city: "Шымкент", lat: 42.32, lon: 69.59, soil: "seroz", irr: true, tmaxJul: 34.0,
      T: [-1, 1, 7.5, 14, 19.5, 25, 27, 25, 19, 11.5, 5, 0.5], P: [60, 65, 85, 70, 45, 15, 5, 3, 5, 30, 50, 65] },
    kyz: { name: "Кызылординская", city: "Кызылорда", lat: 44.85, lon: 65.51, soil: "allu", irr: true, tmaxJul: 35.0,
      T: [-7, -5, 3, 13, 20, 25.5, 27.5, 25.5, 18, 9.5, 1, -5], P: [12, 13, 17, 15, 12, 6, 5, 3, 3, 7, 10, 14] }
  };

  var SOILS = {
    chern_o: { name: "Чернозём обыкновенный", store: 1.2, start: 65 },
    chern_s: { name: "Чернозём южный", store: 1.15, start: 58 },
    dkash: { name: "Тёмно-каштановая", store: 1.0, start: 50 },
    kash: { name: "Каштановая", store: 0.92, start: 44 },
    lkash: { name: "Светло-каштановая", store: 0.85, start: 38 },
    seroz: { name: "Серозём", store: 0.8, start: 35 },
    allu: { name: "Аллювиально-луговая", store: 1.05, start: 45 }
  };

  // Параметры культур (встроены в приложение, фермер их не вводит).
  // need — сезонная потребность в воде, мм (FAO-56); ky — коэффициент реакции урожая на дефицит воды (FAO-33);
  // thr — порог жары по Tmax июля, °C; cold — минимальная средняя T июля; sat — нужная сумма активных температур выше 10 °C;
  // y — урожайность в хороший год, т/га;
  // price — ориентировочная цена, тг/т; cost — затраты на гектар, тг/га; soil — изменение индекса почвы за сезон;
  // grp — группа для правил севооборота; gap — через сколько лет можно возвращать культуру на поле.
  var CROPS = {
    wheat:     { name: "Пшеница",  grp: "small", need: 300,  ky: 1.05, thr: 28, cold: 0, sat: 1700,  y: 2.2, price: 100000, cost: 110000, soil: -2 },
    barley:    { name: "Ячмень",   grp: "small", need: 290,  ky: 1.00, thr: 28, cold: 0, sat: 1400,  y: 2.4, price: 75000,  cost: 100000, soil: -3 },
    oats:      { name: "Овёс",     grp: "small", need: 300,  ky: 1.00, thr: 27, cold: 0, sat: 1500,  y: 2.2, price: 70000,  cost: 90000,  soil: -1, gap: 3 },
    corn:      { name: "Кукуруза", grp: "row",   need: 480,  ky: 1.25, thr: 35, cold: 20, sat: 2600, y: 7.0, price: 80000,  cost: 330000, soil: -4, gap: 2 },
    rice:      { name: "Рис",      grp: "rice",  need: 1100, ky: 1.30, thr: 36, cold: 22, sat: 3200, y: 6.0, price: 150000, cost: 520000, soil: -2, irrOnly: true },
    millet:    { name: "Просо",    grp: "break", need: 250,  ky: 0.80, thr: 34, cold: 0, sat: 1800,  y: 1.8, price: 85000,  cost: 85000,  soil: -2, gap: 3 },
    buckwheat: { name: "Гречиха",  grp: "break", need: 280,  ky: 0.90, thr: 27, cold: 0, sat: 1300,  y: 1.4, price: 180000, cost: 120000, soil: 2, heatSens: 0.08, gap: 3 },
    fallow:    { name: "Пар",      grp: "fallow", need: 0,   ky: 0,    thr: 99, cold: 0,  y: 0,   price: 0,      cost: 25000,  soil: -4 }
  };
  var CROP_KEYS = Object.keys(CROPS);

  // Районирование: где культуру выращивают в Казахстане. 2 — основная культура области, 1 — выращивают немного,
  // 0 — практически не выращивают (нет традиции, сбыта или подходящих условий).
  var REGION_CROPS = {
    akm: { wheat: 2, barley: 2, oats: 1, buckwheat: 1, millet: 1, corn: 0, rice: 0 },
    kos: { wheat: 2, barley: 2, oats: 1, buckwheat: 1, millet: 1, corn: 0, rice: 0 },
    sko: { wheat: 2, barley: 2, oats: 2, buckwheat: 1, millet: 1, corn: 0, rice: 0 },
    pav: { wheat: 2, barley: 2, oats: 1, buckwheat: 2, millet: 2, corn: 0, rice: 0 },
    vko: { wheat: 2, barley: 2, oats: 1, buckwheat: 2, millet: 1, corn: 1, rice: 0 },
    zko: { wheat: 2, barley: 2, oats: 1, buckwheat: 0, millet: 2, corn: 0, rice: 0 },
    akt: { wheat: 2, barley: 2, oats: 1, buckwheat: 0, millet: 2, corn: 0, rice: 0 },
    kar: { wheat: 2, barley: 2, oats: 2, buckwheat: 1, millet: 1, corn: 0, rice: 0 },
    alm: { wheat: 2, barley: 2, oats: 1, buckwheat: 0, millet: 1, corn: 2, rice: 2 },
    zha: { wheat: 2, barley: 2, oats: 1, buckwheat: 0, millet: 1, corn: 2, rice: 0 },
    tur: { wheat: 2, barley: 2, oats: 1, buckwheat: 0, millet: 1, corn: 2, rice: 2 },
    kyz: { wheat: 2, barley: 1, oats: 0, buckwheat: 0, millet: 1, corn: 1, rice: 2 }
  };
  function cropLevel(field, k) { if (k === "fallow") return 2; var r = REGION_CROPS[field.region]; return r && r[k] != null ? r[k] : 1; }

  // Сумма активных температур выше 10 °C по месяцам климатологии (приближённо).
  var DM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function heatSum(K, dt) { var s = 0; for (var i = 0; i < 12; i++) { var t = K.T[i] + (dt || 0); if (t > 10) s += t * DM[i]; } return Math.round(s); }

  // Рис выращивают только на рисовых оросительных системах (чеки, вода из Сырдарьи, Или, Каратала).
  // В остальных районах таких систем нет, и рис невозможен даже при поливе.
  var RICE_REGIONS = { kyz: 1, alm: 1, tur: 1 };
  // Рис требует тяжёлых почв, которые держат воду в чеках; на лёгких почвах урожай ниже.
  var RICE_SOIL = { allu: 1, seroz: 0.9, kash: 0.8, dkash: 0.8, chern_s: 0.75, chern_o: 0.75, lkash: 0.6 };

  // Тип полива: none — богара; drip — дождевание или капельный (до 350 мм за сезон);
  // canal — оросительный канал с чеками (до 1 300 мм для риса, до 500 мм для других культур).
  function irrType(field) { return field.irrType || (field.irr ? "canal" : "none"); }
  function riceOk(field) { return irrType(field) === "canal" && !!RICE_REGIONS[field.region]; }

  function scenarios(opt) {
    return [
      { id: "norm", name: "Обычный климат", short: "Норма", pf: 1, dt: 0 },
      { id: "dry", name: "Осадки −" + opt.dryPct + "%", short: "Засуха", pf: 1 - opt.dryPct / 100, dt: 0 },
      { id: "heat", name: "Температура +" + opt.heatC + " °C", short: "Жара", pf: 1, dt: opt.heatC }
    ];
  }

  function sum(a, i, j) { var s = 0; for (var k = i; k <= j; k++) s += a[k]; return s; }

  // Климат поля: данные NASA POWER по координатам (или файл), иначе запасной климат области.
  function climateOf(field) {
    if (field.nasa && field.nasa.T && field.nasa.P) return field.nasa;
    return REGIONS[field.region];
  }

  // field: { region, soil, irr, hist:[2 года назад, прошлый год], nasa? }
  // Возвращает по годам: доля урожая (yield 0–1), урожай т/га, маржу тг/га, дефицит влаги, полив мм, индекс почвы.
  function run(strategy, field, scen) {
    var K = climateOf(field), S = SOILS[field.soil] || SOILS.dkash;
    var seasonP = sum(K.P, 4, 7) * scen.pf;
    var offP = (sum(K.P, 8, 11) + sum(K.P, 0, 3)) * scen.pf;
    var baseStore = Math.min(130, offP * 0.45 * S.store);
    var tmax = K.tmaxJul + scen.dt, sat = heatSum(K, scen.dt);
    var etMult = 1 + 0.04 * scen.dt;

    var soilIdx = S.start;
    field.hist.forEach(function (h) {
      var g = (CROPS[h] || CROPS.wheat).grp;
      soilIdx += g === "small" ? -3 : g === "break" ? 2 : -2;
    });
    var soil0 = Math.round(soilIdx);

    var prev = field.hist[1];
    var carry = prev === "fallow" ? seasonP * 0.35 : 0;
    var years = [], totMargin = 0, totDef = 0, nCrop = 0, irrTot = 0;

    for (var y = 0; y < strategy.length; y++) {
      var key = strategy[y], c = CROPS[key], notes = [];
      var rain = Math.max(0, seasonP * 0.75 + baseStore + carry);
      var res = { crop: key, yield: 0, tons: 0, margin: -c.cost, deficit: 0, irrig: 0, notes: notes };

      if (key === "fallow") {
        soilIdx += c.soil;
        carry = seasonP * 0.35;
        notes.push("пар накапливает влагу");
      } else {
        var need = c.need * etMult, avail = rain, irr = 0, it = irrType(field);
        if (it !== "none") {
          var quota = (it === "canal" ? (c.irrOnly ? 1300 : 500) : 350) * scen.pf;   // в засуху воды в реках тоже меньше
          irr = Math.min(quota, Math.max(0, need - rain));
          avail += irr;
        }
        var def = Math.max(0, 1 - avail / need);
        var yr;
        if (c.irrOnly && !riceOk(field)) { yr = 0; def = 1; irr = 0; notes.push("культура не подходит для этого поля"); }
        else {
          yr = Math.max(0.05, 1 - c.ky * def);
          if (c.irrOnly) yr *= RICE_SOIL[field.soil] || 0.7;
          var heat = Math.max(0, tmax - c.thr);
          if (heat > 0) { yr *= Math.max(0.3, 1 - (c.heatSens || 0.06) * heat); notes.push("жара выше порога культуры"); }
          if (c.sat && sat < c.sat) { yr *= Math.max(0.2, 1 - (c.sat - sat) / 600); notes.push("мало тепла для созревания: сумма активных температур " + sat + " из " + c.sat + " °C"); }
          var lvl = cropLevel(field, key);
          if (lvl === 1) { yr *= 0.9; notes.push("в области эту культуру выращивают мало"); }
          if (lvl === 0) { yr *= 0.6; notes.push("в области эту культуру почти не выращивают"); }
          var pg = (CROPS[prev] || {}).grp;
          if (prev === key) {
            yr *= key === "rice" ? 0.95 : key === "buckwheat" ? 0.85 : 0.88;
            soilIdx -= key === "rice" ? 1 : 3;
            notes.push("повтор культуры");
          } else if (c.grp === "small" && pg === "small") {
            if (!(prev === "oats" && key === "wheat")) { yr *= 0.94; soilIdx -= 2; notes.push("колосовые по колосовым"); }
          }
          var prev2 = y >= 2 ? strategy[y - 2] : y === 1 ? field.hist[1] : field.hist[0];
          if (c.gap && prev2 === key && prev !== key) { yr *= 0.88; soilIdx -= 1; notes.push("короткий возврат на поле (нужно ≥" + c.gap + " года)"); }
          if (c.grp === "small" && (pg === "break" || pg === "row" || pg === "fallow")) { yr *= 1.05; notes.push("хороший предшественник"); }
          yr *= 0.9 + 0.2 * Math.max(0, Math.min(100, soilIdx)) / 100;
          yr = Math.min(1, yr);
          if (def > 0.45) notes.push("сильный дефицит влаги");
        }
        soilIdx += c.soil;
        res.yield = yr; res.tons = Math.round(yr * c.y * 100) / 100; res.margin = yr * c.y * c.price - c.cost;
        res.deficit = def; res.irrig = Math.round(irr);
        totDef += def; irrTot += irr; nCrop++;
        carry = 0;
      }
      soilIdx = Math.max(0, Math.min(100, soilIdx));
      res.soil = Math.round(soilIdx);
      totMargin += res.margin;
      years.push(res);
      prev = key;
    }
    var grps = {};
    strategy.forEach(function (k) { if (k !== "fallow") grps[CROPS[k].grp] = 1; });
    if (Object.keys(grps).length >= 3) soilIdx = Math.min(100, soilIdx + 4);

    return {
      years: years,
      margin: totMargin / strategy.length,                 // средняя маржа за год, тг/га
      deficit: nCrop ? totDef / nCrop : 0,                 // средний дефицит влаги, доля
      irrig: irrTot / strategy.length,                     // средний полив, мм/год
      soil: Math.round(soilIdx), soil0: soil0              // индекс почвы 0–100 в начале и в конце
    };
  }

  function clamp(x) { return Math.max(0, Math.min(100, x)); }

  // Перевод показателей в баллы 0–100:
  //  доход: маржа 0 тг/га = 50 баллов, +200 тыс. тг/га = 100, −200 тыс. = 0;
  //  вода: 100 − дефицит влаги, % − полив/20 (1 000 мм полива = −50);
  //  почва: индекс почвы в конце ротации;
  //  риск: 100 − потеря маржи по сравнению с обычным годом / 2 тыс. тг/га (потеря 100 тыс. = 50 баллов).
  // w = { income, water, soil, risk } — важность 0–100.
  function stressTest(strategy, field, opt, w) {
    var sc = scenarios(opt);
    var r = sc.map(function (s) { return run(strategy, field, s); });
    var wsum = (w.water + w.soil + w.income + w.risk) || 1;
    var cells = r.map(function (x, i) {
      var loss = i === 0 ? 0 : Math.max(0, r[0].margin - x.margin);
      var incomeS = clamp(50 + x.margin / 4000);
      var waterS = clamp((1 - x.deficit) * 100 - x.irrig / 20);
      var soilS = clamp(x.soil);
      var riskS = Math.min(clamp(100 - loss / 2000), clamp(60 + x.margin / 2500));
      var score = (w.income * incomeS + w.water * waterS + w.soil * soilS + w.risk * riskS) / wsum;
      return { scen: sc[i], res: x, loss: loss, incomeS: incomeS, waterS: waterS, soilS: soilS, riskS: riskS, score: score };
    });
    var total = 0.25 * cells[0].score + 0.375 * cells[1].score + 0.375 * cells[2].score;
    // Если какая-то культура в обычный год не даёт урожая (невозможна здесь), стратегия считается провальной.
    if (r[0].years.some(function (y) { return y.crop !== "fallow" && y.yield === 0; })) total = Math.min(total, 30);
    return { strategy: strategy.slice(), cells: cells, total: total };
  }

  // Агроправила: не больше одного пара, рис только при орошении, без повтора культуры подряд (кроме риса),
  // и каждая культура из списка «хочу выращивать» есть в стратегии хотя бы раз.
  function agroCheck(st, field, want) {
    if (!Array.isArray(st) || st.length !== 4) return "нужно ровно 4 года";
    var fal = 0, prev = field.hist[1];
    for (var i = 0; i < 4; i++) {
      var k = st[i];
      if (!CROPS[k]) return "неизвестная культура: " + k;
      if (k === "fallow") fal++;
      if (CROPS[k].irrOnly && !riceOk(field)) return "культура «" + CROPS[k].name + "» не подходит для этого поля";
      if (k === prev && k !== "rice") return "повтор культуры подряд: " + CROPS[k].name;
      prev = k;
    }
    if (fal > 1) return "больше одного года пара";
    var wantSet = {}; (want || []).forEach(function (k) { wantSet[k] = 1; });
    for (var j = 0; j < 4; j++) {
      if (st[j] !== "fallow" && cropLevel(field, st[j]) === 0 && !wantSet[st[j]]) return "культуру «" + CROPS[st[j]].name + "» в этой области почти не выращивают";
    }
    var main = st.filter(function (k) { return k !== "fallow" && cropLevel(field, k) === 2; }).length;
    if (main < 2) return "нужно хотя бы 2 года основных культур области: " + mainCrops(field).map(function (k) { return CROPS[k].name; }).join(", ");
    var miss = (want || []).filter(function (k) { return st.indexOf(k) < 0; });
    if (miss.length) return "нет культуры, которую хочет фермер: " + miss.map(function (k) { return CROPS[k].name; }).join(", ");
    return "";
  }

  function mainCrops(field) { return CROP_KEYS.filter(function (k) { return k !== "fallow" && cropLevel(field, k) === 2; }); }

  // Подходит ли культура полю: уровень районирования и хватает ли тепла.
  function cropSuit(field, k) {
    var K = climateOf(field), sat = heatSum(K, 0), c = CROPS[k];
    return { level: cropLevel(field, k), sat: sat, need: c.sat || 0, warm: !c.sat || sat >= c.sat, rice: !c.irrOnly || riceOk(field) };
  }

  // Проверка списка «хочу выращивать» до запуска. Возвращает текст ошибки или "".
  function wantCheck(field, want) {
    if ((want || []).some(function (k) { return CROPS[k] && CROPS[k].irrOnly; }) && !riceOk(field)) return "rice_not_possible";
    if ((want || []).length > 4) return "too_many";
    return "";
  }

  // Встроенный алгоритм без ИИ: перебор 8^4 = 4 096 вариантов, три разных профиля.
  function localPlan(field, opt, w, want) {
    var profiles = [
      { name: "Максимальная устойчивость", w: w },
      { name: "Экономия воды", w: { income: 30, water: 100, soil: 50, risk: 60 } },
      { name: "Доход", w: { income: 100, water: 30, soil: 40, risk: 40 } }
    ];
    var chosen = [], used = {};
    profiles.forEach(function (p) {
      var best = null, n = CROP_KEYS.length;
      for (var a = 0; a < n; a++) for (var b = 0; b < n; b++) for (var c = 0; c < n; c++) for (var d = 0; d < n; d++) {
        var st = [CROP_KEYS[a], CROP_KEYS[b], CROP_KEYS[c], CROP_KEYS[d]];
        if (used[st.slice().sort().join()] || agroCheck(st, field, want)) continue;
        var t = stressTest(st, field, opt, p.w);
        if (!best || t.total > best.total) best = t;
      }
      if (best) { used[best.strategy.slice().sort().join()] = 1; chosen.push({ name: p.name, crops: best.strategy, profile: chosen.length }); }
    });
    return chosen;
  }

  // Разбор файла NASA POWER (climatology или monthly) в {T, P, tmaxJul}.
  var MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function parseNasa(json) {
    var prm = json && json.properties && json.properties.parameter;
    if (!prm || !prm.T2M) throw new Error("В файле нет параметра T2M. Нужен ответ NASA POWER в формате JSON.");
    var pr = prm.PRECTOTCORR || prm.PRECTOT;
    if (!pr) throw new Error("В файле нет осадков (PRECTOTCORR).");
    function monthly(obj, isPrec) {
      var keys = Object.keys(obj);
      if (obj.JAN !== undefined) {                       // climatology: JAN..DEC, осадки мм/сут
        return MON.map(function (m, i) { var v = Number(obj[m]); return isPrec ? v * DAYS[i] : v; });
      }
      // monthly temporal: ключи YYYYMM (13 = годовое) — усредняем по годам
      var acc = MON.map(function () { return [0, 0]; });
      keys.forEach(function (k) {
        var mm = Number(k.slice(4, 6)), v = Number(obj[k]);
        if (mm >= 1 && mm <= 12 && v > -900) { acc[mm - 1][0] += isPrec ? v * DAYS[mm - 1] : v; acc[mm - 1][1]++; }
      });
      return acc.map(function (a) { return a[1] ? a[0] / a[1] : NaN; });
    }
    var T = monthly(prm.T2M, false), P = monthly(pr, true);
    if (T.some(isNaN) || P.some(isNaN)) throw new Error("Не удалось прочитать все 12 месяцев.");
    var tmax = prm.T2M_MAX ? monthly(prm.T2M_MAX, false)[6] : T[6] + 7;
    var coords = json.geometry && json.geometry.coordinates;
    return {
      T: T.map(function (v) { return Math.round(v * 10) / 10; }),
      P: P.map(function (v) { return Math.round(v); }),
      tmaxJul: Math.round(tmax * 10) / 10,
      lon: coords ? coords[0] : null, lat: coords ? coords[1] : null
    };
  }

  function apiUrl(lat, lon) {
    return "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,PRECTOTCORR&community=AG&latitude=" +
      lat + "&longitude=" + lon + "&format=JSON";
  }

  return { REGIONS: REGIONS, SOILS: SOILS, CROPS: CROPS, CROP_KEYS: CROP_KEYS, scenarios: scenarios, run: run,
    stressTest: stressTest, agroCheck: agroCheck, wantCheck: wantCheck, irrType: irrType, riceOk: riceOk, RICE_REGIONS: RICE_REGIONS, REGION_CROPS: REGION_CROPS, cropLevel: cropLevel, cropSuit: cropSuit, heatSum: heatSum, mainCrops: mainCrops, localPlan: localPlan, parseNasa: parseNasa, climateOf: climateOf, apiUrl: apiUrl };
})();

/* ===== Промпт ИИ-агронома и разбор ответа (общие для браузера и сервера) ===== */
(function () {
  var C = SS.CROPS;
  var LANG_NAME = { ru: "русском", kk: "казахском", en: "английском" };
  var ALIASES = {
    wheat: ["пшеница", "бидай", "wheat"], barley: ["ячмень", "арпа", "barley"], oats: ["овёс", "овес", "сұлы", "oats"],
    corn: ["кукуруза", "жүгері", "corn", "maize"], rice: ["рис", "күріш", "rice"], millet: ["просо", "тары", "millet"],
    buckwheat: ["гречиха", "қарақұмық", "buckwheat"], fallow: ["пар", "сүрі", "fallow"]
  };
  var MAP = {};
  Object.keys(ALIASES).forEach(function (k) { MAP[k] = k; ALIASES[k].forEach(function (a) { MAP[a] = k; }); });
  SS.toKeys = function (arr) {
    return (Array.isArray(arr) ? arr : []).map(function (x) { var s = String(x).trim().toLowerCase(); return MAP[s] || s; });
  };

  // field: {name, region, area, lat, lon, soil, irr, h0, h1}; climate: {T, P, tmaxJul, label}
  SS.buildPrompt = function (field, climate, opt, w, lang, withTools, want) {
    want = (want || []).filter(function (k) { return C[k]; });
    var R = SS.REGIONS[field.region], S = SS.SOILS[field.soil];
    var mon = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    var crops = SS.CROP_KEYS.map(function (k) {
      var c = C[k];
      if (k === "fallow") return "- fallow (Пар): год без культуры, копит влагу для следующего года, затраты 25 тыс. тг/га, почва −4/год (эрозия)";
      return "- " + k + " (" + c.name + "): вода " + c.need + " мм за сезон, Ky " + c.ky + ", жара вредит при Tmax июля > " + c.thr + " °C" +
        (c.sat ? ", нужна сумма активных температур ≥ " + c.sat + " °C" : "") + ", урожай в хороший год " + c.y + " т/га, цена " + (c.price / 1000) + " тыс. тг/т, затраты " + (c.cost / 1000) + " тыс. тг/га, почва " + (c.soil > 0 ? "+" : "") + c.soil + "/год" +
        (c.irrOnly ? ", ТОЛЬКО в рисосеющих районах при поливе по чекам из канала" : "") + (c.gap ? ", возврат на поле не раньше чем через " + c.gap + " года" : "");
    }).join("\n");
    return [
      "Ты агроном-консультант по Казахстану. Построй севооборот на 4 года для конкретного поля фермера.",
      "",
      "ПОЛЕ",
      "Название: " + field.name + "; область: " + R.name + "; площадь: " + field.area + " га; координаты: " + field.lat + ", " + field.lon,
      "Почва: " + S.name + "; полив: " + ({ none: "нет (богара)", drip: "дождевание или капельный, до 350 мм за сезон", canal: "оросительный канал с чеками" })[SS.irrType(field)] +
        "; рис здесь " + (SS.riceOk(field) ? "возможен (рисосеющий район, есть канал)" : "НЕВОЗМОЖЕН: нет рисовой оросительной системы, не предлагай рис"),
      "Культуры: 2 года назад " + C[field.h0].name + ", в прошлом году " + C[field.h1].name,
      "",
      "КЛИМАТ (" + (climate.label || "NASA POWER") + ")",
      "Средняя температура, °C: " + climate.T.map(function (v, i) { return mon[i] + " " + v; }).join(", "),
      "Осадки, мм/мес: " + climate.P.map(function (v, i) { return mon[i] + " " + v; }).join(", "),
      "Средняя Tmax июля: " + climate.tmaxJul + " °C; сумма активных температур выше 10 °C: около " + SS.heatSum(climate, 0) + " °C",
      "",
      "СЦЕНАРИИ СТРЕСС-ТЕСТА: обычный климат; осадки −" + opt.dryPct + "% (воды для полива тоже меньше); температура +" + opt.heatC + " °C.",
      "ПРИОРИТЕТЫ ФЕРМЕРА (важность 0–100): доход (маржа, тг/га) " + w.income + ", экономия воды (дефицит влаги и полив) " + w.water + ", здоровье почвы (индекс 0–100) " + w.soil + ", минимальный риск (потеря маржи в засуху и жару) " + w.risk + ".",
      want.length ? "ФЕРМЕР ХОЧЕТ ВЫРАЩИВАТЬ: " + want.map(function (k) { return k + " (" + C[k].name + ")"; }).join(", ") + ". Каждая из трёх стратегий обязана включать каждую из этих культур хотя бы один раз." : "Фермер не указал обязательных культур.",
      "",
      "РАЙОНИРОВАНИЕ В ЭТОЙ ОБЛАСТИ: основные культуры — " + SS.CROP_KEYS.filter(function (k) { return k !== "fallow" && SS.cropLevel(field, k) === 2; }).join(", ") +
        "; выращивают немного — " + (SS.CROP_KEYS.filter(function (k) { return k !== "fallow" && SS.cropLevel(field, k) === 1; }).join(", ") || "нет") +
        "; почти не выращивают (не предлагай, если фермер сам не просит) — " + (SS.CROP_KEYS.filter(function (k) { return k !== "fallow" && SS.cropLevel(field, k) === 0; }).join(", ") || "нет") + ".",
      "",
      "КУЛЬТУРЫ (используй только эти ключи):",
      crops,
      "",
      "ПРАВИЛА: ровно 4 года; не больше одного пара; одна культура не повторяется два года подряд (кроме риса); рис только в рисосеющих районах (Кызылординская, Алматинская, Туркестанская обл.) при поливе по чекам из канала" + (want.length ? "; обязательные культуры фермера есть в каждой стратегии" : "") + "; минимум 2 года из 4 — основные культуры области; культуры, которые в области почти не выращивают, не предлагай.",
      "Если рис здесь возможен и в прошлые годы рос рис, рассмотри рис как основную культуру: в рисосеющих районах его чередуют с другими культурами, но не бросают.",
      "Колосовые (пшеница, ячмень, овёс) подряд теряют урожай; гречиха, просо, кукуруза и пар — хорошие предшественники для колосовых; овёс — хороший предшественник для пшеницы.",
      "",
      "ЗАДАЧА",
      "Предложи 3 разные стратегии с разной логикой (например: устойчивость к засухе и жаре, экономия воды, доход и спрос на рынке Казахстана). Учитывай регион, почву, орошение, историю поля, климат и приоритеты.",
      withTools
        ? "Проверяй варианты инструментом stress_test: он возвращает оценку 0–100 по каждому сценарию и итог. Сделай 4–8 проверок, улучшай слабые варианты. В ответ включи только проверенные стратегии, первой поставь ту, у которой итог выше."
        : "Первой поставь стратегию, которую рекомендуешь.",
      "",
      "Все тексты в ответе (name, idea, verdict, risks, actions) напиши на " + (LANG_NAME[lang] || LANG_NAME.ru) + " языке. Ключи культур оставь латиницей.",
      "Ответь только JSON такого вида:",
      '{"strategies":[{"name":"короткое название","crops":["key","key","key","key"],"idea":"одно предложение о логике"}],' +
      '"verdict":"3–4 предложения: почему первая стратегия лучшая для этого поля' + (withTools ? ", с цифрами стресс-теста" : "") + '",' +
      '"risks":["2–3 главных риска"],"actions":["3–4 конкретных агроприёма для этого поля"]}'
    ].join("\n");
  };

  SS.stressToolSpec = {
    name: "stress_test",
    description: "Проверяет севооборот на 4 года для этого поля в трёх сценариях (обычный климат, засуха, жара). Возвращает итог 0–100 и по каждому сценарию оценку, доход, дефицит воды, полив и индекс почвы. Ошибка, если нарушены правила.",
    schema: { type: "object", properties: { crops: { type: "array", items: { type: "string", enum: SS.CROP_KEYS }, description: "4 ключа культур по годам" } }, required: ["crops"] }
  };

  // Выполняет инструмент stress_test; бросает Error при нарушении правил.
  SS.runStressTool = function (input, mf, opt, w, want) {
    var crops = SS.toKeys(input && input.crops);
    var bad = SS.agroCheck(crops, mf, want);
    if (bad) throw new Error(bad);
    var t = SS.stressTest(crops, mf, opt, w);
    var notes = {};
    t.cells.forEach(function (c) { c.res.years.forEach(function (y, i) { y.notes.forEach(function (n) { notes["год " + (i + 1) + ": " + n] = 1; }); }); });
    return {
      crops: crops, total: Math.round(t.total),
      result: {
        total: Math.round(t.total),
        scenarios: t.cells.map(function (c) {
          return { scenario: c.scen.name, score: Math.round(c.score), margin_thousand_tg_per_ha_year: Math.round(c.res.margin / 1000),
            margin_loss_vs_normal_thousand_tg: Math.round(c.loss / 1000), water_deficit_pct: Math.round(c.res.deficit * 100),
            irrigation_mm_per_year: Math.round(c.res.irrig), soil_index: c.res.soil0 + "→" + c.res.soil,
            yields_t_per_ha: c.res.years.map(function (y) { return y.tons; }) };
        }),
        notes: Object.keys(notes).slice(0, 10)
      }
    };
  };

  // Достаёт первый JSON-объект из текста ответа.
  SS.extractJSON = function (text) {
    var s = String(text || ""), i = s.indexOf("{"), j = s.lastIndexOf("}");
    if (i < 0 || j <= i) return null;
    try { return JSON.parse(s.slice(i, j + 1)); } catch (e) { return null; }
  };

  // Проверяет и чистит ответ ИИ. Возвращает null, если стратегий нет.
  SS.cleanAI = function (out, mf) {
    var list = (out && Array.isArray(out.strategies) ? out.strategies : []).map(function (s) {
      return { name: String(s.name || "—").slice(0, 60), crops: SS.toKeys(s.crops).slice(0, 4), idea: String(s.idea || "").slice(0, 260) };
    }).filter(function (s) { return s.crops.length === 4 && s.crops.every(function (k) { return C[k]; }); }).slice(0, 3);
    if (!list.length) return null;
    return {
      strategies: list,
      verdict: String(out.verdict || "").slice(0, 1200),
      risks: (Array.isArray(out.risks) ? out.risks : []).map(String).slice(0, 4),
      actions: (Array.isArray(out.actions) ? out.actions : []).map(String).slice(0, 5)
    };
  };
})();
if (typeof module !== "undefined") module.exports = SS;
