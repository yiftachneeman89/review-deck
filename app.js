// Review Deck: sign in once (project folder + Gemini key), then Code Check, Screen Map and
// Design Critic all use that project. All four sites live on yiftachneeman89.github.io, so they
// share this browser's storage: the project in DeckStore (shared.js), the key and quiz in Code Check's store.

(() => {
  const $ = (id) => document.getElementById(id);
  const evening = new URLSearchParams(location.search).has("evening");  // opened by the evening reminder task

  // ---------------------------------------------------------------- white / black mode

  // theme.js applies it here and in the three tools (they all read rd.theme)
  function showTheme(theme) {
    for (const b of document.querySelectorAll("[data-theme-choice]")) b.classList.toggle("on", b.dataset.themeChoice === theme);
  }
  for (const b of document.querySelectorAll("[data-theme-choice]")) b.onclick = () => RDTheme.set(b.dataset.themeChoice);
  document.addEventListener("rd-theme", (e) => showTheme(e.detail));
  showTheme(RDTheme.get());

  // ---------------------------------------------------------------- one line about each tool

  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : `${d} days ago`;
  }

  function readJson(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const pct = (v) => (v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)) + "%";
  const bar = (parts) => `<div class="bar">${parts.map(([w, cls]) => `<i class="${cls}" style="width:${Math.max(0, Math.min(100, w))}%"></i>`).join("")}</div>`;
  const busy = (text) => `<div class="busy"><i></i>${text}</div>`;
  const shortDate = (d) => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ---------------------------------------------------------------- Code Check: mastery ring, week, goal

  function ringSvg(parts, size, stroke, center) {
    // parts: [[fraction 0..1, css colour]] drawn one after another around the circle
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    let offset = 0;
    const arcs = parts.filter(([f]) => f > 0).map(([f, color]) => {
      const len = Math.max(0, Math.min(1, f)) * c;
      const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="${f < 1 ? "round" : "butt"}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += len;
      return arc;
    }).join("");
    return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>${arcs}</svg><div class="ring-center">${center}</div>`;
  }

  function codeCheckDetails() {
    const m = Quiz.mastery(), st = dailyStatus();
    const rounds = Object.values(allRounds());
    const ids = new Set(Session.chunks.map((c) => c.id));
    const done = new Set(rounds.filter((r) => Object.keys(r.answers || {}).length && ids.has(r.chunk.id)).map((r) => r.chunk.id));
    const scores = rounds.flatMap((r) => Object.values(r.answers || {}).filter((a) => a.feedback).map((a) => a.feedback.score));
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const hist = Quiz.history();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const h = hist.find((x) => x.date === isoDate(d));
      days.push({ l: d.toLocaleDateString(undefined, { weekday: "narrow" }), met: h?.goal_met, some: h && h.answered > 0, today: !i });
    }
    const scoreColor = avg == null ? "var(--ink-3)" : avg >= 80 ? "var(--green)" : avg >= 50 ? "var(--amber)" : "var(--red)";
    $("info-code-check").textContent = `${pct(m.known_pct)} of your code completed`;
    $("det-code-check").innerHTML = `
      <div class="hero-viz">
        <div class="ring-wrap">${ringSvg([[m.mastered_pct / 100, "var(--green)"], [m.learning_pct / 100, "var(--amber)"]], 112, 12, `<b>${pct(m.known_pct)}</b><small>known</small>`)}</div>
        <div class="key">
          <div><i style="background:var(--green)"></i><span>Mastered</span><b>${pct(m.mastered_pct)}</b></div>
          <div><i style="background:var(--amber)"></i><span>Learning</span><b>${pct(m.learning_pct)}</b></div>
          <div><i style="background:var(--track)"></i><span>Not seen</span><b>${pct(Math.max(0, 100 - m.mastered_pct - m.learning_pct))}</b></div>
        </div>
      </div>
      <div class="week">${days.map((d) => `<div class="${d.met ? "met" : d.some ? "some" : ""} ${d.today ? "today" : ""}"><i>${d.met ? "✓" : ""}</i><span>${d.l}</span></div>`).join("")}</div>
      <div class="tiles">
        <div class="tile"><span>Streak</span><b class="${st.streak ? "hot" : ""}"><svg viewBox="0 0 24 24" class="flame"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5 .3 1.6 1 2.6 2 3C11 8 11.5 5 12 2Z"/></svg>${st.streak}<small>${st.streak === 1 ? "day" : "days"}</small></b></div>
        <div class="tile"><span>Today</span><b>${st.today_answered}<small>/ ${st.goal}</small></b><div class="pips">${Array.from({ length: st.goal }, (_, i) => `<i class="${i < st.today_answered ? "on" : ""}"></i>`).join("")}</div></div>
        <div class="tile"><span>Chunks done</span><b>${done.size}<small>/ ${Session.chunks.length}</small></b>${bar([[(done.size / Math.max(1, Session.chunks.length)) * 100, "good"]])}</div>
        <div class="tile"><span>Avg score</span><b style="color:${scoreColor}">${avg ?? "–"}<small>${avg == null ? "no answers" : "/ 100"}</small></b><p class="tile-sub">${plural(scores.length, "answer")}</p></div>
      </div>`;
  }

  // ---------------------------------------------------------------- Screen Map: a small flow chart of the app

  const KIND_COLOR = { activity: "var(--ink)", fragment: "var(--blue)", dialog: "var(--orange)" };

  function miniMap(g) {
    const n = g.nodes.length;
    if (!n) return "";
    // layers by distance from the start screen (breadth-first), unreached screens at the bottom
    const out = Array.from({ length: n }, () => []);
    for (const [a, b] of g.edges) out[a].push(b);
    const layer = new Array(n).fill(-1);
    const startIdx = Math.max(0, g.nodes.findIndex((x) => x.s));
    const queue = [startIdx];
    layer[startIdx] = 0;
    while (queue.length) {
      const v = queue.shift();
      for (const w of out[v]) if (layer[w] < 0) { layer[w] = layer[v] + 1; queue.push(w); }
    }
    const maxL = Math.max(0, ...layer);
    for (let i = 0; i < n; i++) if (layer[i] < 0) layer[i] = maxL + 1;
    const rows = [];
    layer.forEach((l, i) => (rows[l] = rows[l] || []).push(i));
    const packed = rows.filter(Boolean);
    const W = 320, rowH = 34, nodeH = 16, H = packed.length * rowH + 8;
    const pos = [];
    packed.forEach((row, r) => {
      const w = Math.min(46, (W - 8) / row.length - 6);
      row.forEach((i, k) => {
        const slot = (W - 8) / row.length;
        pos[i] = { x: 4 + slot * k + (slot - w) / 2, y: 6 + r * rowH, w };
      });
    });
    const lines = g.edges.map(([a, b, auto]) => {
      const p = pos[a], q = pos[b];
      const x1 = p.x + p.w / 2, y1 = p.y + (q.y >= p.y ? nodeH : 0), x2 = q.x + q.w / 2, y2 = q.y + (q.y >= p.y ? 0 : nodeH);
      const my = (y1 + y2) / 2;
      return `<path d="M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}" class="${auto ? "auto" : ""}"/>`;
    }).join("");
    // each box opens that screen's panel; a bigger invisible box makes it easy to hit
    const boxes = g.nodes.map((node, i) => {
      const p = pos[i];
      return `<g class="node ${node.s ? "start" : ""}" data-node="${i}" tabindex="0" role="button" aria-label="${esc(node.n)}"><title>${esc(node.n)}</title><rect x="${p.x - 3}" y="${p.y - 4}" width="${p.w + 6}" height="${nodeH + 8}" class="hit"/><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${nodeH}" rx="4" class="box"/><rect x="${p.x}" y="${p.y}" width="3.5" height="${nodeH}" rx="1.5" fill="${KIND_COLOR[node.k] || "var(--ink-3)"}"/></g>`;
    }).join("");
    return `<svg class="minimap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g class="edges">${lines}</g>${boxes}</svg>`;
  }

  function screenMapDetails(s) {
    $("info-screen-map").textContent = `${plural(s.screens, "screen")} and ${plural(s.links, "connection")}`;
    const kinds = [["activity", s.activities, s.activities === 1 ? "activity" : "activities"], ["fragment", s.fragments, s.fragments === 1 ? "fragment" : "fragments"], ["dialog", s.dialogs, s.dialogs === 1 ? "pop-up" : "pop-ups"]].filter(([, c]) => c);
    const linkable = s.graph && s.graph.nodes.some((x) => x.id);
    $("det-screen-map").innerHTML = `
      ${s.graph ? `<div class="map-wrap ${linkable ? "live" : ""}">${miniMap(s.graph)}${linkable ? `<p class="map-hint">Click a screen</p>` : ""}</div>` : ""}
      <div class="kinds">${kinds.map(([k, c, label]) => `<span><i style="background:${KIND_COLOR[k]}"></i><b>${c}</b> ${label}</span>`).join("")}</div>
      <div class="tiles">
        <div class="tile"><span>Connections</span><b>${s.links}</b><p class="tile-sub">${s.autoLinks != null ? `${s.autoLinks} automatic` : "taps and jumps"}</p></div>
        <div class="tile"><span>Buttons</span><b>${s.buttons ?? "–"}</b><p class="tile-sub">with code</p></div>
        <div class="tile"><span>Starts at</span><b class="small">${esc(s.start || "–")}</b></div>
        <div class="tile ${s.unreachable && s.unreachable.length ? "warn" : ""}"><span>Unreachable</span><b class="${s.unreachable && s.unreachable.length ? "small" : ""}">${s.unreachable ? (s.unreachable.length ? esc(s.unreachable[0]) + (s.unreachable.length > 1 ? ` +${s.unreachable.length - 1}` : "") : "0") : "–"}</b><p class="tile-sub">${s.layouts != null ? `${s.layouts} XML layouts` : ""}</p></div>
      </div>`;
  }

  // clicks and Enter on a mini map box
  const mapEl = $("det-screen-map");
  const nodeAt = (e) => {
    const g = e.target.closest(".minimap .node");
    const sm = readJson("sm.summary");
    return g && sm?.graph ? sm.graph.nodes[Number(g.dataset.node)] : null;
  };
  mapEl.addEventListener("click", (e) => { const n = nodeAt(e); if (n && n.id) { e.preventDefault(); openScreenSheet(n); } });
  mapEl.addEventListener("keydown", (e) => { if (e.key !== "Enter" && e.key !== " ") return; const n = nodeAt(e); if (n && n.id) { e.preventDefault(); openScreenSheet(n); } });

  // ---------------------------------------------------------------- Design Critic: grade, severities, types, worst screens

  const CATS = { accessibility: ["Accessibility", "var(--purple)"], color: ["Color", "var(--pink)"], typography: ["Typography", "var(--blue)"], layout: ["Layout", "var(--orange)"], states: ["States", "var(--teal)"], copy: ["Copy", "var(--ink-3)"] };

  function designCriticDetails(s) {
    const open = s.blocker + s.major + s.minor;
    $("info-design-critic").textContent = `Grade ${s.grade} · ${s.score}/100 · ${plural(open, "open issue")}`;
    const cats = s.cats || {};
    const max = Math.max(1, ...Object.values(cats));
    const sevW = (n) => (open ? (n / open) * 100 : 0);
    const top = (s.top || []).slice(0, 3);
    const topMax = Math.max(1, ...top.map((t) => t.count));
    $("det-design-critic").innerHTML = `
      <div class="hero-viz">
        <div class="grade grade-${s.grade}"><b>${s.grade}</b></div>
        <div class="grade-side">
          <div class="score"><b>${s.score}</b><small>/100</small></div>
          <div class="score-bar"><i style="width:${s.score}%;background:${s.score >= 75 ? "var(--green)" : s.score >= 50 ? "var(--orange)" : "var(--red)"}"></i></div>
          <p class="tile-sub">${s.fixed} fixed${s.wont ? ` · ${s.wont} won't fix` : ""} of ${s.total}</p>
        </div>
      </div>
      <div class="sevbar">
        <div class="bar thick"><i class="sev-b" style="width:${sevW(s.blocker)}%"></i><i class="sev-m" style="width:${sevW(s.major)}%"></i><i class="sev-n" style="width:${sevW(s.minor)}%"></i></div>
        <div class="sevkey"><span><i class="sev-b"></i><b>${s.blocker}</b> blocker${s.blocker === 1 ? "" : "s"}</span><span><i class="sev-m"></i><b>${s.major}</b> major</span><span><i class="sev-n"></i><b>${s.minor}</b> minor</span></div>
      </div>
      ${Object.keys(cats).length ? `<div class="cats">${Object.entries(CATS).map(([k, [label, color]]) => `<div class="cat"><span>${label}</span><div class="track"><i style="width:${((cats[k] || 0) / max) * 100}%;background:${color}"></i></div><b>${cats[k] || 0}</b></div>`).join("")}</div>` : ""}
      ${top.length ? `<div class="worst"><p class="mini-h">Most issues</p>${top.map((t) => `<div class="w-row"><span>${esc(t.screen)}</span><div class="track">${t.blocker ? `<i class="sev-b" style="width:${(t.blocker / topMax) * 100}%"></i>` : ""}${t.major ? `<i class="sev-m" style="width:${(t.major / topMax) * 100}%"></i>` : ""}<i class="sev-n" style="width:${((t.count - t.blocker - t.major) / topMax) * 100}%"></i></div><b>${t.count}</b></div>`).join("")}</div>` : ""}`;
  }

  // ---------------------------------------------------------------- fresh numbers for Screen Map and Design Critic
  // They write a summary whenever they run. If it's missing or older than the current code,
  // run the tool unseen in a frame (same site, same project) and wait for it.

  const running = {};
  function runInBackground(tool, key, label) {
    if (running[tool]) return;
    $(`det-${tool}`).innerHTML = busy(label);
    const frame = document.createElement("iframe");
    frame.src = `/${tool}/`;
    frame.className = "bg-run";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    running[tool] = frame;
    const finish = () => { clearTimeout(timer); window.removeEventListener("storage", onStore); frame.remove(); delete running[tool]; };
    const onStore = (e) => { if (e.key === key) { finish(); fillCards(current); } };
    const timer = setTimeout(() => { finish(); $(`det-${tool}`).innerHTML = `<p class="note">Open it once to see the details.</p>`; }, 180000);
    window.addEventListener("storage", onStore);
    document.body.append(frame);
  }

  let current = null;
  function refreshTools() {
    if (!current) return;
    // older summaries lack the chart data (graph, top) and the links (node ids, issue list)
    const fresh = (s, field) => s && s.at >= current.savedAt && s[field] !== undefined;
    const sm = readJson("sm.summary"), dc = readJson("dc.summary");
    const smOk = fresh(sm, "graph") && sm.graph.nodes.every((n) => "id" in n);
    if (smOk) screenMapDetails(sm); else runInBackground("screen-map", "sm.summary", "Mapping your screens…");
    // one at a time: the review starts after the map is done
    if (fresh(dc, "issues")) designCriticDetails(dc);
    else if (smOk) runInBackground("design-critic", "dc.summary", "Reviewing your design…");
    else $("det-design-critic").innerHTML = busy("Waiting to review your design…");
  }

  function fillCards(project) {
    current = project;
    try { codeCheckDetails(); } catch { /* keeps its tagline */ }
    refreshTools();
    renderHome();
  }

  // ---------------------------------------------------------------- today, since last time, trends

  const TONE_ICON = {
    good: '<path d="m5 12 5 5 9-10"/>',
    bad: '<path d="M12 8v5m0 3.5v.5"/><circle cx="12" cy="12" r="9"/>',
    todo: '<circle cx="12" cy="12" r="8"/>',
    info: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  const toneIcon = (tone) => `<svg viewBox="0 0 24 24" aria-hidden="true">${TONE_ICON[tone] || TONE_ICON.info}</svg>`;
  const itemHtml = (it, cls) => `<a class="${cls} tone-${it.tone}" href="${esc(it.href || "#")}">${toneIcon(it.tone)}<span>${esc(it.text)}</span></a>`;

  function renderToday(snap) {
    $("todayList").innerHTML = Insights.today(snap).map((it) => itemHtml(it, "t-item")).join("");
    const since = Insights.sinceLastTime(snap);
    $("sinceLabel").textContent = since ? since.label : "Since last time";
    $("sinceList").innerHTML = !since
      ? `<p class="note">Changes show up here from your second visit.</p>`
      : since.items.length
        ? since.items.map((it) => itemHtml(it, "s-pill")).join("")
        : `<p class="note">${since.firstDay ? "Nothing has changed yet today. Edit your code and it shows up here." : "Nothing has changed since then."}</p>`;
  }

  // one line per measure, its own scale; hover shows the day
  const charts = {};
  function lineChart(id, points, fmt) {
    charts[id] = { points, fmt };
    const W = 300, H = 72, top = 8, bottom = 6;
    if (points.length < 2) return `<div class="tchart empty"><span>${points.length ? "The line starts tomorrow" : "No data yet"}</span></div>`;
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    const pad = Math.max((hi - lo) * 0.15, hi === lo ? Math.max(1, Math.abs(hi) * 0.05) : 0);
    lo -= pad; hi += pad;
    const x = (i) => (i / (points.length - 1)) * W;
    const y = (v) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
    const last = points.length - 1;
    charts[id].xy = points.map((p, i) => [x(i) / W * 100, y(p.v) / H * 100]);
    return `<div class="tchart" data-chart="${id}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <path class="t-area" d="${line} L${W} ${H} L0 ${H} Z"/><path class="t-line" d="${line}"/>
      </svg>
      <i class="t-cross" hidden></i><i class="t-dot" style="left:${charts[id].xy[last][0]}%;top:${charts[id].xy[last][1]}%"></i>
      <div class="t-tip" hidden></div>
    </div>`;
  }

  function hoverChart(e) {
    const el = e.target.closest(".tchart[data-chart]");
    if (!el) return;
    const c = charts[el.dataset.chart];
    const r = el.getBoundingClientRect();
    const i = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (c.points.length - 1));
    const [px, py] = c.xy[i];
    const cross = el.querySelector(".t-cross"), dot = el.querySelector(".t-dot"), tip = el.querySelector(".t-tip");
    cross.hidden = tip.hidden = false;
    cross.style.left = dot.style.left = `${px}%`;
    dot.style.top = `${py}%`;
    tip.innerHTML = `<b>${c.fmt(c.points[i].v)}</b> ${shortDate(c.points[i].d)}`;
    tip.style.left = `${Math.max(14, Math.min(86, px))}%`;
  }
  function leaveChart(e) {
    const el = e.target.closest(".tchart[data-chart]");
    if (!el) return;
    const c = charts[el.dataset.chart], [px, py] = c.xy[c.xy.length - 1];
    el.querySelector(".t-cross").hidden = el.querySelector(".t-tip").hidden = true;
    Object.assign(el.querySelector(".t-dot").style, { left: `${px}%`, top: `${py}%` });
  }
  $("trends").addEventListener("mousemove", hoverChart);
  $("trends").addEventListener("mouseout", (e) => { if (!e.relatedTarget || !e.target.closest(".tchart")?.contains(e.relatedTarget)) leaveChart(e); });

  function renderTrends(snap) {
    const today = isoDate(new Date());
    // today's point is always the live value
    const withNow = (pts, v) => (v == null ? pts : [...pts.filter((p) => p.d !== today), { d: today, v }]);
    const tiles = [
      { id: "score", title: "Design score", unit: "/100", pts: withNow(Insights.series((s) => s.dc?.score), snap.dc?.score), fmt: (v) => `${Math.round(v)}`, good: 1 },
      { id: "known", title: "Code known", unit: "%", pts: withNow(Insights.series((s) => s.cc?.known), snap.cc?.known), fmt: (v) => pct(v), good: 1 },
      { id: "screens", title: "Screens", unit: "", pts: withNow(Insights.series((s) => s.sm?.screens), snap.sm?.screens), fmt: (v) => `${Math.round(v)}`, good: 0 },
    ];
    $("trends").innerHTML = tiles.map((t) => {
      const lastV = t.pts.length ? t.pts[t.pts.length - 1].v : null;
      const d = t.pts.length > 1 ? lastV - t.pts[0].v : 0;
      const dTxt = t.pts.length > 1 ? `${d > 0 ? "+" : d < 0 ? "−" : "±"}${t.id === "known" ? Math.abs(d).toFixed(1) + "%" : Math.abs(Math.round(d))} since ${shortDate(t.pts[0].d)}` : "";
      const tone = !d || !t.good ? "" : d > 0 ? "up" : "down";
      return `<div class="trend">
        <div class="tr-head"><span>${t.title}</span><b>${lastV == null ? "–" : t.id === "known" ? pct(lastV) : Math.round(lastV)}<small>${t.id === "known" ? "" : t.unit}</small></b></div>
        <p class="tr-delta ${tone}">${dTxt || "&nbsp;"}</p>
        ${lineChart(t.id, t.pts, t.id === "known" ? (v) => pct(v) : t.fmt)}
      </div>`;
    }).join("");
  }

  // ---------------------------------------------------------------- features (read from your code by Gemini)

  const FEAT_COLS = [
    ["built", "Built", "Works today"],
    ["in_progress", "In progress", "Started, not finished"],
    ["recommended", "Recommended", "Build or fix next"],
  ];
  let featOpen = {};
  let featError = null;  // the last failed check, shown until the next one works

  function screenNode(name) {
    const nodes = readJson("sm.summary")?.graph?.nodes || [];
    const low = name.toLowerCase().replace(/\s+/g, "");
    return nodes.find((n) => n.n.toLowerCase().replace(/\s+/g, "") === low || (n.id || "").toLowerCase() === low)
      || nodes.find((n) => low.includes(n.n.toLowerCase().replace(/\s+/g, "")));
  }

  function fileOf(path) {
    const files = Session.files || [];
    return files.find((f) => f.path === path) || files.find((f) => f.path.endsWith("/" + path.replace(/^\/+/, ""))) || files.find((f) => f.path.split("/").pop() === path.split("/").pop());
  }

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function evidence(f) {
    const screens = [...new Set(f.screens || [])].map((s) => {
      const n = screenNode(s);
      return n && n.id ? `<button class="ev ev-screen" data-screen="${esc(n.id)}">${esc(n.n)}</button>` : `<span class="ev ev-screen">${esc(s)}</span>`;
    });
    const files = [...new Set(f.files || [])].slice(0, 4).map((p) => {
      const file = fileOf(p);
      return file ? `<a class="ev ev-file" href="/code-check/?file=${encodeURIComponent(file.path)}" title="Quiz me on ${esc(file.path)}">${esc(file.path.split("/").pop())}</a>` : "";
    });
    const all = [...screens, ...files].filter(Boolean);
    return all.length ? `<div class="evs">${all.join("")}</div>` : "";
  }

  // ---------------------------------------------------------------- editing and removing any feature
  let editing = null;      // { key, list, name, text, missing } - the one card being edited
  let lastRemoved = null;  // { label, undo() } - for the Undo bar

  const textField = (list) => (list === "recommended" ? "why" : "detail");

  function editForm(list, f, mine = null) {
    const e = editing;
    if (mine) {
      return `<form class="feat edit-form" data-edit-form="${esc(e.key)}">
        <label for="edit-text">Your feature</label>
        <textarea id="edit-text" data-field="text" rows="3">${esc(e.text)}</textarea>
        <p class="note">Saving checks your code for it again.</p>
        <div class="add-actions"><button type="button" class="pill-btn" data-edit-cancel>Cancel</button><button type="submit" class="pill-btn dark">Save and check</button></div>
      </form>`;
    }
    return `<form class="feat edit-form" data-edit-form="${esc(e.key)}">
      <label for="edit-name">Name</label>
      <input id="edit-name" class="field" data-field="name" value="${esc(e.name)}" maxlength="80">
      <label for="edit-text">${list === "recommended" ? "Why it helps" : "What it does"}</label>
      <textarea id="edit-text" data-field="text" rows="3">${esc(e.text)}</textarea>
      ${list === "in_progress" ? `<label for="edit-missing">Still missing</label><textarea id="edit-missing" data-field="missing" rows="2">${esc(e.missing)}</textarea>` : ""}
      <div class="add-actions"><button type="button" class="pill-btn" data-edit-cancel>Cancel</button><button type="submit" class="pill-btn dark">Save</button></div>
    </form>`;
  }

  const cardActions = (key, extra = "", name = "") => `<div class="feat-actions-row">${extra}${name ? `<button class="link-btn" data-explain="${esc(name)}">Explain</button>` : ""}<button class="link-btn" data-edit="${esc(key)}">Edit</button><button class="link-btn danger" data-del="${esc(key)}">Remove</button></div>`;

  function featureCard(list, f) {
    if (editing && editing.key === f.key) return editForm(list, f);
    const extra = list === "in_progress"
      ? `<p class="missing"><span>Still missing</span>${esc(f.missing)}</p>`
      : list === "recommended"
        ? `<div class="chips"><span class="chip effort-${f.effort}">${esc(f.effort)} effort</span><span class="chip">${esc(f.type)}</span></div>`
        : "";
    const edited = f.edited ? `<span class="edited-tag">Edited</span><button class="link-btn" data-reset="${esc(f.key)}" title="Back to Gemini's wording">Undo edits</button>` : "";
    return `<div class="feat" id="feat-${slug(f.name)}"><b>${esc(f.name)}</b><p>${esc(f[textField(list)])}</p>${extra}${evidence(f)}${cardActions(f.key, edited, list === "recommended" ? "" : f.name)}</div>`;
  }

  // features you add yourself: Gemini checks the code for them and puts them in the column they belong to
  const VERDICT_COL = { built: "built", in_progress: "in_progress", missing: "recommended" };
  const COL_LABEL = { built: "Built", in_progress: "In progress", recommended: "Recommended" };
  const adding = {};    // column -> { text, busy, error } while its "Add a feature" box is open

  function mineCard(m) {
    const r = m.result, col = VERDICT_COL[r.status];
    if (editing && editing.key === `mine:${m.id}`) return editForm(col, r, m);
    const moved = m.column !== col
      ? `<p class="moved">You added this under ${COL_LABEL[m.column]} - ${r.status === "built" ? "it's already built" : r.status === "in_progress" ? "it's only partly there" : "it isn't in your code yet"}.</p>` : "";
    const asked = m.asked.trim().toLowerCase() !== r.name.trim().toLowerCase() ? `<p class="asked">“${esc(m.asked)}”</p>` : "";
    const tone = r.percent >= 90 ? "var(--green)" : r.percent >= 30 ? "var(--amber)" : "var(--red)";
    return `<div class="feat mine" id="feat-${slug(r.name)}">
      <div class="mine-top"><span class="mine-tag">Yours</span><span class="mine-pct">${r.percent}% there</span></div>
      <b>${esc(r.name)}</b>${asked}
      <div class="pbar" role="img" aria-label="${r.percent}% built"><i style="width:${r.percent}%;background:${tone}"></i></div>
      <p>${esc(r.detail)}</p>
      ${r.missing && r.status !== "built" ? `<p class="missing"><span>Still missing</span>${esc(r.missing)}</p>` : ""}
      ${moved}${evidence(r)}
      <div class="mine-actions">${r.status !== "missing" ? `<button class="link-btn" data-explain="${esc(r.name)}">Explain</button>` : ""}<button class="link-btn" data-recheck="${m.id}">Re-check</button><button class="link-btn" data-edit="mine:${m.id}">Edit</button><button class="link-btn danger" data-del="mine:${m.id}">Remove</button><small>checked ${ago(m.at)}${current && m.savedAt < current.savedAt ? " · code changed since" : ""}</small></div>
    </div>`;
  }

  function addBox(key) {
    const a = adding[key];
    if (!a) return `<button class="add-feat" data-add="${key}"><span>+</span> Add a feature</button>`;
    return `<form class="add-form" data-form="${key}">
      <label for="add-${key}">Describe a feature in your own words</label>
      <textarea id="add-${key}" rows="3" placeholder="${key === "built" ? "e.g. Users can reset their password" : key === "in_progress" ? "e.g. Saving lessons to watch offline" : "e.g. A metronome on the practice screen"}" ${a.busy ? "disabled" : ""}>${esc(a.text)}</textarea>
      ${a.error ? `<p class="setup-error">${esc(a.error)}</p>` : ""}
      ${a.busy ? busy("Gemini is looking for it in your code…") : `<div class="add-actions"><button type="button" class="pill-btn" data-cancel="${key}">Cancel</button><button type="submit" class="pill-btn dark">Check my code</button></div>`}
    </form>`;
  }

  let featPending = false;
  function renderFeatures() {
    // don't wipe a feature you're typing; draw again when you leave the box
    if (document.activeElement && document.activeElement.closest("#featBody textarea, #featBody input")) { featPending = true; return; }
    featPending = false;
    const saved = Features.saved();
    const body = $("featBody"), btn = $("featRun");
    btn.disabled = Features.running();
    btn.textContent = saved ? "Check again" : "Check my code";
    if (Features.running()) {
      $("featMeta").textContent = "";
      body.innerHTML = busy("Reading all of your code… this takes up to a minute.");
      return;
    }
    const error = featError ? `<p class="setup-error">Couldn't check your code: ${esc(featError)}</p>` : "";
    const r = saved ? saved.result : {};
    const view = Features.view();
    const mine = Features.mine();
    if (saved) {
      $("featSummary").textContent = r.summary;
      const stale = Features.stale(current);
      $("featMeta").innerHTML = `${stale ? `<span class="stale">Your code changed since</span> · ` : ""}checked ${ago(saved.at)} · ${plural(saved.files, "file")} read`;
    } else {
      $("featMeta").textContent = "";
    }
    const intro = saved ? "" : `<p class="note feat-intro">Gemini reads your whole project once and lists your features here. You can also add your own below.</p>`;
    const undo = lastRemoved ? `<div class="undo-bar"><span>Removed “${esc(lastRemoved.label)}”</span><button class="link-btn" data-undo>Undo</button><button class="x-btn sm" data-undo-close aria-label="Dismiss">×</button></div>` : "";
    const removed = view.removed.length ? `<details class="removed-list"><summary>${plural(view.removed.length, "removed feature")}</summary>
      ${view.removed.map((f) => `<div class="rm-row"><span>${esc(f.name)}</span><small>${COL_LABEL[f.col]}</small><button class="link-btn" data-restore="${esc(f.key)}">Bring back</button></div>`).join("")}
    </details>` : "";
    body.innerHTML = `${error}${undo}${intro}<div class="feat-cols">${FEAT_COLS.map(([key, label, sub]) => {
      const items = view[key];
      const own = mine.filter((m) => VERDICT_COL[m.result.status] === key);
      const limit = featOpen[key] ? items.length : 5;
      return `<div class="feat-col col-${key}">
        <div class="fc-head"><span class="fc-dot"></span><h3>${label}</h3><b>${items.length + own.length}</b><small>${sub}</small></div>
        ${addBox(key)}
        ${own.map(mineCard).join("")}
        ${items.slice(0, limit).map((f) => featureCard(key, f)).join("")}
        ${!items.length && !own.length ? `<p class="note">Nothing here.</p>` : ""}
        ${items.length > limit ? `<button class="link-btn" data-more="${key}">Show all ${items.length}</button>` : ""}
      </div>`;
    }).join("")}</div>${removed}`;
    const open = Object.keys(adding).find((k) => !adding[k].busy && adding[k].focus);
    if (open) { const t = $(`add-${open}`); t.focus(); t.setSelectionRange(t.value.length, t.value.length); adding[open].focus = false; }
    if (editing && editing.focus) { const t = $("edit-name") || $("edit-text"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } editing.focus = false; }
  }

  // which card a key points at: Gemini's (column:slug) or yours (mine:id)
  function findFeature(key) {
    if (key.startsWith("mine:")) {
      const m = Features.mine().find((x) => x.id === key.slice(5));
      return m && { mine: m, list: VERDICT_COL[m.result.status], f: m.result };
    }
    const view = Features.view();
    for (const [list] of FEAT_COLS) { const f = view[list].find((x) => x.key === key); if (f) return { list, f }; }
    return null;
  }

  function startEdit(key) {
    const hit = findFeature(key);
    if (!hit) return;
    editing = hit.mine
      ? { key, text: hit.mine.asked, focus: true }
      : { key, list: hit.list, name: hit.f.name, text: hit.f[textField(hit.list)] || "", missing: hit.f.missing || "", focus: true };
    featOpen[hit.list] = true;
    renderFeatures();
  }

  function saveEdit() {
    const e = editing, hit = findFeature(e.key);
    editing = null;
    if (!hit) return renderFeatures();
    if (hit.mine) {
      if (e.text.trim().length >= 4 && e.text.trim() !== hit.mine.asked) return checkMine(hit.list, e.text.trim(), hit.mine.id);
      return renderFeatures();
    }
    const value = { name: e.name.trim() || hit.f.name, [textField(hit.list)]: e.text.trim() };
    if (hit.list === "in_progress") value.missing = e.missing.trim();
    Features.setEdit(e.key, value);
    renderFeatures();
  }

  function removeFeature(key) {
    const hit = findFeature(key);
    if (!hit) return;
    if (editing && editing.key === key) editing = null;
    if (hit.mine) {
      const entry = hit.mine;
      Features.removeMine(entry.id);
      lastRemoved = { label: entry.result.name, undo: () => Features.restoreMine(entry) };
    } else {
      const before = hit.f.edited ? { ...hit.f } : null;
      Features.setEdit(key, { removed: true });
      // undo brings back your edits too
      lastRemoved = { label: hit.f.name, undo: () => Features.setEdit(key, before ? { name: before.name, detail: before.detail, why: before.why, missing: before.missing } : null) };
    }
    renderFeatures();
    renderToday(Insights.snapshot());
  }

  async function checkMine(key, text, id = null) {
    adding[key] = { text, busy: true };
    renderFeatures();
    try {
      const entry = await Features.checkOne(text, key, current, id);
      delete adding[key];
      renderFeatures();
      showFeature(entry.result.name);
      renderToday(Insights.snapshot());
    } catch (e) {
      adding[key] = { text, error: `Couldn't check it: ${e.message || e}` };
      renderFeatures();
    }
  }

  // reads the code when there's no list yet, or when the code changed and the list is over 6 hours old
  async function runFeatures(force = false) {
    const saved = Features.saved();
    if (!current || !Session.key) return;
    if (!force && saved && !(Features.stale(current) && Date.now() - saved.at > 6 * 3600000)) return;
    if (!force && featError) return;  // don't retry a failing check on every refresh - the button does
    const p = Features.run(current);
    renderFeatures();
    try { await p; featError = null; renderToday(Insights.snapshot()); }
    catch (e) { featError = e.message || String(e); }
    renderFeatures();
  }

  $("featRun").onclick = () => runFeatures(true);
  $("featBody").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) { featOpen[more.dataset.more] = true; renderFeatures(); return; }
    const add = e.target.closest("[data-add]");
    if (add) { adding[add.dataset.add] = { text: "", focus: true }; renderFeatures(); return; }
    const cancel = e.target.closest("[data-cancel]");
    if (cancel) { delete adding[cancel.dataset.cancel]; renderFeatures(); return; }
    const act = (sel) => e.target.closest(sel);
    if (act("[data-edit]")) return startEdit(act("[data-edit]").dataset.edit);
    if (act("[data-del]")) return removeFeature(act("[data-del]").dataset.del);
    if (act("[data-edit-cancel]")) { editing = null; return renderFeatures(); }
    if (act("[data-reset]")) { Features.setEdit(act("[data-reset]").dataset.reset, null); return renderFeatures(); }
    if (act("[data-restore]")) { Features.setEdit(act("[data-restore]").dataset.restore, null); lastRemoved = null; renderFeatures(); return renderToday(Insights.snapshot()); }
    if (act("[data-undo]")) { lastRemoved.undo(); lastRemoved = null; renderFeatures(); return renderToday(Insights.snapshot()); }
    if (act("[data-undo-close]")) { lastRemoved = null; return renderFeatures(); }
    const again = e.target.closest("[data-recheck]");
    if (again) {
      const m = Features.mine().find((x) => x.id === again.dataset.recheck);
      if (m) checkMine(VERDICT_COL[m.result.status], m.asked, m.id);
      return;
    }
    const ex = e.target.closest("[data-explain]");
    if (ex) return Explain.ask("feature", ex.dataset.explain);
    const sc = e.target.closest("[data-screen]");
    if (sc) {
      const n = (readJson("sm.summary")?.graph?.nodes || []).find((x) => x.id === sc.dataset.screen);
      if (n) openScreenSheet(n);
    }
  });

  $("featBody").addEventListener("input", (e) => {
    const form = e.target.closest("[data-form]");
    if (form) adding[form.dataset.form].text = e.target.value;
    if (e.target.dataset.field && editing) editing[e.target.dataset.field] = e.target.value;
  });
  $("featBody").addEventListener("submit", (e) => {
    if (e.target.closest("[data-edit-form]")) { e.preventDefault(); document.activeElement.blur(); return saveEdit(); }
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.form, text = adding[key].text.trim();
    if (text.length < 4) { adding[key].error = "Write a few words about the feature."; adding[key].focus = true; document.activeElement.blur(); renderFeatures(); return; }
    document.activeElement.blur();
    checkMine(key, text);
  });
  $("featBody").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.closest("[data-form] textarea, [data-edit-form] textarea")) e.target.form.requestSubmit();
    if (e.key === "Escape" && e.target.closest("[data-edit-form]")) { editing = null; document.activeElement.blur(); renderFeatures(); return; }
    if (e.key === "Escape" && e.target.closest("[data-form]")) { delete adding[e.target.closest("[data-form]").dataset.form]; document.activeElement.blur(); renderFeatures(); }
  });
  $("featBody").addEventListener("focusout", () => setTimeout(() => { if (featPending) renderFeatures(); }, 0));

  function showFeature(name) {
    for (const k of Object.keys(featOpen)) delete featOpen[k];
    FEAT_COLS.forEach(([k]) => (featOpen[k] = true));
    renderFeatures();
    const el = document.getElementById(`feat-${slug(name)}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  function renderHome() {
    const snap = Insights.record();
    renderToday(snap);
    renderTrends(snap);
    renderFeatures();
  }

  // "In progress" in the Today list jumps down to the features
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href="#features"]');
    if (!a) return;
    e.preventDefault();
    closeDialogs();
    $("features").scrollIntoView({ behavior: "smooth" });
  });

  // ---------------------------------------------------------------- one screen: its issues, its quiz, its links

  function openScreenSheet(node) {
    const sm = readJson("sm.summary"), dc = readJson("dc.summary");
    const nodes = sm?.graph?.nodes || [];
    const idx = nodes.findIndex((n) => n.id === node.id);
    const to = (sm?.graph?.edges || []).filter(([a]) => a === idx).map(([, b]) => nodes[b]);
    const from = (sm?.graph?.edges || []).filter(([, b]) => b === idx).map(([a]) => nodes[a]);
    $("ssKind").textContent = `${node.k === "dialog" ? "Pop-up" : node.k}${node.s ? " · app starts here" : ""}`;
    $("ssTitle").textContent = node.n;
    $("ssFile").textContent = node.f || "";

    const issues = (dc?.issues || []).filter((i) => i.s === node.id);
    const sevOrder = { blocker: 0, major: 1, minor: 2 };
    issues.sort((a, b) => sevOrder[a.v] - sevOrder[b.v]);
    const design = !dc
      ? `<p class="note">Design Critic hasn't reviewed your app yet.</p>`
      : issues.length
        ? `<div class="ss-issues">${issues.slice(0, 8).map((i) => `<a class="ss-issue" href="/design-critic/?issue=${encodeURIComponent(i.k)}"><i class="sev-${i.v[0]}"></i><span>${esc(i.t)}</span></a>`).join("")}${issues.length > 8 ? `<p class="note">+${issues.length - 8} more</p>` : ""}</div>`
        : `<p class="note good-note">No open design issues on this screen.</p>`;

    let quiz = `<p class="note">No code file found for this screen.</p>`;
    let quizBtn = "";
    if (node.f) {
      let known = 0, chunks = 0;
      try { const f = Quiz.mastery().files.find((x) => x.file === node.f); if (f) { known = f.known_pct; chunks = f.chunks; } } catch {}
      const rounds = (() => { try { return Object.values(allRounds()).filter((r) => r.chunk.file === node.f).sort((a, b) => b.round_id.localeCompare(a.round_id)); } catch { return []; } })();
      const past = rounds.slice(0, 4).map((r) => {
        const s = Object.values(r.answers || {}).filter((a) => a.feedback).map((a) => a.feedback.score);
        const avg = s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
        return `<div class="ss-round"><span>${esc(r.title || r.chunk.owner)}</span><small>${shortDate(r.date)}</small><b class="${avg == null ? "" : avg >= 80 ? "hi" : avg >= 50 ? "mid" : "lo"}">${avg ?? "–"}</b></div>`;
      }).join("");
      quiz = `<div class="ss-known"><div class="track"><i style="width:${Math.min(100, known)}%;background:var(--green)"></i></div><b>${pct(known)}</b><span>known · ${plural(chunks, "chunk")}</span></div>
        ${past ? `<div class="ss-rounds">${past}</div>` : `<p class="note">You haven't been quizzed on this screen's code yet.</p>`}`;
      quizBtn = `<a class="pill-btn dark" href="/code-check/?file=${encodeURIComponent(node.f)}">Quiz me on this screen</a>`;
    }
    const chips = (list) => list.length ? list.map((n) => `<button class="ev ev-screen" data-screen="${esc(n.id)}">${esc(n.n)}</button>`).join("") : `<span class="note">nothing</span>`;
    $("ssBody").innerHTML = `
      <section class="ss-sec">
        <div class="ss-h"><img src="/design-critic/icons/logo.svg" alt=""><h3>Design</h3><span>${plural(issues.length, "open issue")}</span></div>
        ${design}
        <a class="pill-btn" href="/design-critic/?screen=${encodeURIComponent(node.id)}">Review this screen</a>
      </section>
      <section class="ss-sec">
        <div class="ss-h"><img src="/code-check/icons/logo.svg" alt=""><h3>Your code</h3></div>
        ${quiz}
        ${quizBtn}
      </section>
      <section class="ss-sec">
        <div class="ss-h"><img src="/screen-map/icons/logo.svg" alt=""><h3>In the app</h3></div>
        <div class="ss-links"><span>Leads to</span><div class="evs">${chips(to)}</div></div>
        <div class="ss-links"><span>Reached from</span><div class="evs">${chips(from)}</div></div>
        <a class="pill-btn" href="/screen-map/?screen=${encodeURIComponent(node.id)}">Open in Screen Map</a>
      </section>`;
    const d = $("screenSheet");
    if (!d.open) d.showModal();
  }

  $("ssBody").addEventListener("click", (e) => {
    const sc = e.target.closest("[data-screen]");
    if (!sc) return;
    const n = (readJson("sm.summary")?.graph?.nodes || []).find((x) => x.id === sc.dataset.screen);
    if (n) openScreenSheet(n);
  });

  // ---------------------------------------------------------------- dialogs: close on ×, Esc, or a click outside

  function closeDialogs() { for (const d of document.querySelectorAll("dialog[open]")) d.close(); }
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
  }

  // ---------------------------------------------------------------- the morning: what's up today, for 10 seconds

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? "Up early" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }

  function showMorning() {
    const snap = Insights.snapshot();
    const todo = Insights.today(snap);
    const since = Insights.sinceLastTime(snap);
    const sunday = new Date().getDay() === 0;
    $("mDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    $("mTitle").textContent = `${greeting()}${current ? `, here's ${current.name}` : ""}`;
    $("mBody").innerHTML = `
      <div class="m-list">${todo.map((it) => itemHtml(it, "t-item")).join("")}</div>
      ${since && since.items.length ? `<p class="mini-h">${esc(since.label)}</p><div class="since-list">${since.items.slice(0, 6).map((it) => itemHtml(it, "s-pill")).join("")}</div>` : ""}`;
    const first = todo.find((t) => t.tone === "bad" || t.tone === "todo");
    $("mActions").innerHTML = `
      <button class="pill-btn" data-close>Close</button>
      ${sunday ? `<button class="pill-btn dark" id="mWeek">See your week</button>` : first ? `<a class="pill-btn dark" href="${esc(first.href)}">Start: ${esc(first.text)}</a>` : ""}`;
    $("mWeek")?.addEventListener("click", () => { $("morning").close(); showWeek(); });
    const timer = $("mTimer");
    timer.style.animation = "none"; void timer.offsetWidth; timer.style.animation = "";
    $("morning").showModal();
  }
  // the bar runs out in 10 s (paused while the mouse is on it), then it closes
  $("mTimer").addEventListener("animationend", () => $("morning").close());

  function maybeMorning() {
    if (evening) return;
    const today = isoDate(new Date());
    let last = null;
    try { last = localStorage.getItem("rd.morning"); } catch {}
    if (last === today) return;
    try { localStorage.setItem("rd.morning", today); } catch {}
    showMorning();
  }

  // ---------------------------------------------------------------- the week

  function sparkPath(points, W, H) {
    if (points.length < 2) return "";
    const vs = points.map((p) => p.v);
    let lo = Math.min(...vs), hi = Math.max(...vs);
    if (hi - lo < 1) { lo -= 1; hi += 1; }
    return points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * W).toFixed(1)} ${(4 + (1 - (p.v - lo) / (hi - lo)) * (H - 8)).toFixed(1)}`).join(" ");
  }

  function showWeek() {
    const w = Insights.week();
    const a = w.a || {}, b = w.b || Insights.snapshot();
    $("wTitle").textContent = `${shortDate(w.start)} – ${shortDate(w.end)}`;
    const delta = (x, y, f = (v) => v) => (x == null || y == null ? "" : y === x ? `<small>no change</small>` : `<small class="${y > x ? "up" : "down"}">${y > x ? "+" : "−"}${f(Math.abs(y - x))}</small>`);
    const files = [...w.code.added.map((p) => ["added", p]), ...w.code.edited.map((p) => ["edited", p]), ...w.code.removed.map((p) => ["removed", p])];
    $("wBody").innerHTML = `
      ${w.highlights.length ? `<div class="since-list wr-high">${w.highlights.map((it) => itemHtml(it, "s-pill")).join("")}</div>` : `<p class="note">${w.openedDays ? "A quiet week - nothing changed." : "Open Review Deck on a few days and your week fills in."}</p>`}
      <div class="wr-grid">
        <section class="wr-sec">
          <div class="ss-h"><img src="/code-check/icons/logo.svg" alt=""><h3>Quiz</h3></div>
          <div class="wr-days">${w.days.map((d) => `<div class="${d.met ? "met" : d.answered ? "some" : ""}"><i>${d.met ? "✓" : d.answered || ""}</i><span>${d.label}</span></div>`).join("")}</div>
          <div class="wr-stats">
            <div><b>${w.goalDays}<small>/7</small></b><span>goal days</span></div>
            <div><b>${w.answered}</b><span>answers</span></div>
            <div><b>${w.avg ?? "–"}</b><span>avg score</span></div>
            <div><b>${w.chunks}</b><span>chunks</span></div>
          </div>
          <p class="wr-line">Code known: <b>${a.cc ? pct(a.cc.known) : "–"} → ${b.cc ? pct(b.cc.known) : "–"}</b> ${delta(a.cc?.known, b.cc?.known, (v) => v.toFixed(1) + "%")}</p>
        </section>
        <section class="wr-sec">
          <div class="ss-h"><img src="/design-critic/icons/logo.svg" alt=""><h3>Design</h3></div>
          <div class="wr-grade">
            ${a.dc ? `<div class="grade grade-${a.dc.grade} sm"><b>${a.dc.grade}</b></div><span class="arrow-r">→</span>` : ""}
            ${b.dc ? `<div class="grade grade-${b.dc.grade} sm"><b>${b.dc.grade}</b></div>` : ""}
            <div><p class="wr-line">Score <b>${a.dc?.score ?? "–"} → ${b.dc?.score ?? "–"}</b> ${delta(a.dc?.score, b.dc?.score)}</p>
            ${w.score.length > 1 ? `<svg class="wr-spark" viewBox="0 0 160 36" preserveAspectRatio="none"><path d="${sparkPath(w.score, 160, 36)}"/></svg>` : ""}</div>
          </div>
          <div class="wr-stats">
            <div><b>${w.fixed ?? "–"}</b><span>fixed</span></div>
            <div><b>${w.fresh ?? "–"}</b><span>new issues</span></div>
            <div><b>${b.dc?.blockers ?? "–"}</b><span>blockers left</span></div>
          </div>
        </section>
        <section class="wr-sec">
          <div class="ss-h"><img src="/screen-map/icons/logo.svg" alt=""><h3>Screens</h3></div>
          <p class="wr-line">Screens <b>${a.sm?.screens ?? "–"} → ${b.sm?.screens ?? "–"}</b> ${delta(a.sm?.screens, b.sm?.screens)}</p>
          <p class="wr-line">Connections <b>${a.sm?.links ?? "–"} → ${b.sm?.links ?? "–"}</b> ${delta(a.sm?.links, b.sm?.links)}</p>
          ${w.newScreens.length ? `<p class="mini-h">New this week</p><div class="evs">${w.newScreens.map((n) => `<span class="ev ev-screen">${esc(n)}</span>`).join("")}</div>` : `<p class="note">No new screens this week.</p>`}
        </section>
        <section class="wr-sec">
          <div class="ss-h"><img src="icons/logo.svg" alt=""><h3>Code</h3></div>
          <div class="wr-stats">
            <div><b>${w.code.added.length}</b><span>added</span></div>
            <div><b>${w.code.edited.length}</b><span>edited</span></div>
            <div><b>${w.code.removed.length}</b><span>removed</span></div>
          </div>
          ${files.length ? `<div class="wr-files">${files.slice(0, 10).map(([k, p]) => `<div><i class="fk-${k}">${k}</i><span title="${esc(p)}">${esc(p.split("/").pop())}</span></div>`).join("")}${files.length > 10 ? `<p class="note">+${files.length - 10} more</p>` : ""}</div>` : `<p class="note">${DeckStore.canLink ? "No code changes picked up this week." : "Turn on auto-update to track code changes."}</p>`}
        </section>
      </div>`;
    $("weekReport").showModal();
  }

  $("weekBtn").onclick = showWeek;
  $("wPrint").onclick = () => { document.body.classList.add("printing-week"); window.print(); };
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-week"));

  // ---------------------------------------------------------------- the evening: keep the streak alive

  function showEvening() {
    history.replaceState(null, "", location.pathname);  // a reload is the normal home page
    let st;
    try { st = dailyStatus(); } catch { return; }
    const card = $("evCard");
    $("evening").hidden = false;
    if (st.goal_met) {
      card.innerHTML = `<div class="ev-icon good">✓</div><h2>Streak safe</h2><p>Today's quiz is done${st.streak ? ` - ${plural(st.streak, "day")} in a row` : ""}. See you tomorrow.</p>`;
      setTimeout(() => window.close(), 2500);  // the reminder window was opened just for this
      return;
    }
    const left = st.goal - st.today_answered;
    const title = st.streak ? `Your ${st.streak}-day streak ends tonight` : "You haven't quizzed today";
    const body = `Answer ${plural(left, "more question")} to ${st.streak ? "keep it going" : "start a streak"}.`;
    card.innerHTML = `
      <div class="ev-icon"><svg viewBox="0 0 24 24"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-5 .3 1.6 1 2.6 2 3C11 8 11.5 5 12 2Z"/></svg></div>
      <h2>${title}</h2><p>${body}</p>
      <div class="ev-actions"><button class="pill-btn" id="evLater">Not tonight</button><a class="pill-btn dark" href="/code-check/">Answer now</a></div>
      ${"Notification" in window && Notification.permission === "default" ? `<button class="link-btn" id="evAllow">Also show a Windows notification</button>` : ""}`;
    $("evLater").onclick = () => { $("evening").hidden = true; };
    const notify = () => {
      const n = new Notification(title, { body, icon: "icons/icon-192.png", tag: "rd-streak", requireInteraction: true });
      n.onclick = () => { window.focus(); location.href = "/code-check/"; };
    };
    if ("Notification" in window && Notification.permission === "granted") notify();
    $("evAllow")?.addEventListener("click", async () => {
      if (await Notification.requestPermission() === "granted") { $("evAllow").remove(); notify(); }
    });
  }

  // ---------------------------------------------------------------- sign in / new code

  let picked = null;   // [{path, file}] from the folder
  let mode = "signin"; // or "newcode"

  function showSetup(m) {
    mode = m;
    picked = null;
    $("setupDrop").classList.remove("ready");
    $("dropStatus").className = "drop-status";
    $("dropStatus").textContent = "Your files are kept in this browser. Review Deck sends your code to Google Gemini, with your own key, to list your features, explain code and make puzzles. This happens automatically after you sign in and when you open the hub.";
    $("setupError").hidden = true;
    $("setupTitle").textContent = m === "newcode" ? "New code" : "Get started";
    $("haveAcct").hidden = m === "newcode" || !Account.ready || Account.signedIn();
    $("setupLead").textContent = m === "newcode"
      ? "Pick the project folder again. Code Check, Screen Map and Design Critic all switch to the new code. Your key stays unless you change it."
      : "Your code and Gemini key, once. All three tools use them, and nothing asks again.";
    try { $("keyInput").value = (m === "newcode" ? Session.key : store.get("key")) || ""; } catch {}
    $("cancelSetup").hidden = m !== "newcode";
    $("startBtn").textContent = m === "newcode" ? "Use this code" : "Start";
    $("setup").hidden = false;
    $("deck").hidden = true;
    $("topActions").hidden = true;
    $("searchBox").hidden = true;
  }

  function showDeck(project) {
    $("setup").hidden = true;
    $("deck").hidden = false;
    $("topActions").hidden = false;
    $("searchBox").hidden = false;
    $("projectLine").textContent = project.linked
      ? `${project.name} · kept up to date with your folder · last change ${ago(project.savedAt)}`
      : `${project.name} · code from ${ago(project.savedAt)}`;
    fillCards(project);
    Explain.refresh();
  }

  async function takeFolder(items, dir = null) {
    const status = $("dropStatus"), drop = $("setupDrop");
    status.className = "drop-status";
    status.textContent = "Reading your code…";
    try {
      const read = await readProject(items);  // Code Check's filter: is there code to quiz on?
      if (!read.files.length || !allChunks(read.files).length) throw new Error("No code found there. Pick your project folder (the one with app/ in it).");
      picked = { items, read, dir };
      if (!$("nameInput").value || mode === "signin") $("nameInput").value = read.name || $("nameInput").value;
      drop.classList.add("ready");
      status.className = "drop-status ok";
      const res = items.filter(({ path }) => path.includes("/res/")).length;
      status.textContent = `✓ ${read.files.length} code files · ${read.lines.toLocaleString()} lines · ${res} resources and images`;
    } catch (e) {
      picked = null;
      drop.classList.remove("ready");
      status.className = "drop-status bad";
      status.textContent = e.message;
    }
  }

  async function submit(e) {
    e.preventDefault();
    const err = $("setupError"), btn = $("startBtn");
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    err.hidden = true;
    const key = $("keyInput").value.trim();
    if (!picked) return fail("Choose your project folder first.");
    if (!key) return fail("Paste your Gemini API key (step 2).");
    const label = btn.textContent;
    btn.disabled = true;
    try {
      if (mode === "signin" || key !== Session.key) { btn.textContent = "Checking your key…"; await checkKey(key); }
      btn.textContent = "Saving…";
      const { items, read, dir } = picked;
      const name = $("nameInput").value.trim() || read.name || "My project";
      const project = await DeckStore.save(name, items, dir);                    // for Screen Map and Design Critic
      await Session.save(key, { name, language: mainLanguage(read.files), files: read.files.length, lines: read.lines }, read.files);  // for Code Check
      showDeck(project);
      runFeatures();
    } catch (ex) {
      fail(ex.message || String(ex));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // the folder itself where the browser allows it, so Review Deck can read it again when your code changes
  async function chooseDir() {
    try { return await showDirectoryPicker({ id: "review-deck", mode: "read" }); }
    catch (e) { if (e.name === "AbortError") return null; throw e; }
  }

  $("pickFolder").onclick = async () => {
    if (!DeckStore.canLink) return $("folderInput").click();
    const dir = await chooseDir().catch(() => null);
    if (dir) takeFolder(await DeckStore.readDir(dir), dir);
  };
  $("folderInput").onchange = (e) => { if (e.target.files.length) takeFolder(filesFromInput(e.target.files)); e.target.value = ""; };
  const drop = $("setupDrop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const item = e.dataTransfer.items[0];
    const handle = DeckStore.canLink && item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : null;  // only during the drop
    const items = await filesFromDrop(e.dataTransfer);
    const dir = await handle;
    takeFolder(items, dir && dir.kind === "directory" ? dir : null);
  };
  $("setupForm").onsubmit = submit;
  $("newCode").onclick = () => showSetup("newcode");
  $("cancelSetup").onclick = () => start();

  // ---------------------------------------------------------------- keeping the code up to date
  // The linked folder is read again whenever Review Deck opens or comes back into view, and every
  // 30 seconds while it's showing. Anything added, edited or removed goes to all three tools.
  // Quiz progress stays: Code Check keeps its rounds, only the code underneath changes.

  let syncing = false;

  // what changed, for "since last time" and the week, and which new code Code Check should ask about first
  function noteChanges(before, beforeChunks, files) {
    if (!before.size) return;
    const now = new Map(files.map((f) => [f.path, f.code]));
    const added = [...now.keys()].filter((p) => !before.has(p));
    const edited = [...now.keys()].filter((p) => before.has(p) && before.get(p) !== now.get(p));
    const removed = [...before.keys()].filter((p) => !now.has(p));
    Insights.logChange({ added, edited, removed });
    const touched = new Set([...added, ...edited]);
    const fresh = Session.chunks.filter((c) => touched.has(c.file) && !beforeChunks.has(c.code));
    if (!fresh.length) return;
    fresh.sort((a, b) => isMarkup(a) - isMarkup(b));  // real code before layouts
    const focus = [...new Set([...fresh.map((c) => c.id), ...store.json("focus", [])])].slice(0, 40);
    store.setJson("focus", focus);
  }

  async function applyCode(items, dir) {
    const read = await readProject(items);
    if (!read.files.length || !allChunks(read.files).length) return;
    const before = new Map((Session.files || []).map((f) => [f.path, f.code]));
    const beforeChunks = new Set((Session.chunks || []).map((c) => c.code));
    const old = await DeckStore.project();
    const project = await DeckStore.save(old.name, items, dir);
    await Session.save(Session.key, { ...Session.project, name: old.name, language: mainLanguage(read.files), files: read.files.length, lines: read.lines }, read.files);
    noteChanges(before, beforeChunks, read.files);
    showDeck(project);
  }

  function syncButton(state) {
    const btn = $("syncBtn");
    btn.hidden = !DeckStore.canLink || state === "same" || state === "changed";
    btn.textContent = state === "ask" ? "Turn on auto-update" : "Auto-update code";
    btn.title = state === "ask"
      ? "Let Review Deck read your project folder again - choose \"Allow on every visit\" so it never asks again"
      : "Pick your project folder once - new code then shows up in all three tools on its own";
  }

  async function syncCode(ask = false) {
    if (syncing || $("deck").hidden || !DeckStore.canLink) return;
    syncing = true;
    try {
      const r = await DeckStore.rescan(ask);
      syncButton(r.state);
      // "same" but a tool already saved the new code: Code Check's copy still needs it
      const toolSaved = r.state === "same" && (await DeckStore.project())?.toolSaved;
      if (r.state === "changed" || toolSaved) await applyCode(r.items, r.dir);
    } catch (e) {
      console.warn("Review Deck: couldn't read your folder", e);
    } finally {
      syncing = false;
    }
  }

  $("syncBtn").onclick = async () => {
    if ($("syncBtn").textContent === "Turn on auto-update") return syncCode(true);
    const dir = await chooseDir().catch(() => null);  // older sign-in without a linked folder: link it now
    if (!dir) return;
    syncing = true;
    try { await applyCode(await DeckStore.readDir(dir), dir); syncButton("same"); }
    finally { syncing = false; }
  };

  setInterval(() => { if (!document.hidden) syncCode(); }, 30000);

  // ---------------------------------------------------------------- your account (account.js)
  // Saved to your account on its own; data from another device shows up here. "Open on phone"
  // shows a one-time QR code that signs your phone in with the same data.

  function toast(text, ms = 0) {
    const t = $("acctToast");
    t.textContent = text;
    t.hidden = !text;
    clearTimeout(toast.timer);
    if (text && ms) toast.timer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function accountButtons() {
    const on = Account.ready;
    $("phoneBtn").hidden = !on || Account.isPhone();
    $("acctBtn").hidden = !on;
    $("haveAcct").hidden = !on || Account.signedIn();
    const email = Account.email();
    $("acctBtn").textContent = Account.signedIn() ? "Account" : "Log in";
    $("acctBtn").title = Account.signedIn() ? `Signed in as ${email} - your data is saved to this account` : "Log in or sign up to save your data to an account";
  }

  // a project that came from your account: Code Check needs its own copy of the code
  async function rebuildCodeCheck() {
    const saved = await DeckStore.load();
    const key = store.get("key");
    if (!saved || !key) return;
    const read = await readProject(saved.items);
    if (!read.files.length) return;
    const was = store.json("project", {}) || {};
    await Session.save(key, { ...was, name: saved.project.name, language: mainLanguage(read.files), files: read.files.length, lines: read.lines }, read.files);
  }

  Account.onData(async (r) => {
    if (r.adopted) await rebuildCodeCheck();
    RDTheme.set(RDTheme.get());   // the theme may have come with it
    start();
  });

  // ---- the "want to sign up?" pop-up, for anyone who used Review Deck before accounts
  function maybeAskSignup() {
    if (!Account.shouldAsk() || evening) return;
    const ask = () => { if (!document.querySelector("dialog[open]") && !$("deck").hidden) $("askSignup").showModal(); };
    if ($("morning").open) $("morning").addEventListener("close", () => setTimeout(ask, 600), { once: true });
    else setTimeout(ask, 1200);
  }
  $("asLater").onclick = () => { Account.snooze(false); $("askSignup").close(); };
  $("asNever").onclick = () => { Account.snooze(true); $("askSignup").close(); };
  $("asYes").onclick = () => Account.snooze(false);
  $("askSignup").addEventListener("cancel", () => Account.snooze(false));

  // ---- open on phone
  let qrLib = null;
  function loadQr() {
    qrLib ||= new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
      s.onload = () => ok(window.qrcode);
      s.onerror = () => { qrLib = null; fail(new Error("Couldn't load the QR code maker. Check your connection.")); };
      document.head.appendChild(s);
    });
    return qrLib;
  }

  let stopWatch = null;
  async function showPhone() {
    const body = $("phBody");
    if (!$("phoneSheet").open) $("phoneSheet").showModal();
    if (!Account.signedIn()) {
      $("phTitle").textContent = "Sign in first";
      body.innerHTML = `
        <p class="ph-text">Your phone opens Review Deck with your project and progress from your account. Sign up (or log in) on this computer first - it takes a few seconds.</p>
        <div class="ask-actions"><a class="pill-btn" href="account.html">Log in</a><a class="pill-btn dark" href="account.html#signup">Sign up</a></div>`;
      return;
    }
    $("phTitle").textContent = "Scan with your phone";
    body.innerHTML = busy("Saving your latest data to your account…");
    try {
      const [link, qrcode] = await Promise.all([Account.phoneLink(), loadQr()]);
      const qr = qrcode(0, "M");
      qr.addData(link.url);
      qr.make();
      body.innerHTML = `
        <div class="ph-qr">${qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true })}</div>
        <p class="ph-text">Point your phone's camera at the code and open the link. Review Deck opens there signed in as <b>${esc(Account.email())}</b>, with your project, progress and Gemini key.</p>
        <p class="note">The code works once, for ${Account.LINK_MINUTES} minutes. For another phone, open this again.</p>`;
      stopWatch?.();
      stopWatch = link.watch(() => {
        $("phTitle").textContent = "Your phone is connected";
        body.innerHTML = `<p class="ph-text">✓ Review Deck is opening on your phone with your data. From now on, what you do on either one is saved to your account.</p>
          <div class="ask-actions"><button class="pill-btn dark" data-close>Done</button></div>`;
      });
    } catch (e) {
      if (e.code === "signin") { accountButtons(); return showPhone(); }
      body.innerHTML = `<p class="setup-error">${esc(e.message || e)}</p><div class="ask-actions"><button class="pill-btn" id="phRetry">Try again</button></div>`;
      $("phRetry").onclick = () => showPhone();
    }
  }
  $("phoneSheet").addEventListener("close", () => { stopWatch?.(); stopWatch = null; });
  $("phoneBtn").onclick = () => showPhone();

  // ---- arriving on the phone from the QR code
  async function arriveFromPhoneLink() {
    if (!/^#phone=/.test(location.hash)) return false;
    toast("Signing you in and bringing your data…");
    let r = null;
    try {
      r = await Account.takeLink();
      toast("You're signed in - everything from your computer is here.", 5000);
    } catch (e) {
      toast(e.message || String(e), 12000);
    }
    accountButtons();
    return !!(r && (r.applied || r.adopted));  // then the data listener starts the page
  }

  async function accountSync() {
    if (!Account.signedIn()) return;
    try { await Account.sync(); } catch (e) { console.warn("Review Deck account: couldn't save", Account.friendly(e), e); }
    accountButtons();
  }

  // ---------------------------------------------------------------- start

  let started = false;
  async function start() {
    const project = await DeckStore.project();
    const signedIn = project && await Session.load().catch(() => false);
    accountButtons();
    if (!signedIn) return showSetup("signin");
    DeckStore.keepForever();
    showDeck(project);
    if (!started) {
      started = true;
      if (evening) showEvening(); else maybeMorning();
      maybeAskSignup();
    }
    await syncCode();
    accountSync();
    runFeatures();
  }

  Search.init({ screen: openScreenSheet, feature: showFeature, explain: Explain.ask });
  FindGame.init();
  Explain.init({ evidence, screen: openScreenSheet });

  // coming back from a tool shows fresh numbers
  window.addEventListener("pageshow", (e) => { if (e.persisted && !$("deck").hidden) start(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("deck").hidden) start(); });

  // installable app
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  window.ReviewDeck = { start };
  Account.autoSave();
  arriveFromPhoneLink().then((came) => { if (!came) start(); });
})();
