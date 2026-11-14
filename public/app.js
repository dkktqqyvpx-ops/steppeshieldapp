
(function () {
  "use strict";
  var C = SS.CROPS, R = SS.REGIONS;
  var root = document.getElementById("root");
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var r0 = Math.round;
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  /* ---------- Хранилище браузера ---------- */
  var mem = {}, persistent = true;
  function sget(k) { try { var v = localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : null) : v; } catch (e) { persistent = false; return k in mem ? mem[k] : null; } }
  function sset(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { persistent = false; } }
  function sdel(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { } }
  function jget(k, d) { try { var v = sget(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { sset(k, JSON.stringify(v)); }

  /* ---------- Язык ---------- */
  var lang = (function () { var l = sget("ss_lang"); return I18N[l] ? l : "ru"; })();
  function t(k, vars) {
    var v = (I18N[lang] || I18N.ru)[k];
    if (v == null) v = I18N.ru[k];
    if (v == null) return k;
    if (vars && typeof v === "string") v = v.replace(/\{(\w+)\}/g, function (m, n) { return vars[n] != null ? vars[n] : m; });
    return v;
  }
  function crop(k) { return t("crop")[k] || k; }
  function region(k) { return (t("region")[k] || k) + t("regionSuffix"); }
  function soil(k) { return t("soil")[k] || k; }
  function setLang(l) {
    if (!I18N[l]) return;
    lang = l; sset("ss_lang", l); document.documentElement.lang = l;
    if (S.user && B) B.updateMe({ lang: l }).catch(function () { });
    route();
  }
  function langSelect() {
    return '<select class="lang" id="langSel" aria-label="Language">' + LANGS.map(function (L) {
      return '<option value="' + L[0] + '"' + (L[0] === lang ? " selected" : "") + ">" + L[1] + "</option>";
    }).join("") + "</select>";
  }
  function bindLang() { var s = $("langSel"); if (s) s.onchange = function () { setLang(this.value); }; }

  /* ---------- Пароли и телефоны ---------- */
  function normPhone(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
    if (d.length === 10) d = "7" + d;
    return d.length === 11 && d[0] === "7" ? d : "";
  }
  function fmtPhone(d) { return d ? "+7 " + d.slice(1, 4) + " " + d.slice(4, 7) + " " + d.slice(7, 9) + " " + d.slice(9, 11) : ""; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function randHex(n) { var a = new Uint8Array(n); try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); } return hex(a.buffer); }
  function sha(text) {
    try { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(hex); }
    catch (e) { var h = 5381; for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return Promise.resolve("d" + (h >>> 0).toString(16)); }
  }

  /* =========================================================
     Бэкенд: локальный (браузер) и облачный (Cloudflare)
     ========================================================= */
  function fail(code) { var e = new Error(code); e.code = code; return Promise.reject(e); }
  var Local = {
    mode: "local",
    _acc: function () { return jget("ss_accounts", {}); },
    _key: function () { return "ss_data_" + sget("ss_session"); },
    _data: function () { return jget(this._key(), { fields: [], analyses: [] }); },
    _save: function (d) { jset(this._key(), d); },
    _user: function (p, a) { return { phone: p, name: a.name, farm: a.farm, region: a.region, lang: a.lang || null, demo: !!a.demo }; },
    me: function () { var p = sget("ss_session"), a = this._acc(); return Promise.resolve(p && a[p] ? this._user(p, a[p]) : null); },
    register: function (f) {
      var self = this, a = this._acc();
      if (a[f.phone]) return fail("exists");
      var salt = randHex(12);
      return sha(salt + ":" + f.password).then(function (h) {
        a[f.phone] = { name: f.name, farm: f.farm, region: f.region, lang: lang, salt: salt, hash: h, created: Date.now(), demo: !!f.demo };
        jset("ss_accounts", a); sset("ss_session", f.phone);
        return self._user(f.phone, a[f.phone]);
      });
    },
    login: function (phone, pw) {
      var self = this, acc = this._acc()[phone];
      if (!acc) return fail("login");
      return sha(acc.salt + ":" + pw).then(function (h) {
        if (h !== acc.hash) throw Object.assign(new Error("login"), { code: "login" });
        sset("ss_session", phone); return self._user(phone, acc);
      });
    },
    logout: function () { sdel("ss_session"); return Promise.resolve(); },
    updateMe: function (p) {
      var a = this._acc(), ph = sget("ss_session"); if (!a[ph]) return fail("auth");
      ["name", "farm", "region", "lang"].forEach(function (k) { if (p[k] != null) a[ph][k] = p[k]; });
      jset("ss_accounts", a); return Promise.resolve(this._user(ph, a[ph]));
    },
    deleteMe: function () { var a = this._acc(), ph = sget("ss_session"); delete a[ph]; jset("ss_accounts", a); sdel("ss_data_" + ph); sdel("ss_session"); return Promise.resolve(); },
    fields: function () { return Promise.resolve(this._data().fields); },
    saveField: function (f) {
      var d = this._data(), i = d.fields.findIndex(function (x) { return x.id === f.id; });
      if (i >= 0) d.fields[i] = f; else d.fields.push(f);
      this._save(d); return Promise.resolve(f);
    },
    deleteField: function (id) {
      var d = this._data();
      d.fields = d.fields.filter(function (x) { return x.id !== id; });
      d.analyses = d.analyses.filter(function (x) { return x.fieldId !== id; });
      this._save(d); return Promise.resolve();
    },
    analyses: function () { return Promise.resolve(this._data().analyses); },
    saveAnalysis: function (a) {
      var d = this._data();
      d.analyses = [a].concat(d.analyses.filter(function (x) { return x.id !== a.id; })).slice(0, 50);
      this._save(d); return Promise.resolve(a);
    },
    climate: function (f) {
      if (f.nasa) return Promise.resolve(Object.assign({ source: "file" }, f.nasa));
      return Promise.resolve(Object.assign({ source: "region" }, R[f.region]));
    },
    demo: function () {
      var a = this._acc(), ph = "77000000000";
      if (!a[ph]) {
        a[ph] = { name: "Демо фермер", farm: "КХ «Жер-Ана»", region: "kos", lang: lang, salt: randHex(12), hash: randHex(32), created: Date.now(), demo: true };
        jset("ss_accounts", a);
      }
      sset("ss_session", ph);
      return Promise.resolve(this._user(ph, a[ph]));
    },
    ai: null
  };

  function api(method, path, body) {
    return fetch("/api" + path, {
      method: method, credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || "http_" + r.status); e.code = j.error || "server"; e.status = r.status; throw e; }
        return j;
      });
    });
  }
  var Cloud = {
    mode: "cloud",
    me: function () { return api("GET", "/me").then(function (j) { return j.user; }).catch(function (e) { if (e.status === 401) return null; throw e; }); },
    register: function (f) { return api("POST", "/auth/register", f).then(function (j) { return j.user; }); },
    login: function (phone, pw) { return api("POST", "/auth/login", { phone: phone, password: pw }).then(function (j) { return j.user; }); },
    logout: function () { return api("POST", "/auth/logout"); },
    updateMe: function (p) { return api("PATCH", "/me", p).then(function (j) { return j.user; }); },
    deleteMe: function () { return api("DELETE", "/me"); },
    fields: function () { return api("GET", "/fields").then(function (j) { return j.fields; }); },
    saveField: function (f) { return api("PUT", "/fields/" + encodeURIComponent(f.id), f).then(function (j) { return j.field; }); },
    deleteField: function (id) { return api("DELETE", "/fields/" + encodeURIComponent(id)); },
    analyses: function () { return api("GET", "/analyses").then(function (j) { return j.analyses; }); },
    saveAnalysis: function (a) { return api("PUT", "/analyses/" + encodeURIComponent(a.id), a).then(function (j) { return j.analysis; }); },
    climate: function (f, fresh) {
      if (f.nasa) return Promise.resolve(Object.assign({ source: "file" }, f.nasa));
      return api("GET", "/nasa?lat=" + f.lat + "&lon=" + f.lon + (fresh ? "&fresh=1" : ""))
        .then(function (j) { return Object.assign({ source: "live" }, j.climate); })
        .catch(function () { return Object.assign({ source: "region", failed: true }, R[f.region]); });
    },
    demo: function () { return api("POST", "/auth/demo").then(function (j) { return j.user; }); },
    soil: function (lat, lon) { return api("GET", "/soil?lat=" + lat + "&lon=" + lon); },
    ai: function (payload) { return api("POST", "/ai", payload); }
  };

  function detect() {
    return new Promise(function (res) {
      var done = false;
      var tm = setTimeout(function () { done = true; res(Local); }, 2500);
      try {
        fetch("/api/health", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (done) return; clearTimeout(tm); res(j && j.ok && j.app === "steppeshield" ? Cloud : Local);
        }).catch(function () { if (!done) { clearTimeout(tm); res(Local); } });
      } catch (e) { clearTimeout(tm); res(Local); }
    });
  }

  /* ---------- Claude внутри превью (режим local) ---------- */
  var AI = { sample: null, tools: false, checked: false };
  function initSample() {
    try {
      if (!(window.claude && window.claude.use)) { AI.checked = true; return; }
      window.claude.use("sample").then(function (s) {
        AI.sample = s;
        var after = function () { AI.checked = true; var el = $("aiStatus"); if (el) el.innerHTML = aiStatusHtml(); };
        if (s && s.limits) s.limits().then(function (l) { AI.tools = !!(l && l.tools); after(); }).catch(after); else after();
      }).catch(function () { AI.checked = true; });
    } catch (e) { AI.checked = true; }
  }
  function aiAvailable() { return B && B.mode === "cloud" ? true : !!AI.sample; }
  function aiStatusHtml() {
    if (B && B.mode === "cloud") return '<span class="dot"></span>' + t("ai.on");
    if (AI.sample) return '<span class="dot"></span>' + t("ai.on");
    if (!AI.checked) return '<span class="spin"></span>' + t("ai.checking");
    return '<span class="dot off"></span>' + t("ai.off");
  }

  /* =========================================================
     Состояние
     ========================================================= */
  var B = null;
  var S = {
    user: null, fields: [], analyses: [], fieldEdit: null, confirm: null, authTab: "login", busy: false,
    an: { fieldId: null, step: 1, tab: "rec", w: { income: 50, water: 50, soil: 50, risk: 75 }, opt: { dryPct: 25, heatC: 2 }, want: [],
      result: null, running: false, ctl: null, log: [], edit: {} },
    clim: { fieldId: null, cache: {}, msg: "" }
  };
  function getField(id) { return S.fields.filter(function (f) { return f.id === id; })[0] || null; }
  function loadAll() {
    return Promise.all([B.fields(), B.analyses()]).then(function (r) { S.fields = r[0] || []; S.analyses = r[1] || []; });
  }
  function climKey(f) { return f.id + ":" + f.lat + ":" + f.lon + ":" + (f.nasa ? "file" : ""); }
  function getClimate(f, fresh) {
    var k = climKey(f);
    if (!fresh && S.clim.cache[k]) return Promise.resolve(S.clim.cache[k]);
    return B.climate(f, fresh).then(function (c) { S.clim.cache[k] = c; return c; });
  }
  function modelField(f, clim) {
    var it = SS.irrType(f);
    return { region: f.region, soil: f.soil, irr: it !== "none", irrType: it, hist: [f.h0, f.h1], nasa: clim && clim.source !== "region" ? clim : null };
  }
  function cachedClimate(f) { return S.clim.cache[climKey(f)] || null; }

  function toast(m) {
    var el = $("toast"); el.textContent = m; el.hidden = false;
    clearTimeout(toast.tm); toast.tm = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* =========================================================
     Маршрутизация
     ========================================================= */
  var APP_PAGES = { fields: 1, analysis: 1, data: 1, profile: 1 };
  function route() {
    var r = (location.hash || "#home").slice(1) || "home";
    if (APP_PAGES[r] && !S.user) { location.hash = "#home"; return; }
    document.body.classList.toggle("app-mode", !!APP_PAGES[r]);
    if (APP_PAGES[r]) vApp(r);
    else vHome();
  }
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); });

  /* =========================================================
     Главная: заголовок, вход/регистрация, карта Казахстана
     ========================================================= */
  var LOGO = '<svg class="logo" viewBox="0 0 210 128" aria-hidden="true"><rect width="210" height="128" rx="64" fill="#173D2D"/>' +
    '<path d="M63.4 95.1 Q76 25.8 146.4 27.1 Z" fill="#F4EEE3"/><path d="M66.6 98.9 Q137 100.2 149.6 30.9 Z" fill="#EFA637"/></svg>';
  function landHeader() {
    return '<header class="hdr land-hdr"><div class="wrap gutter"><a class="brand" href="#home">' + LOGO + '<span>STEPPESHIELD</span></a><div class="right">' + langSelect() + "</div></div></header>";
  }

  // Иллюстрация на главной: степь, солнце, ряды поля и ключевые цифры проекта.
  function heroArt() {
    var stats = [["12", "home.k1"], ["7", "home.k2"], ["3", "home.k3"]];
    return '<div class="hero-art"><div class="hero-stats">' + stats.map(function (x) {
      return '<div><b>' + x[0] + "</b><span>" + t(x[1]) + "</span></div>";
    }).join("") + '</div><div class="hero-src">' + t("home.k4") + "</div>" +
      '<svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<circle cx="455" cy="118" r="52" fill="#EFA637"/>' +
      '<path d="M0 205 C120 160 230 175 330 190 C430 205 520 160 600 170 V300 H0 Z" fill="#2D6A4F"/>' +
      '<path d="M0 240 C150 205 300 215 420 228 C500 236 560 222 600 214 V300 H0 Z" fill="#40916C"/>' +
      '<path d="M0 262 C200 240 400 246 600 252 V300 H0 Z" fill="#EFA637" fill-opacity=".9"/>' +
      '<g stroke="#F4EEE3" stroke-opacity=".55" stroke-width="2" fill="none">' +
      '<path d="M0 278 C200 260 400 266 600 272"/><path d="M0 292 C200 276 400 282 600 288"/></g></svg></div>';
  }

  function authCard() {
    if (S.user) {
      return '<div class="card auth-card"><div class="row"><a class="btn primary lg" href="#fields">' + t("home.open") + '</a><button class="btn lg" type="button" id="outBtn">' + t("btn.logout") + "</button></div></div>";
    }
    var reg = S.authTab === "reg";
    return '<div class="card auth-card">' +
      '<div class="seg" role="tablist"><button type="button" role="tab" id="tL" aria-selected="' + !reg + '">' + t("auth.login") + '</button><button type="button" role="tab" id="tR" aria-selected="' + reg + '">' + t("auth.reg") + "</button></div>" +
      (reg ?
        '<form id="authF" class="form" novalidate>' +
        '<label class="field full"><span>' + t("auth.name") + '</span><input type="text" id="aName" autocomplete="name"></label>' +
        '<label class="field full"><span>' + t("auth.farm") + '</span><input type="text" id="aFarm"></label>' +
        '<label class="field"><span>' + t("auth.phone") + '</span><input type="tel" id="aPhone" autocomplete="tel" placeholder="+7 701 123 45 67"></label>' +
        '<label class="field"><span>' + t("auth.region") + '</span><select id="aRegion">' + regionOpts("akm") + "</select></label>" +
        '<label class="field"><span>' + t("auth.pw") + '</span><input type="password" id="aPw" autocomplete="new-password" placeholder="' + t("auth.pwHint") + '"></label>' +
        '<label class="field"><span>' + t("auth.pw2") + '</span><input type="password" id="aPw2" autocomplete="new-password"></label>' +
        '<div class="err full" id="aErr"></div><button class="btn primary lg full" type="submit">' + t("btn.createAcc") + "</button></form>"
        :
        '<form id="authF" class="form" novalidate>' +
        '<label class="field full"><span>' + t("auth.phone") + '</span><input type="tel" id="aPhone" autocomplete="tel" placeholder="+7 701 123 45 67"></label>' +
        '<label class="field full"><span>' + t("auth.pw") + '</span><input type="password" id="aPw" autocomplete="current-password"></label>' +
        '<div class="err full" id="aErr"></div><button class="btn primary lg full" type="submit">' + t("btn.login") + "</button></form>") +
      '<button class="btn" type="button" id="demoBtn">' + t("auth.demo") + "</button>" +
      '<p class="note">' + t(B.mode === "cloud" ? "auth.noteCloud" : "auth.noteLocal") + "</p></div>";
  }
  function bindAuth() {
    if ($("outBtn")) $("outBtn").onclick = logout;
    if (!$("authF")) return;
    var reg = S.authTab === "reg";
    var rerender = function () { var box = $("authBox"); box.innerHTML = authCard(); bindAuth(); };
    $("tL").onclick = function () { S.authTab = "login"; rerender(); };
    $("tR").onclick = function () { S.authTab = "reg"; rerender(); };
    $("demoBtn").onclick = demoLogin;
    var err = function (m) { $("aErr").textContent = m; };
    var errCode = function (e) { var c = e && e.code; err(t(c === "exists" ? "err.exists" : c === "login" ? "err.login" : "err.server")); };
    $("authF").onsubmit = function (e) {
      e.preventDefault();
      if (S.busy) return;
      var phone = normPhone($("aPhone").value), pw = $("aPw").value;
      if (reg) {
        var f = { name: $("aName").value.trim(), farm: $("aFarm").value.trim(), phone: phone, region: $("aRegion").value, password: pw, lang: lang };
        if (f.name.length < 3) return err(t("err.name"));
        if (!phone) return err(t("err.phone"));
        if (pw.length < 6) return err(t("err.pw"));
        if (pw !== $("aPw2").value) return err(t("err.pw2"));
        S.busy = true;
        B.register(f).then(afterLogin).then(function () { toast(t("toast.welcome")); }).catch(errCode).then(function () { S.busy = false; });
      } else {
        if (!phone) return err(t("err.phone"));
        S.busy = true;
        B.login(phone, pw).then(afterLogin).catch(errCode).then(function () { S.busy = false; });
      }
    };
  }
  function vHome() {
    root.innerHTML = landHeader() +
      '<main><div class="gutter"><div class="wrap hero"><div class="hero-l"><h1>' + esc(t("home.title")) + '</h1><div id="authBox">' + authCard() + "</div></div>" +
      heroArt() + "</div></div>" +
      '<div class="gutter"><div class="wrap sect"><h2>' + t("home.how") + '</h2><div class="steps">' +
      [1, 2, 3].map(function (i) { return '<div><span class="k">' + i + "</span><h3>" + t("home.s" + i + "t") + "</h3><p>" + t("home.s" + i) + "</p></div>"; }).join("") +
      "</div></div></div>" +
      '<div class="gutter"><div class="wrap sect"><h2>' + t("home.uses") + '</h2><ul class="uses">' +
      [1, 2, 3, 4, 5].map(function (i) { return "<li>" + t("home.u" + i) + "</li>"; }).join("") + "</ul></div></div>" +
      '<div class="gutter"><div class="wrap foot">STEPPESHIELD, 2026</div></div></main>';
    bindLang();
    bindAuth();
  }

  function afterLogin(user) {
    S.user = user;
    if (user.lang && I18N[user.lang] && !sget("ss_lang")) { lang = user.lang; document.documentElement.lang = lang; }
    return loadAll().then(function () { location.hash = "#fields"; route(); });
  }
  function demoLogin() {
    if (S.busy) return;
    S.busy = true;
    var seed = function () {
      if (S.fields.length) return Promise.resolve();
      var list = [
        { id: uid(), name: "Северное поле", region: "kos", area: 420, soil: "chern_s", irr: false, irrType: "none", lat: 53.21, lon: 63.62, h0: "wheat", h1: "wheat" },
        { id: uid(), name: "Участок у Иртыша", region: "pav", area: 180, soil: "dkash", irr: false, irrType: "none", lat: 52.29, lon: 76.97, h0: "barley", h1: "wheat" },
        { id: uid(), name: "Поле у Сырдарьи", region: "kyz", area: 60, soil: "allu", irr: true, irrType: "canal", lat: 44.85, lon: 65.51, h0: "rice", h1: "rice" }
      ];
      return list.reduce(function (p, f) { return p.then(function () { return B.saveField(f); }); }, Promise.resolve()).then(loadAll);
    };
    B.demo().then(function (u) { S.user = u; return loadAll(); }).then(seed).then(function () {
      S.busy = false; location.hash = "#fields"; route();
    }).catch(function () { S.busy = false; toast(t("err.server")); });
  }
  function logout() {
    B.logout().catch(function () { }).then(function () {
      S.user = null; S.fields = []; S.analyses = []; S.an.result = null; S.an.step = 1; S.clim.cache = {};
      location.hash = "#home";
      route();
    });
  }

  /* =========================================================
     Каркас кабинета
     ========================================================= */
  var NAV = [["fields", "nav.fields", "i-fields"], ["analysis", "nav.analysis", "i-analysis"], ["data", "nav.data", "i-climate"], ["profile", "nav.profile", "i-profile"]];
  function vApp(page) {
    var tabs = function (icons) {
      return NAV.map(function (n) {
        return '<a href="#' + n[0] + '"' + (n[0] === page ? ' aria-current="page"' : "") + ">" +
          (icons ? '<svg aria-hidden="true"><use href="#' + n[2] + '"/></svg>' : "") + "<span>" + t(n[1]) + "</span></a>";
      }).join("");
    };
    root.innerHTML =
      '<header class="hdr"><div class="wrap gutter"><a class="brand" href="#home">' + LOGO + '<span>STEPPESHIELD</span></a>' +
      '<nav class="tabs" aria-label="Menu">' + tabs(false) + "</nav>" +
      '<div class="right">' + langSelect() + '<span class="user">' + esc(S.user.name) + "</span></div></div></header>" +
      '<main class="page gutter"><div class="wrap" id="page"></div></main>' +
      '<nav class="tabbar" aria-label="Menu">' + tabs(true) + "</nav>";
    bindLang();
    ({ fields: pFields, analysis: pAnalysis, data: pClimate, profile: pProfile })[page]();
  }
  function P(html) {
    var pre = (B.mode === "local" && (S.user.demo || !persistent)) ? '<div class="banner">' + t("mode.local") + "</div>" : "";
    $("page").innerHTML = pre + html;
  }
  function regionOpts(v) { return Object.keys(R).map(function (k) { return '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + esc(t("region")[k]) + "</option>"; }).join(""); }
  function soilOpts(v) { return Object.keys(SS.SOILS).map(function (k) { return '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + esc(soil(k)) + "</option>"; }).join(""); }
  function cropOpts(v, noRice) {
    return SS.CROP_KEYS.filter(function (k) { return !(noRice && k === "rice" && v !== "rice"); })
      .map(function (k) { return '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + esc(crop(k)) + "</option>"; }).join("");
  }
  function fieldOpts(v) { return S.fields.map(function (f) { return '<option value="' + f.id + '"' + (f.id === v ? " selected" : "") + ">" + esc(f.name) + " · " + esc(region(f.region)) + "</option>"; }).join(""); }
  function defIrr(rg) { return R[rg].irr ? (SS.RICE_REGIONS[rg] ? "canal" : "drip") : "none"; }
  function waterPill(f) { var it = SS.irrType(f); return '<span class="pill' + (it === "none" ? "" : " acc") + '">' + t("water." + it) + "</span>"; }
  function scoreCls(v) { return v >= 70 ? "g" : v >= 55 ? "y" : "r"; }
  function fmtDate(ts) { var d = new Date(ts), p = function (n) { return ("0" + n).slice(-2); }; return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear(); }
  function num(n) { try { return Number(n).toLocaleString(lang === "en" ? "en-US" : "ru-RU"); } catch (e) { return String(n); } }
  function emptyNeedField(title) {
    P('<div class="ph"><div><h1>' + title + '</h1></div></div><div class="card empty"><p>' + t("an.needField") + '</p><button class="btn primary" id="addF">' + t("btn.addField") + "</button></div>");
    $("addF").onclick = function () { S.fieldEdit = "new"; location.hash = "#fields"; };
  }

  /* =========================================================
     Мои поля (сводка + управление полями + история)
     ========================================================= */
  function lastAnalysis(fid) { return S.analyses.filter(function (a) { return a.fieldId === fid; })[0] || null; }
  function pFields() {
    if (S.fieldEdit) return pFieldForm();
    var area = S.fields.reduce(function (a, f) { return a + (Number(f.area) || 0); }, 0);
    var h = '<div class="ph"><div><h1>' + t("nav.fields") + "</h1><p>" + t("fields.sub") + '</p></div><button class="btn primary" id="addF">' + t("btn.addField") + "</button></div>";
    h += '<div class="stats"><div class="stat"><div class="label">' + t("fields.count") + '</div><div class="kpi-v">' + S.fields.length + '</div></div>' +
      '<div class="stat"><div class="label">' + t("fields.area") + '</div><div class="kpi-v">' + num(area) + '</div></div>' +
      '<div class="stat"><div class="label">' + t("fields.analyses") + '</div><div class="kpi-v">' + S.analyses.length + "</div></div></div>";
    if (!S.fields.length) {
      h += '<div class="card empty"><h2>' + t("fields.emptyT") + "</h2><p>" + t("fields.empty") + '</p><button class="btn primary" id="addF2">' + t("btn.addField") + "</button></div>";
    } else {
      h += '<div class="card" style="padding:6px 8px"><div class="tbl-wrap"><table class="t"><thead><tr><th>' + t("col.name") + "</th><th>" + t("col.region") + "</th><th>" + t("col.area") + "</th><th>" +
        t("col.soil") + "</th><th>" + t("col.water") + "</th><th>" + t("col.last") + "</th><th></th></tr></thead><tbody>" +
        S.fields.map(function (f) {
          var la = lastAnalysis(f.id);
          return '<tr><td class="name"><b>' + esc(f.name) + '</b><span class="muted small">' + esc(crop(f.h0)) + " → " + esc(crop(f.h1)) + "</span></td>" +
            '<td data-l="' + t("col.region") + '">' + esc(region(f.region)) + "</td>" +
            '<td data-l="' + t("col.area") + '">' + num(f.area) + " " + t("unit.ha") + "</td>" +
            '<td data-l="' + t("col.soil") + '">' + esc(soil(f.soil)) + "</td>" +
            '<td data-l="' + t("col.water") + '">' + waterPill(f) + "</td>" +
            '<td data-l="' + t("col.last") + '">' + (la ? '<span class="pill ' + scoreCls(la.bestScore || 0) + '">' + r0(la.bestScore || 0) + "</span> " + '<span class="muted small">' + fmtDate(la.date) + "</span>" : '<span class="muted small">' + t("fields.never") + "</span>") + "</td>" +
            '<td class="acts"><button class="btn primary sm" data-an="' + f.id + '">' + t("btn.analyze") + '</button><button class="btn sm" data-cl="' + f.id + '">' + t("btn.climate") + '</button><button class="btn sm" data-ed="' + f.id + '">' + t("btn.edit") + "</button></td></tr>";
        }).join("") + "</tbody></table></div></div>";
    }
    h += '<div class="card"><div class="card-h"><h2>' + t("fields.history") + "</h2></div>";
    if (!S.analyses.length) h += '<p class="muted small">' + t("fields.historyEmpty") + "</p>";
    else h += '<div class="list">' + S.analyses.slice(0, 10).map(function (a) {
      return '<div class="it"><div><b>' + esc(a.fieldName) + "</b> · " + esc(a.best || "") + '<div class="muted small">' + fmtDate(a.date) + " · " + t(a.source === "ai" ? "src.ai" : "src.local") + " · " + t("res.score") + " " + r0(a.bestScore || 0) + "</div></div>" +
        '<button class="btn sm" data-open="' + a.id + '">' + t("btn.open") + "</button></div>";
    }).join("") + "</div>";
    h += "</div>";
    P(h);
    $("addF").onclick = function () { S.fieldEdit = "new"; pFields(); };
    if ($("addF2")) $("addF2").onclick = $("addF").onclick;
    qa("[data-an]").forEach(function (b) { b.onclick = function () { if (S.an.fieldId !== b.dataset.an) { S.an.result = null; S.an.step = 1; } S.an.fieldId = b.dataset.an; location.hash = "#analysis"; }; });
    qa("[data-cl]").forEach(function (b) { b.onclick = function () { S.clim.fieldId = b.dataset.cl; location.hash = "#data"; }; });
    qa("[data-ed]").forEach(function (b) { b.onclick = function () { S.fieldEdit = b.dataset.ed; pFields(); window.scrollTo(0, 0); }; });
    qa("[data-open]").forEach(function (b) {
      b.onclick = function () {
        var a = S.analyses.filter(function (x) { return x.id === b.dataset.open; })[0]; if (!a) return;
        S.an.result = clone(a); S.an.result.saved = true; S.an.edit = {}; S.an.fieldId = a.fieldId;
        S.an.w = Object.assign({}, a.w); S.an.opt = Object.assign({}, a.opt); S.an.step = 2; S.an.tab = "rec";
        location.hash = "#analysis";
      };
    });
  }

  function pFieldForm() {
    var isNew = S.fieldEdit === "new", f = isNew ? null : getField(S.fieldEdit);
    if (!isNew && !f) { S.fieldEdit = null; return pFields(); }
    if (!f) { var rg = S.user.region && R[S.user.region] ? S.user.region : "akm", RR = R[rg]; f = { name: "", region: rg, area: "", soil: RR.soil, irr: RR.irr, irrType: defIrr(rg), lat: RR.lat, lon: RR.lon, h0: "wheat", h1: "wheat" }; }
    P('<div><button class="btn link" id="back">← ' + t("btn.back") + "</button></div>" +
      '<div class="ph"><div><h1>' + t(isNew ? "fields.newT" : "fields.editT") + "</h1></div></div>" +
      '<form class="card stack" id="fF" novalidate><div class="form">' +
      '<label class="field"><span>' + t("f.name") + '</span><input type="text" id="fName" value="' + esc(f.name) + '" placeholder="' + esc(t("f.namePh")) + '"></label>' +
      '<label class="field"><span>' + t("f.area") + '</span><input type="number" id="fArea" min="1" step="1" value="' + esc(f.area) + '"></label>' +
      '<label class="field"><span>' + t("f.region") + '</span><select id="fRegion">' + regionOpts(f.region) + "</select></label>" +
      '<label class="field"><span>' + t("f.soil") + '</span><select id="fSoil">' + soilOpts(f.soil) + "</select><small id=\"soilMsg\">" + t("f.soilHint") + "</small>" +
      (B.mode === "cloud" ? '<button type="button" class="btn link small" id="soilAuto" style="align-self:flex-start">' + t("f.soilAuto") + "</button>" : "") + "</label>" +
      '<label class="field"><span>' + t("f.lat") + '</span><input type="number" id="fLat" step="0.01" value="' + esc(f.lat) + '"></label>' +
      '<label class="field"><span>' + t("f.lon") + '</span><input type="number" id="fLon" step="0.01" value="' + esc(f.lon) + '"><small>' + t("f.coordHint") + "</small></label>" +
      '<label class="field"><span>' + t("f.h0") + '</span><select id="fH0">' + cropOpts(f.h0) + "</select></label>" +
      '<label class="field"><span>' + t("f.h1") + '</span><select id="fH1">' + cropOpts(f.h1) + "</select></label>" +
      '<label class="field full"><span>' + t("f.irrType") + '</span><select id="fIrr">' + ["none", "drip", "canal"].map(function (v) { return '<option value="' + v + '"' + (SS.irrType(f) === v ? " selected" : "") + ">" + t("irr." + v) + "</option>"; }).join("") +
      "</select></label>" +
      '</div><div class="err" id="fErr"></div>' +
      (S.confirm === "delField" ? '<div class="confirm">' + t("confirm.delField") + '<button type="button" class="btn danger sm" id="fDelY">' + t("btn.delete") + '</button><button type="button" class="btn sm" id="fDelN">' + t("btn.cancel") + "</button></div>" : "") +
      '<div class="row"><button class="btn primary" type="submit">' + t("btn.save") + '</button><button class="btn" type="button" id="fCancel">' + t("btn.cancel") + '</button><span class="sp"></span>' +
      (isNew ? "" : '<button class="btn danger" type="button" id="fDel">' + t("btn.delete") + "</button>") + "</div></form>");
    var close = function () { S.fieldEdit = null; S.confirm = null; pFields(); };
    $("back").onclick = close; $("fCancel").onclick = close;
    $("fRegion").onchange = function () { var RR = R[this.value]; $("fSoil").value = RR.soil; $("fIrr").value = defIrr(this.value); $("fLat").value = RR.lat; $("fLon").value = RR.lon; };
    if ($("soilAuto")) $("soilAuto").onclick = function () {
      var btn = this; btn.disabled = true;
      B.soil(Number($("fLat").value), Number($("fLon").value)).then(function (j) {
        if (j.soil && SS.SOILS[j.soil]) { $("fSoil").value = j.soil; $("soilMsg").textContent = t("f.soilFound", { c: j.wrb || soil(j.soil) }); }
        else $("soilMsg").textContent = t("f.soilFail");
      }).catch(function () { $("soilMsg").textContent = t("f.soilFail"); }).then(function () { btn.disabled = false; });
    };
    if ($("fDel")) $("fDel").onclick = function () { S.confirm = "delField"; pFieldForm(); };
    if ($("fDelN")) $("fDelN").onclick = function () { S.confirm = null; pFieldForm(); };
    if ($("fDelY")) $("fDelY").onclick = function () {
      var id = S.fieldEdit;
      B.deleteField(id).then(loadAll).then(function () {
        if (S.an.fieldId === id) { S.an.fieldId = null; S.an.result = null; S.an.step = 1; }
        toast(t("toast.fieldDeleted")); close();
      }).catch(function () { toast(t("err.server")); });
    };
    $("fF").onsubmit = function (e) {
      e.preventDefault();
      var name = $("fName").value.trim(), area = Number($("fArea").value), lat = Number($("fLat").value), lon = Number($("fLon").value);
      if (name.length < 2) return ($("fErr").textContent = t("err.fname"));
      if (!(area > 0)) return ($("fErr").textContent = t("err.farea"));
      if (!(lat > 40 && lat < 56 && lon > 46 && lon < 88)) return ($("fErr").textContent = t("err.coords"));
      var id = isNew ? uid() : S.fieldEdit, old = getField(id);
      var nf = { id: id, name: name, area: area, region: $("fRegion").value, soil: $("fSoil").value, irrType: $("fIrr").value, irr: $("fIrr").value !== "none", lat: lat, lon: lon, h0: $("fH0").value, h1: $("fH1").value };
      if (old && old.nasa && Math.abs(old.lat - lat) < 0.05 && Math.abs(old.lon - lon) < 0.05) nf.nasa = old.nasa;
      B.saveField(nf).then(loadAll).then(function () {
        if (S.an.fieldId === id) { S.an.result = null; S.an.step = 1; }
        toast(t("toast.fieldSaved")); close();
      }).catch(function () { $("fErr").textContent = t("err.server"); });
    };
  }

  /* =========================================================
     Анализ
     ========================================================= */
  var PRIO = ["income", "water", "soil", "risk"];
  function pAnalysis() {
    if (!S.fields.length) return emptyNeedField(t("nav.analysis"));
    var A = S.an;
    if (!A.fieldId || !getField(A.fieldId)) A.fieldId = S.fields[0].id;
    var hasRes = !!(A.result && A.result.fieldId === A.fieldId);
    if (A.step === 2 && !hasRes && !A.running) A.step = 1;
    var h = '<div class="ph"><div><h1>' + t("nav.analysis") + "</h1><p>" + t("an.sub") + "</p></div></div>" +
      '<div><div class="seg" role="tablist"><button type="button" role="tab" id="st1" aria-selected="' + (A.step === 1) + '"><span class="n">1</span>' + t("an.step1") + "</button>" +
      '<button type="button" role="tab" id="st2" aria-selected="' + (A.step === 2) + '"' + (hasRes || A.running ? "" : " disabled") + '><span class="n">2</span>' + t("an.step2") + "</button></div></div>" +
      '<div id="stepBody" class="stack"></div>';
    P(h);
    $("st1").onclick = function () { A.step = 1; pAnalysis(); };
    $("st2").onclick = function () { A.step = 2; pAnalysis(); };
    if (A.step === 1) stepParams(); else stepResults();
  }

  function stepParams() {
    var A = S.an, f = getField(A.fieldId);
    var sl = function (id, label, val, min, max, step, unit) {
      return '<div class="sl"><div class="t"><label for="' + id + '">' + label + '</label><span id="' + id + 'V">' + val + unit + '</span></div><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"></div>';
    };
    var lv = t("lvl");
    var prio = PRIO.map(function (k) {
      var cur = Math.round(A.w[k] / 25);
      return '<div class="prio"><div class="prio-t"><b>' + t("prio." + k) + '</b><span class="muted small">' + t("prio." + k + ".d") + '</span></div>' +
        '<div class="levels" role="radiogroup" aria-label="' + esc(t("prio." + k)) + '">' + lv.map(function (name, i) {
          return '<button type="button" role="radio" data-w="' + k + '" data-l="' + i + '" aria-checked="' + (i === cur) + '">' + esc(name) + "</button>";
        }).join("") + "</div></div>";
    }).join("");
    var mfp = modelField(f, cachedClimate(f));
    var wantErr = SS.wantCheck(mfp, A.want);
    var suit = {};
    SS.CROP_KEYS.forEach(function (k) { if (k !== "fallow") suit[k] = SS.cropSuit(mfp, k); });
    var byLvl = function (l) { return Object.keys(suit).filter(function (k) { return suit[k].level === l && suit[k].rice; }).map(crop).join(", ") || "—"; };
    var chips = Object.keys(suit).map(function (k) {
      var u = suit[k], dim = u.level === 0 || !u.warm || !u.rice;
      return '<button type="button" class="chip' + (dim ? " dim" : "") + '" data-want="' + k + '" aria-pressed="' + (A.want.indexOf(k) >= 0) + '">' + esc(crop(k)) + "</button>";
    }).join("");
    var notes = A.want.map(function (k) {
      var u = suit[k]; if (!u || !u.rice) return "";
      if (u.level === 0) return t("an.wantOff", { c: crop(k) });
      if (!u.warm) return t("an.wantCold", { c: crop(k), n: u.sat, r: u.need });
      return "";
    }).filter(Boolean);
    var zone = '<div class="zone"><div><span class="label">' + t("an.zMain") + "</span><span>" + byLvl(2) + '</span></div><div><span class="label">' + t("an.zSome") + "</span><span>" + byLvl(1) +
      '</span></div><div><span class="label">' + t("an.zNo") + "</span><span>" + byLvl(0) + '</span></div></div><p class="muted small">' + t("an.heatSum", { n: num(suit.wheat.sat) }) + "</p>";
    $("stepBody").innerHTML =
      '<div class="card"><div class="card-h"><h2>' + t("an.field") + '</h2><button class="btn link" id="toClim">' + t("nav.data") + ' →</button></div>' +
      '<div class="stack" style="gap:12px"><select id="aField" aria-label="' + t("an.field") + '">' + fieldOpts(f.id) + "</select>" +
      '<div class="facts"><span><b>' + num(f.area) + "</b> " + t("unit.ha") + "</span><span>" + esc(soil(f.soil)) + "</span><span>" + t("irr." + SS.irrType(f)) + "</span><span>" +
      esc(crop(f.h0)) + " → " + esc(crop(f.h1)) + "</span></div></div></div>" +
      '<div class="card"><div class="card-h"><h2>' + t("an.want") + '</h2></div><p class="muted small" style="margin-bottom:12px">' + t("an.wantHint") + "</p>" + zone + '<div class="chips" style="margin-top:12px">' + chips + "</div>" +
      (notes.length ? '<ul class="ul warnlist">' + notes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      '<p class="err" id="wantErr">' + (wantErr === "rice_not_possible" ? t("an.wantRice", { c: crop("rice") }) : wantErr === "too_many" ? t("an.wantMany") : "") + "</p></div>" +
      '<div class="card"><div class="card-h"><h2>' + t("an.prio") + '</h2></div><p class="muted small" style="margin-bottom:14px">' + t("an.prioHint") + '</p><div class="prios">' + prio + "</div></div>" +
      '<div class="card"><div class="card-h"><h2>' + t("an.scen") + '</h2></div><div class="sliders">' +
      sl("oDry", t("an.dry"), A.opt.dryPct, 10, 40, 5, "%") + sl("oHeat", t("an.heat"), A.opt.heatC, 1, 4, 0.5, " °C") + "</div></div>" +
      '<div class="card runbar"><div class="status" id="aiStatus">' + aiStatusHtml() + '</div><button class="btn primary lg" id="runBtn"' + (A.running || wantErr ? " disabled" : "") + ">" + t(A.result && A.result.fieldId === f.id ? "btn.rerun" : "btn.run") + "</button></div>";
    $("aField").onchange = function () { A.fieldId = this.value; A.result = null; A.log = []; A.want = []; stepParams(); pAnalysisTabs(); };
    $("toClim").onclick = function () { S.clim.fieldId = A.fieldId; location.hash = "#data"; };
    qa("[data-w]").forEach(function (b) { b.onclick = function () { A.w[b.dataset.w] = Number(b.dataset.l) * 25; qa('[data-w="' + b.dataset.w + '"]').forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); }); }; });
    qa("[data-want]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.want, i = A.want.indexOf(k);
        if (i >= 0) A.want.splice(i, 1); else A.want.push(k);
        var y = window.scrollY; stepParams(); window.scrollTo(0, y);
      };
    });
    $("oDry").oninput = function () { A.opt.dryPct = Number(this.value); $("oDryV").textContent = this.value + "%"; };
    $("oHeat").oninput = function () { A.opt.heatC = Number(this.value); $("oHeatV").textContent = this.value + " °C"; };
    $("runBtn").onclick = function () { if (!A.running) runAnalysis(); };
  }
  function pAnalysisTabs() { var b = $("st2"); if (b) b.disabled = !(S.an.result && S.an.result.fieldId === S.an.fieldId) && !S.an.running; }

  /* ---------- Запуск ---------- */
  function logLine(entry) {
    S.an.log.forEach(function (l) { l.spin = false; });
    S.an.log.push(entry);
    var el = $("aiLog"); if (el) el.innerHTML = logHtml();
  }
  function logHtml() {
    return S.an.log.map(function (l) {
      if (l.score == null) return '<div class="l"><span>' + (l.spin ? '<span class="spin"></span>' : "·") + "</span><span>" + esc(l.text) + "</span><span></span></div>";
      var c = scoreCls(l.score);
      return '<div class="l"><span style="color:var(--good)">✓</span><span>' + esc(l.text) + '</span><span class="s" style="color:var(--' + ({ g: "good", y: "warn", r: "bad" })[c] + ')">' + r0(l.score) + "</span></div>";
    }).join("");
  }
  function chainText(crops) { return crops.map(crop).join(" → "); }
  function newResult(f, source, clim) {
    return { id: uid(), fieldId: f.id, fieldName: f.name, date: Date.now(), source: source, lang: lang, w: Object.assign({}, S.an.w), opt: Object.assign({}, S.an.opt),
      climateSource: clim ? clim.source : "region", want: S.an.want.slice(), strategies: [], verdict: "", risks: [], actions: [] };
  }
  function runLocal(f, clim, reason) {
    var mf = modelField(f, clim);
    var plan = SS.localPlan(mf, S.an.opt, S.an.w, S.an.want);
    if (!plan.length) { logLine({ text: t("an.noPlan") }); return null; }
    var names = ["local.p1", "local.p2", "local.p3"], ideas = ["local.i1", "local.i2", "local.i3"];
    var tests = plan.map(function (p) { return SS.stressTest(p.crops, mf, S.an.opt, S.an.w); });
    plan.forEach(function (p, i) { logLine({ text: chainText(p.crops), score: tests[i].total }); });
    var order = plan.map(function (p, i) { return i; }).sort(function (a, b) { return tests[b].total - tests[a].total; });
    var res = newResult(f, "local", clim);
    res.strategies = order.map(function (i) { return { name: t(names[plan[i].profile]), crops: plan[i].crops, idea: t(ideas[plan[i].profile]) }; });
    var bt = tests[order[0]];
    res.verdict = (reason ? reason + " " : "") + t("local.verdict", { n: res.strategies[0].name, s: r0(bt.total), m: r0(bt.cells[0].res.margin / 1000), d: r0(bt.cells[1].loss / 1000), h: r0(bt.cells[2].loss / 1000) });
    return res;
  }
  function publicField(f) { return { name: f.name, region: f.region, area: f.area, lat: f.lat, lon: f.lon, soil: f.soil, irr: SS.irrType(f) !== "none", irrType: SS.irrType(f), h0: f.h0, h1: f.h1 }; }
  function climLabel(clim, f) {
    if (clim.source === "live") return "NASA POWER, климатология по координатам поля " + f.lat + ", " + f.lon;
    if (clim.source === "file") return "NASA POWER, файл для точки " + clim.lat + ", " + clim.lon;
    return "приближение к климатологии NASA POWER для центра области";
  }

  function runAnalysis() {
    var A = S.an, f = getField(A.fieldId); if (!f) return;
    A.running = true; A.log = []; A.result = null; A.edit = {}; A.step = 2; A.tab = "rec";
    pAnalysis();
    logLine({ text: t("log.climate"), spin: true });
    var finish = function (res) {
      A.running = false; A.ctl = null;
      if (res) { A.result = res; logLine({ text: t("log.done") }); }
      if (location.hash === "#analysis") pAnalysis();
    };
    getClimate(f).then(function (clim) {
      var mf = modelField(f, clim);
      var climate = { T: clim.T, P: clim.P, tmaxJul: clim.tmaxJul, label: climLabel(clim, f) };

      if (B.mode === "cloud") {
        logLine({ text: t("log.server"), spin: true });
        return B.ai({ field: publicField(f), climate: climate, opt: A.opt, w: A.w, want: A.want, lang: lang, candidates: SS.topCandidates(mf, A.opt, A.w, A.want, 4) }).then(function (j) {
          (j.log || []).forEach(function (l) { logLine({ text: t("log.tested") + ": " + chainText(l.crops), score: l.total }); });
          var res = newResult(f, "ai", clim);
          Object.assign(res, j.result);
          finish(res);
        }).catch(function (e) {
          var reason = e && e.code === "rate_limited" ? t("aierr.rate") : t("aierr.fallback");
          logLine({ text: reason });
          finish(runLocal(f, clim, reason));
        });
      }

      if (!AI.sample) {
        logLine({ text: t("log.local"), spin: true });
        return new Promise(function (r) { setTimeout(r, 30); }).then(function () { finish(runLocal(f, clim, "")); });
      }

      var tested = 0, writing = false;
      logLine({ text: t("log.start"), spin: true });
      var o = { modelTier: "default" };
      A.ctl = new AbortController(); o.signal = A.ctl.signal;
      if (AI.tools) {
        o.tools = [{
          name: SS.stressToolSpec.name, description: SS.stressToolSpec.description, inputSchema: SS.stressToolSpec.schema,
          execute: function (inp) {
            var r = SS.runStressTool(inp, mf, A.opt, A.w, A.want);
            tested++;
            logLine({ text: t("log.tested") + ": " + chainText(r.crops), score: r.total });
            logLine({ text: t("log.thinking"), spin: true });
            return r.result;
          }
        }];
      } else o.cache = false;
      o.onText = function () { if (!writing && (tested > 0 || !AI.tools)) { writing = true; logLine({ text: t("log.writing"), spin: true }); } };
      return AI.sample.json(SS.buildPrompt(publicField(f), climate, A.opt, A.w, lang, AI.tools, A.want), o).then(function (out) {
        var clean = SS.cleanAI(out, mf);
        if (clean) clean.strategies = clean.strategies.filter(function (st) { return !SS.agroCheck(st.crops, mf, A.want); });
        if (!clean || !clean.strategies.length) throw { code: "invalid_json" };
        var res = newResult(f, "ai", clim);
        Object.assign(res, clean);
        finish(res);
      }).catch(function (e) {
        var code = e && e.code;
        if (code === "cancelled") { logLine({ text: t("log.stopped") }); return finish(null); }
        if (code === "rate_limited") { logLine({ text: t("aierr.rate") }); return finish(null); }
        if (code === "invalid_json") { logLine({ text: t("aierr.json") }); return finish(null); }
        if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" || code === "capability_disabled") AI.sample = null;
        logLine({ text: t("aierr.fallback") });
        finish(runLocal(f, clim, t("aierr.fallback")));
      });
    });
  }

  /* ---------- Результаты ---------- */
  function stepResults() {
    var A = S.an, f = getField(A.fieldId), box = $("stepBody");
    if (A.running) {
      box.innerHTML = '<div class="card stack"><div class="runbar"><div class="status" id="aiStatus">' + aiStatusHtml() + "</div>" +
        (A.ctl ? '<button class="btn" id="stopBtn">' + t("btn.stop") + "</button>" : "") + '</div><div class="log" id="aiLog">' + logHtml() + "</div></div>";
      if ($("stopBtn")) $("stopBtn").onclick = function () { if (A.ctl) A.ctl.abort(); };
      return;
    }
    var res = A.result;
    if (!res) { box.innerHTML = '<div class="card empty"><h2>' + t("an.noResT") + "</h2><p>" + t("an.noRes") + "</p></div>"; return; }
    var mf = modelField(f, cachedClimate(f) || (res.climateSource === "region" ? null : null));
    if (!cachedClimate(f) && res.climateSource !== "region") {
      box.innerHTML = '<div class="card"><div class="status"><span class="spin"></span>' + t("cl.loading") + "</div></div>";
      getClimate(f).then(function () { if (location.hash === "#analysis" && S.an.step === 2) stepResults(); });
      return;
    }
    var tests = res.strategies.map(function (s) { return SS.stressTest(s.crops, mf, A.opt, A.w); });
    var bi = 0; tests.forEach(function (tt, i) { if (tt.total > tests[bi].total) bi = i; });
    var bs = res.strategies[bi], bt = tests[bi];
    res.best = bs.name; res.bestScore = bt.total;
    var changed = res.modified || JSON.stringify(res.w) !== JSON.stringify(A.w) || JSON.stringify(res.opt) !== JSON.stringify(A.opt);
    var chain = function (crops) { return '<div class="chain">' + crops.map(function (k) { return '<span class="c' + (k === "fallow" ? " f" : "") + '">' + esc(crop(k)) + "</span>"; }).join('<span class="a">→</span>') + "</div>"; };

    var h = '<div class="card best"><div class="row"><div class="label">' + t("res.best") + '</div><span class="sp"></span><span class="pill ' + scoreCls(bt.total) + '">' + r0(bt.total) + " / 100</span></div>" +
      "<h2>" + esc(bs.name) + "</h2>" + chain(bs.crops) + "</div>";
    h += '<div class="row"><div class="seg" role="tablist">' + [["rec", "res.tabRec"], ["cmp", "res.tabCmp"], ["years", "res.tabYears"]].map(function (x) {
      return '<button type="button" role="tab" data-tab="' + x[0] + '" aria-selected="' + (A.tab === x[0]) + '">' + t(x[1]) + "</button>";
    }).join("") + '</div><span class="sp"></span><button class="btn" id="toParams">' + t("btn.toParams") + '</button><button class="btn primary" id="saveBtn"' + (res.saved && !res.modified && !changed ? " disabled" : "") + ">" +
      t(res.saved && !res.modified && !changed ? "btn.saved" : "btn.saveAnalysis") + "</button></div>";
    if (changed) h += '<div class="banner">' + t("res.changed") + "</div>";

    if (A.tab === "rec") {
      h += '<div class="card"><div class="label">' + t(res.source === "ai" ? "res.byAI" : "res.byLocal") + "</div>" +
        (res.verdict ? '<p class="verdict">' + esc(res.verdict) + "</p>" : "") +
        ((res.risks && res.risks.length) || (res.actions && res.actions.length) ? '<div class="cols" style="margin-top:16px">' +
          (res.risks && res.risks.length ? '<div><div class="label">' + t("res.risks") + '</div><ul class="ul">' + res.risks.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : "<div></div>") +
          (res.actions && res.actions.length ? '<div><div class="label">' + t("res.actions") + '</div><ul class="ul">' + res.actions.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : "") + "</div>" : "") +
        '<p class="muted small" style="margin-top:14px">' + t(res.source === "ai" ? "src.ai" : "src.local") + " · " + fmtDate(res.date) + "</p></div>";
      h += '<div class="strats">' + res.strategies.map(function (s, i) {
        var tt = tests[i], ed = A.edit[i], warn = SS.agroCheck(s.crops, mf, res.want);
        return '<div class="st' + (i === bi ? " win" : "") + '"><div class="top"><div><div class="label">' + (i === bi ? t("res.best") : t("res.strategy") + " " + (i + 1)) + "</div><h3>" + esc(s.name) + '</h3></div><span class="score" style="color:var(--' + ({ g: "good", y: "warn", r: "bad" })[scoreCls(tt.total)] + ')">' + r0(tt.total) + "</span></div>" +
          (ed ? '<div class="edit-yr">' + s.crops.map(function (k, y) { return '<label class="field"><span class="small">' + t("res.year") + " " + (y + 1) + '</span><select data-s="' + i + '" data-y="' + y + '">' + cropOpts(k, !SS.riceOk(modelField(f, null))) + "</select></label>"; }).join("") + "</div>" : chain(s.crops)) +
          '<p class="small"><b>' + r0(tt.cells[0].res.margin / 1000) + "</b> " + t("res.perYear") + "</p>" +
          (s.idea ? '<p class="idea">' + esc(s.idea) + "</p>" : "") + (warn ? '<p class="warnl">' + t("res.rule") + ": " + esc(warn) + "</p>" : "") +
          '<div><button class="btn sm" data-edit="' + i + '">' + t(ed ? "btn.done" : "btn.editCrops") + "</button></div></div>";
      }).join("") + "</div>";
    } else if (A.tab === "cmp") {
      var scn = ["scen.norm", "scen.dry", "scen.heat"], scv = ["", " −" + A.opt.dryPct + "%", " +" + A.opt.heatC + " °C"];
      h += '<div class="card stack"><p class="muted small">' + t("res.cmpNote") + '</p><div class="mx-wrap"><table class="mx"><thead><tr><th>' + t("res.strategy") + "</th>" +
        scn.map(function (k, i) { return "<th>" + t(k) + scv[i] + "</th>"; }).join("") + '<th style="text-align:center">' + t("res.total") + "</th></tr></thead><tbody>" +
        res.strategies.map(function (s, i) {
          var tt = tests[i];
          return '<tr' + (i === bi ? ' class="win"' : "") + "><td><b>" + esc(s.name) + '</b><div class="muted small" style="margin-top:2px">' + esc(chainText(s.crops)) + "</div></td>" +
            tt.cells.map(function (c, j) {
              var x = c.res, k = scoreCls(c.score);
              return '<td class="c ' + k + '"><div class="stt">' + t(k === "g" ? "res.ok" : k === "y" ? "res.risk" : "res.fail") + '</div><div class="sc">' + r0(c.score) + "</div><dl>" +
                "<dt>" + t("res.margin") + "</dt><dd>" + r0(x.margin / 1000) + "</dd>" +
                (j ? "<dt>" + t("res.loss") + "</dt><dd>" + (c.loss < 500 ? "0" : "−" + r0(c.loss / 1000)) + "</dd>" : "") +
                "<dt>" + t("res.deficitPct") + "</dt><dd>" + r0(x.deficit * 100) + "%</dd>" +
                (f.irr ? "<dt>" + t("res.irrigMm") + "</dt><dd>" + r0(x.irrig) + "</dd>" : "") +
                "<dt>" + t("res.soilIdx") + "</dt><dd>" + x.soil0 + "→" + x.soil + "</dd></dl></td>";
            }).join("") + '<td><span class="tot">' + r0(tt.total) + "</span></td></tr>";
        }).join("") + "</tbody></table></div>" +
        '<div class="legend"><span><i style="background:var(--good)"></i>' + t("res.legendOk") + '</span><span><i style="background:var(--warn)"></i>' + t("res.legendRisk") +
        '</span><span><i style="background:var(--bad)"></i>' + t("res.legendFail") + '</span></div><p class="muted small">' + t("res.marginNote") + "</p></div>";
    } else {
      h += '<div class="card stack"><div class="card-h" style="margin:0"><h2>' + esc(bs.name) + '</h2><div class="legend">' +
        [["--c-norm", "scen.norm"], ["--c-dry", "scen.dry"], ["--c-heat", "scen.heat"]].map(function (x) { return '<span><i style="background:var(' + x[0] + ')"></i>' + t(x[1]) + "</span>"; }).join("") +
        '</div></div><div class="chart">' + yearChart(bs, bt) + '</div><p class="muted small">' + t("res.yearsNote2") + "</p></div>";
    }
    box.innerHTML = h;
    qa("[data-tab]", box).forEach(function (b) { b.onclick = function () { A.tab = b.dataset.tab; stepResults(); }; });
    qa("[data-edit]", box).forEach(function (b) { b.onclick = function () { A.edit[b.dataset.edit] = !A.edit[b.dataset.edit]; stepResults(); }; });
    qa("select[data-s]", box).forEach(function (s) { s.onchange = function () { res.strategies[s.dataset.s].crops[s.dataset.y] = s.value; res.modified = true; stepResults(); }; });
    $("toParams").onclick = function () { A.step = 1; pAnalysis(); };
    $("saveBtn").onclick = function () {
      var copy = clone(res); copy.w = Object.assign({}, A.w); copy.opt = Object.assign({}, A.opt);
      delete copy.saved; delete copy.modified;
      B.saveAnalysis(copy).then(function () { return B.analyses(); }).then(function (list) {
        S.analyses = list; res.saved = true; res.modified = false; res.w = copy.w; res.opt = copy.opt;
        toast(t("toast.analysisSaved")); stepResults();
      }).catch(function () { toast(t("err.server")); });
    };
  }

  function yearChart(s, tt) {
    var cols = ["var(--c-norm)", "var(--c-dry)", "var(--c-heat)"];
    var W = 600, H = 240, L = 36, Rr = 8, T = 16, Bm = 44, pw = W - L - Rr, ph = H - T - Bm, gw = pw / 4;
    var y = function (v) { return T + ph - v / 100 * ph; };
    var o = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';
    [0, 25, 50, 75, 100].forEach(function (v) {
      o += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + v + "%</text>";
    });
    s.crops.forEach(function (k, yi) {
      var x0 = L + yi * gw, bw = gw * 0.2, st = x0 + gw * 0.17;
      if (k === "fallow") {
        o += '<rect x="' + (x0 + gw * 0.12) + '" y="' + T + '" width="' + (gw * 0.76) + '" height="' + ph + '" fill="var(--surface-2)" stroke="var(--line)" stroke-dasharray="4 4" rx="6"/>' +
          '<text x="' + (x0 + gw / 2) + '" y="' + (T + ph / 2) + '" text-anchor="middle" font-size="12" fill="var(--muted)">' + esc(t("res.fallowBar")) + "</text>";
      } else {
        tt.cells.forEach(function (c, i) {
          var yr = c.res.years[yi], v = r0(yr.yield * 100);
          o += '<rect x="' + (st + i * (bw + 3)) + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, T + ph - y(v)) + '" fill="' + cols[i] + '" rx="2"/>' +
            '<text x="' + (st + i * (bw + 3) + bw / 2) + '" y="' + (y(v) - 5) + '" text-anchor="middle" font-size="10.5" fill="var(--ink)">' + yr.tons.toFixed(1) + "</text>";
        });
      }
      o += '<text x="' + (x0 + gw / 2) + '" y="' + (H - 24) + '" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">' + t("res.year") + " " + (yi + 1) + "</text>" +
        '<text x="' + (x0 + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="12" fill="var(--muted)">' + esc(crop(k)) + "</text>";
    });
    return o + "</svg>";
  }

  /* =========================================================
     Климат NASA
     ========================================================= */
  function pClimate() {
    if (!S.fields.length) return emptyNeedField(t("nav.data"));
    var CS = S.clim;
    if (!CS.fieldId || !getField(CS.fieldId)) CS.fieldId = S.an.fieldId && getField(S.an.fieldId) ? S.an.fieldId : S.fields[0].id;
    var f = getField(CS.fieldId), cl = cachedClimate(f);
    var head = '<div class="ph"><div><h1>' + t("nav.data") + "</h1><p>" + t("data.sub") + "</p></div></div>" + sourcesCard() +
      '<div class="card"><div class="card-h"><h2>' + t("nav.climate") + '</h2></div><p class="muted small" style="margin-bottom:12px">' + t("cl.sub") + '</p><select id="cField" aria-label="' + t("an.field") + '">' + fieldOpts(f.id) + "</select></div>";
    if (!cl) {
      P(head + '<div class="card"><div class="status"><span class="spin"></span>' + t("cl.loading") + "</div></div>");
      $("cField").onchange = function () { CS.fieldId = this.value; pClimate(); };
      getClimate(f).then(function () { if (location.hash === "#data") pClimate(); });
      return;
    }
    var url = SS.apiUrl(f.lat, f.lon), mon = t("months");
    var ann = cl.P.reduce(function (a, b) { return a + b; }, 0), seas = cl.P[4] + cl.P[5] + cl.P[6] + cl.P[7];
    var src = cl.source === "live" ? t("cl.srcLive", { lat: f.lat, lon: f.lon }) : cl.source === "file" ? t("cl.srcFile", { lat: cl.lat, lon: cl.lon }) : t("cl.srcRegion", { city: R[f.region].city });
    var h = head +
      '<div class="card stack"><div class="row"><span class="pill ' + (cl.source === "region" ? "y" : "g") + '">' + esc(src) + '</span></div>' +
      (cl.failed ? '<div class="banner">' + t("cl.fail") + "</div>" : "") +
      '<div class="kpis"><div><div class="label">' + t("cl.annual") + '</div><div class="kpi-v">' + r0(ann) + " " + MM() + '</div></div><div><div class="label">' + t("cl.season") + '</div><div class="kpi-v">' + r0(seas) + " " + MM() + '</div></div>' +
      '<div><div class="label">' + t("cl.tjul") + '</div><div class="kpi-v">' + cl.T[6] + ' °C</div></div><div><div class="label">' + t("cl.tmax") + '</div><div class="kpi-v">' + cl.tmaxJul + " °C</div></div></div>" +
      '<div class="legend"><span><i style="background:var(--c-norm)"></i>' + t("cl.legendP") + '</span><span><i style="background:var(--c-heat)"></i>' + t("cl.legendT") + "</span></div>" +
      '<div class="chart">' + climChart(cl, mon) + "</div>" +
      '<div class="tbl-wrap"><table class="ct"><thead><tr><th>' + t("cl.month") + "</th>" + mon.map(function (m) { return "<th>" + m + "</th>"; }).join("") + "</tr></thead><tbody>" +
      "<tr><td>" + t("cl.rowT") + "</td>" + cl.T.map(function (v) { return "<td>" + v + "</td>"; }).join("") + "</tr>" +
      "<tr><td>" + t("cl.rowP") + "</td>" + cl.P.map(function (v) { return "<td>" + v + "</td>"; }).join("") + '</tr></tbody></table></div><p class="muted small">' + t("cl.kind") + "</p></div>" +
      '<div class="card stack"><h2 style="font-size:17px">' + t("cl.exactT") + '</h2><p class="muted">' + t(B.mode === "cloud" ? "cl.exactCloud" : "cl.exactLocal") + "</p>" +
      (B.mode === "cloud" && !f.nasa ? '<div><button class="btn primary" id="refresh">' + t("btn.refresh") + "</button></div>" : "") +
      '<code class="url" id="apiUrl">' + esc(url) + '</code><div class="row"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + t("btn.openNasa") + '</a><button class="btn" id="copy">' + t("btn.copy") + "</button></div>" +
      '<div class="drop" id="drop"><label class="field"><span>' + t("cl.upload") + '</span><input type="file" id="cFile" accept=".json,application/json"></label><span class="muted small">' + t("cl.uploadHint") + '</span><span class="err" id="cErr">' + esc(CS.msg) + "</span></div>" +
      (f.nasa ? '<div><button class="btn" id="reset">' + t("btn.resetRegion") + "</button></div>" : "") + "</div>" +
      cropsCard() +
      '<div class="card"><div class="card-h"><h2>' + t("cl.datasets") + '</h2></div><div class="ds">' +
      [["NASA POWER", "ds.power", 1], ["SMAP L4", "ds.smap", 0], ["MODIS NDVI", "ds.modis", 0], ["GPM IMERG", "ds.gpm", 0]].map(function (d) {
        return "<div><span class=\"pill " + (d[2] ? "g" : "") + '" style="align-self:flex-start">' + t(d[2] ? "ds.used" : "ds.next") + "</span><h3>" + d[0] + "</h3><p>" + t(d[1]) + "</p></div>";
      }).join("") + "</div></div>";
    P(h);
    CS.msg = "";
    $("cField").onchange = function () { CS.fieldId = this.value; pClimate(); };
    if ($("refresh")) $("refresh").onclick = function () {
      this.disabled = true; delete S.clim.cache[climKey(f)];
      getClimate(f, true).then(function () { toast(t("toast.nasaLoaded")); pClimate(); });
    };
    $("copy").onclick = function () {
      var el = $("apiUrl"), sel = function () { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast(t("toast.selected")); };
      try { navigator.clipboard.writeText(url).then(function () { toast(t("toast.copied")); }, sel); } catch (e) { sel(); }
    };
    var handle = function (file) {
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var parsed = SS.parseNasa(JSON.parse(rd.result));
          var nf = clone(f);
          parsed.lat = parsed.lat != null ? Math.round(parsed.lat * 100) / 100 : f.lat;
          parsed.lon = parsed.lon != null ? Math.round(parsed.lon * 100) / 100 : f.lon;
          nf.nasa = parsed;
          B.saveField(nf).then(loadAll).then(function () {
            if (S.an.fieldId === f.id) { S.an.result = null; S.an.step = 1; }
            toast(t("toast.nasaLoaded")); pClimate();
          });
        } catch (e) { $("cErr").textContent = e.message || "JSON"; }
      };
      rd.readAsText(file);
    };
    $("cFile").onchange = function () { handle(this.files[0]); };
    var drop = $("drop");
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("drag"); };
    drop.ondragleave = function () { drop.classList.remove("drag"); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("drag"); handle(e.dataTransfer.files[0]); };
    if ($("reset")) $("reset").onclick = function () {
      var nf = clone(f); delete nf.nasa;
      B.saveField(nf).then(loadAll).then(function () { if (S.an.fieldId === f.id) { S.an.result = null; S.an.step = 1; } pClimate(); });
    };
  }
  function sourcesCard() {
    return '<div class="card"><div class="card-h"><h2>' + t("data.sources") + '</h2></div><div class="tbl-wrap"><table class="t src"><thead><tr><th>' + t("data.s.what") + "</th><th>" + t("data.s.from") + "</th><th>" + t("data.s.who") + "</th></tr></thead><tbody>" +
      t("data.rows").map(function (r) { return '<tr><td class="name"><b>' + esc(r[0]) + '</b></td><td data-l="' + esc(t("data.s.from")) + '">' + esc(r[1]) + '</td><td data-l="' + esc(t("data.s.who")) + '"><span class="pill ' + (/^(Фермер|Farmer)$/.test(r[2]) ? "acc" : "") + '">' + esc(r[2]) + "</span></td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  }
  function cropsCard() {
    var cols = ["data.c.y", "data.c.price", "data.c.cost", "data.c.need", "data.c.sat", "data.c.thr", "data.c.soil"];
    return '<div class="card"><div class="card-h"><h2>' + t("data.crops") + '</h2></div><p class="muted small" style="margin-bottom:12px">' + t("data.cropsNote") + "</p>" +
      '<div class="tbl-wrap"><table class="ct crops"><thead><tr><th>' + t("data.c.crop") + "</th>" + cols.map(function (c) { return "<th>" + t(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      SS.CROP_KEYS.map(function (k) {
        var c = SS.CROPS[k], fal = k === "fallow";
        return "<tr><td>" + esc(crop(k)) + "</td><td>" + (fal ? "—" : c.y) + "</td><td>" + (fal ? "—" : c.price / 1000) + "</td><td>" + c.cost / 1000 + "</td><td>" + (fal ? "—" : c.need) + "</td><td>" + (fal ? "—" : num(c.sat)) + "</td><td>" + (fal ? "—" : c.thr) + "</td><td>" + (c.soil > 0 ? "+" : "") + c.soil + "</td></tr>";
      }).join("") + "</tbody></table></div></div>" + zoningCard();
  }
  function zoningCard() {
    var ks = SS.CROP_KEYS.filter(function (k) { return k !== "fallow"; }), sym = ["—", "◐", "●"];
    return '<div class="card"><div class="card-h"><h2>' + t("data.zoning") + '</h2></div><p class="muted small" style="margin-bottom:12px">' + t("data.zoningNote") + "</p>" +
      '<div class="tbl-wrap"><table class="ct zon"><thead><tr><th>' + t("data.region") + "</th>" + ks.map(function (k) { return "<th>" + esc(crop(k)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      Object.keys(R).map(function (r) { return "<tr><td>" + esc(region(r)) + "</td>" + ks.map(function (k) { var l = SS.REGION_CROPS[r][k]; return '<td class="l' + l + '">' + sym[l] + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table></div><p class="muted small" style="margin-top:8px">' + t("data.zLegend") + "</p></div>";
  }
  function MM() { return lang === "en" ? "mm" : "мм"; }
  function climChart(K, mon) {
    var W = 640, H = 240, L = 40, Rr = 40, T = 14, Bm = 28, pw = W - L - Rr, ph = H - T - Bm, gw = pw / 12;
    var pMax = Math.max(40, Math.ceil(Math.max.apply(null, K.P) / 20) * 20);
    var tMin = Math.min(-20, Math.floor(Math.min.apply(null, K.T) / 10) * 10), tMax = Math.max(30, Math.ceil(Math.max.apply(null, K.T) / 10) * 10);
    var y = function (v) { return T + ph - v / pMax * ph; }, ty = function (v) { return T + ph - (v - tMin) / (tMax - tMin) * ph; };
    var o = '<svg viewBox="0 0 ' + W + " " + H + '" role="img">';
    for (var v = 0; v <= pMax + 0.01; v += pMax / 4) o += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + r0(v) + "</text>";
    for (var tv = tMin; tv <= tMax; tv += 10) o += '<text x="' + (W - Rr + 8) + '" y="' + (ty(tv) + 4) + '" font-size="11" fill="var(--c-heat)">' + tv + "°</text>";
    if (tMin < 0) o += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + ty(0) + '" y2="' + ty(0) + '" stroke="var(--c-heat)" stroke-opacity=".35" stroke-dasharray="3 4"/>';
    var pts = [];
    K.P.forEach(function (p, i) {
      var x0 = L + i * gw;
      o += '<rect x="' + (x0 + gw * 0.22) + '" y="' + y(p) + '" width="' + (gw * 0.56) + '" height="' + Math.max(0, T + ph - y(p)) + '" fill="var(--c-norm)" rx="2"' + (i >= 4 && i <= 7 ? "" : ' fill-opacity=".45"') + '/>' +
        '<text x="' + (x0 + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(mon[i]) + "</text>";
      pts.push((x0 + gw / 2) + "," + ty(K.T[i]));
    });
    o += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="var(--c-heat)" stroke-width="2"/>';
    K.T.forEach(function (tv2, i) { o += '<circle cx="' + (L + i * gw + gw / 2) + '" cy="' + ty(tv2) + '" r="2.8" fill="var(--c-heat)"/>'; });
    return o + "</svg>";
  }

  /* =========================================================
     Профиль
     ========================================================= */
  function pProfile() {
    var u = S.user;
    P('<div class="ph"><div><h1>' + t("nav.profile") + "</h1><p>" + t("pr.sub") + "</p></div></div>" +
      '<form class="card stack" id="pF" novalidate style="max-width:680px"><div class="form">' +
      '<label class="field full"><span>' + t("auth.name") + '</span><input type="text" id="pName" value="' + esc(u.name) + '"></label>' +
      '<label class="field"><span>' + t("auth.farm") + '</span><input type="text" id="pFarm" value="' + esc(u.farm) + '"></label>' +
      '<label class="field"><span>' + t("auth.region") + '</span><select id="pRegion">' + regionOpts(u.region) + "</select></label>" +
      '<label class="field"><span>' + t("pr.phone") + '</span><input type="text" value="' + fmtPhone(u.phone) + '" disabled></label>' +
      '<label class="field"><span>' + t("pr.lang") + '</span><select id="pLang">' + LANGS.map(function (L) { return '<option value="' + L[0] + '"' + (L[0] === lang ? " selected" : "") + ">" + L[1] + "</option>"; }).join("") + "</select></label>" +
      '</div><div class="err" id="pErr"></div>' +
      (S.confirm === "delAcc" ? '<div class="confirm">' + t("confirm.delAcc") + '<button type="button" class="btn danger sm" id="pDelY">' + t("btn.delete") + '</button><button type="button" class="btn sm" id="pDelN">' + t("btn.cancel") + "</button></div>" : "") +
      '<div class="row"><button class="btn primary" type="submit">' + t("btn.save") + '</button><button class="btn" type="button" id="pOut">' + t("btn.logout") + '</button><span class="sp"></span><button class="btn danger" type="button" id="pDel">' + t("btn.deleteAcc") + "</button></div></form>");
    $("pF").onsubmit = function (e) {
      e.preventDefault();
      var name = $("pName").value.trim(); if (name.length < 3) return ($("pErr").textContent = t("err.name"));
      var nl = $("pLang").value;
      B.updateMe({ name: name, farm: $("pFarm").value.trim(), region: $("pRegion").value, lang: nl }).then(function (usr) {
        S.user = usr; toast(t("toast.profileSaved"));
        if (nl !== lang) setLang(nl); else route();
      }).catch(function () { $("pErr").textContent = t("err.server"); });
    };
    $("pOut").onclick = logout;
    $("pDel").onclick = function () { S.confirm = "delAcc"; pProfile(); };
    if ($("pDelN")) $("pDelN").onclick = function () { S.confirm = null; pProfile(); };
    if ($("pDelY")) $("pDelY").onclick = function () { S.confirm = null; B.deleteMe().then(function () { S.user = null; location.hash = "#home"; route(); }); };
  }

  /* =========================================================
     Старт
     ========================================================= */
  document.documentElement.lang = lang;
  root.innerHTML = '<div class="gutter" style="padding-block:40px"><div class="wrap status"><span class="spin"></span>STEPPESHIELD</div></div>';
  initSample();
  detect().then(function (b) {
    B = b;
    return B.me().catch(function () { return null; });
  }).then(function (u) {
    S.user = u;
    if (u && u.lang && I18N[u.lang] && !sget("ss_lang")) { lang = u.lang; document.documentElement.lang = lang; }
    return u ? loadAll().catch(function () { }) : null;
  }).then(route);

  if ("serviceWorker" in navigator && location.protocol === "https:" && window.top === window) {
    try { navigator.serviceWorker.register("sw.js").catch(function () { }); } catch (e) { }
  }
})();
