// Review Deck: sign in once (project folder + Gemini key), then Code Check, Screen Map and
// Design Critic all use that project. All four sites live on yiftachneeman89.github.io, so they
// share this browser's storage: the project in DeckStore (shared.js), the key and quiz in Code Check's store.

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- white / black mode

  function setTheme(theme) {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("rd.theme", theme); } catch {}
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#0e0e0f" : "#f4f3ef";
    for (const b of document.querySelectorAll("[data-theme-choice]")) b.classList.toggle("on", b.dataset.themeChoice === theme);
  }
  for (const b of document.querySelectorAll("[data-theme-choice]")) b.onclick = () => setTheme(b.dataset.themeChoice);
  setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

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
  const row = (label, value) => `<div class="row"><span>${label}</span><b>${value}</b></div>`;
  const bar = (parts) => `<div class="bar">${parts.map(([w, cls]) => `<i class="${cls}" style="width:${Math.max(0, Math.min(100, w))}%"></i>`).join("")}</div>`;
  const busy = (text) => `<div class="busy"><i></i>${text}</div>`;

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
    const touched = m.files.filter((f) => f.known_pct > 0).length;
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
    const boxes = g.nodes.map((node, i) => {
      const p = pos[i];
      return `<g class="node ${node.s ? "start" : ""}"><title>${esc(node.n)}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${nodeH}" rx="4"/><rect x="${p.x}" y="${p.y}" width="3.5" height="${nodeH}" rx="1.5" fill="${KIND_COLOR[node.k] || "var(--ink-3)"}"/></g>`;
    }).join("");
    return `<svg class="minimap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g class="edges">${lines}</g>${boxes}</svg>`;
  }

  function screenMapDetails(s) {
    $("info-screen-map").textContent = `${plural(s.screens, "screen")} and ${plural(s.links, "connection")}`;
    const kinds = [["activity", s.activities, s.activities === 1 ? "activity" : "activities"], ["fragment", s.fragments, s.fragments === 1 ? "fragment" : "fragments"], ["dialog", s.dialogs, s.dialogs === 1 ? "pop-up" : "pop-ups"]].filter(([, c]) => c);
    $("det-screen-map").innerHTML = `
      ${s.graph ? `<div class="map-wrap">${miniMap(s.graph)}</div>` : ""}
      <div class="kinds">${kinds.map(([k, c, label]) => `<span><i style="background:${KIND_COLOR[k]}"></i><b>${c}</b> ${label}</span>`).join("")}</div>
      <div class="tiles">
        <div class="tile"><span>Connections</span><b>${s.links}</b><p class="tile-sub">${s.autoLinks != null ? `${s.autoLinks} automatic` : "taps and jumps"}</p></div>
        <div class="tile"><span>Buttons</span><b>${s.buttons ?? "–"}</b><p class="tile-sub">with code</p></div>
        <div class="tile"><span>Starts at</span><b class="small">${esc(s.start || "–")}</b></div>
        <div class="tile ${s.unreachable && s.unreachable.length ? "warn" : ""}"><span>Unreachable</span><b class="${s.unreachable && s.unreachable.length ? "small" : ""}">${s.unreachable ? (s.unreachable.length ? esc(s.unreachable[0]) + (s.unreachable.length > 1 ? ` +${s.unreachable.length - 1}` : "") : "0") : "–"}</b><p class="tile-sub">${s.layouts != null ? `${s.layouts} XML layouts` : ""}</p></div>
      </div>`;
  }

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
    const onStore = (e) => { if (e.key === key) { finish(); refreshTools(); } };
    const timer = setTimeout(() => { finish(); $(`det-${tool}`).innerHTML = `<p class="note">Open it once to see the details.</p>`; }, 180000);
    window.addEventListener("storage", onStore);
    document.body.append(frame);
  }

  let current = null;
  function refreshTools() {
    if (!current) return;
    const fresh = (s, field) => s && s.at >= current.savedAt && s[field] !== undefined;  // older summaries lack the chart data
    const sm = readJson("sm.summary"), dc = readJson("dc.summary");
    if (fresh(sm, "graph")) screenMapDetails(sm); else runInBackground("screen-map", "sm.summary", "Mapping your screens…");
    // one at a time: the review starts after the map is done
    if (fresh(dc, "top")) designCriticDetails(dc);
    else if (fresh(sm, "graph")) runInBackground("design-critic", "dc.summary", "Reviewing your design…");
    else $("det-design-critic").innerHTML = busy("Waiting to review your design…");
  }

  function fillCards(project) {
    current = project;
    try { codeCheckDetails(); } catch { /* keeps its tagline */ }
    refreshTools();
  }

  // ---------------------------------------------------------------- sign in / new code

  let picked = null;   // [{path, file}] from the folder
  let mode = "signin"; // or "newcode"

  function showSetup(m) {
    mode = m;
    picked = null;
    $("setupDrop").classList.remove("ready");
    $("dropStatus").className = "drop-status";
    $("dropStatus").textContent = "Nothing is uploaded. The files are read and kept right here in your browser.";
    $("setupError").hidden = true;
    $("setupTitle").textContent = m === "newcode" ? "New code" : "Sign in";
    $("setupLead").textContent = m === "newcode"
      ? "Pick the project folder again. Code Check, Screen Map and Design Critic all switch to the new code. Your key stays unless you change it."
      : "Your code and Gemini key, once. All three tools use them, and nothing asks again.";
    try { $("keyInput").value = (m === "newcode" ? Session.key : store.get("key")) || ""; } catch {}
    $("cancelSetup").hidden = m !== "newcode";
    $("startBtn").textContent = m === "newcode" ? "Use this code" : "Start";
    $("setup").hidden = false;
    $("deck").hidden = true;
    $("topActions").hidden = true;
  }

  function showDeck(project) {
    $("setup").hidden = true;
    $("deck").hidden = false;
    $("topActions").hidden = false;
    $("projectLine").textContent = `${project.name} · code from ${ago(project.savedAt)}`;
    fillCards(project);
  }

  async function takeFolder(items) {
    const status = $("dropStatus"), drop = $("setupDrop");
    status.className = "drop-status";
    status.textContent = "Reading your code…";
    try {
      const read = await readProject(items);  // Code Check's filter: is there code to quiz on?
      if (!read.files.length || !allChunks(read.files).length) throw new Error("No code found there. Pick your project folder (the one with app/ in it).");
      picked = { items, read };
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
      const { items, read } = picked;
      const name = $("nameInput").value.trim() || read.name || "My project";
      const project = await DeckStore.save(name, items);                      // for Screen Map and Design Critic
      await Session.save(key, { name, language: mainLanguage(read.files), files: read.files.length, lines: read.lines }, read.files);  // for Code Check
      showDeck(project);
    } catch (ex) {
      fail(ex.message || String(ex));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  $("pickFolder").onclick = () => $("folderInput").click();
  $("folderInput").onchange = (e) => { if (e.target.files.length) takeFolder(filesFromInput(e.target.files)); e.target.value = ""; };
  const drop = $("setupDrop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => { e.preventDefault(); drop.classList.remove("over"); takeFolder(await filesFromDrop(e.dataTransfer)); };
  $("setupForm").onsubmit = submit;
  $("newCode").onclick = () => showSetup("newcode");
  $("cancelSetup").onclick = () => start();

  // ---------------------------------------------------------------- start

  async function start() {
    const project = await DeckStore.project();
    const signedIn = project && await Session.load().catch(() => false);
    if (!signedIn) return showSetup("signin");
    DeckStore.keepForever();
    showDeck(project);
  }

  // coming back from a tool shows fresh numbers
  window.addEventListener("pageshow", (e) => { if (e.persisted && !$("deck").hidden) start(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("deck").hidden) start(); });

  // installable app
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  window.ReviewDeck = { start };
  start();
})();
