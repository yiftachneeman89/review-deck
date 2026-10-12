// Review Deck search: one box for screens, code files, design issues, quiz topics and features.
// Everything comes from what the tools already saved, so results show up instantly.

const Search = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

  const GROUPS = { screen: "Screens", issue: "Design issues", file: "Code files", topic: "Quiz topics", feature: "Features" };
  const SEV = { blocker: "Blocker", major: "Major", minor: "Minor" };
  let onScreen = () => {};  // set by app.js: opens the screen panel
  let onFeature = () => {};

  function index() {
    const out = [];
    const sm = json("sm.summary");
    for (const n of sm?.graph?.nodes || []) {
      out.push({ type: "screen", title: n.n, sub: `${n.k === "dialog" ? "Pop-up" : n.k[0].toUpperCase() + n.k.slice(1)}${n.s ? " · app starts here" : ""}`, words: `${n.n} ${n.id || ""}`, run: () => onScreen(n) });
    }
    for (const i of json("dc.summary")?.issues || []) {
      out.push({ type: "issue", title: i.t, sub: `${SEV[i.v]} · ${i.n}`, words: `${i.t} ${i.n} ${i.c}`, href: `/design-critic/?issue=${encodeURIComponent(i.k)}`, sev: i.v });
    }
    let known = {};
    try { known = Object.fromEntries(Quiz.mastery().files.map((f) => [f.file, f.known_pct])); } catch {}
    for (const f of Session.files || []) {
      const parts = f.path.split("/");
      out.push({ type: "file", title: parts.pop(), sub: `${parts.slice(-3).join("/")} · ${Math.round(known[f.path] || 0)}% known · quiz on it`, words: f.path, href: `/code-check/?file=${encodeURIComponent(f.path)}` });
    }
    const seen = new Set();
    try {
      for (const r of Object.values(allRounds()).sort((a, b) => b.round_id.localeCompare(a.round_id))) {
        if (!r.title || seen.has(r.title)) continue;
        seen.add(r.title);
        const scores = Object.values(r.answers || {}).filter((a) => a.feedback).map((a) => a.feedback.score);
        const avg = scores.length ? ` · scored ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}` : "";
        out.push({ type: "topic", title: r.title, sub: `${r.chunk.file.split("/").pop()} · ${r.date}${avg}`, words: `${r.title} ${r.chunk.owner} ${r.chunk.file} ${r.questions.map((q) => q.question).join(" ")}`, href: `/code-check/?file=${encodeURIComponent(r.chunk.file)}` });
      }
    } catch {}
    for (const m of json("rd.features.mine") || []) {
      out.push({ type: "feature", title: m.result.name, sub: `Yours · ${m.result.percent}% there`, words: `${m.result.name} ${m.asked} ${m.result.detail}`, run: () => onFeature(m.result.name) });
    }
    const feats = json("rd.features")?.result;
    for (const [list, label] of [["built", "Built"], ["in_progress", "In progress"], ["recommended", "Recommended"]]) {
      for (const f of feats?.[list] || []) out.push({ type: "feature", title: f.name, sub: label, words: `${f.name} ${f.detail || f.why || ""} ${(f.screens || []).join(" ")}`, run: () => onFeature(f.name) });
    }
    return out;
  }

  function find(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const hits = [];
    for (const item of index()) {
      const title = item.title.toLowerCase(), hay = `${title} ${item.words.toLowerCase()}`;
      if (!words.every((w) => hay.includes(w))) continue;
      const score = (title.startsWith(words[0]) ? 0 : title.includes(words[0]) ? 1 : 2) + (item.type === "topic" ? 0.5 : 0);
      hits.push({ ...item, score });
    }
    hits.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
    const per = {};
    return hits.filter((h) => (per[h.type] = (per[h.type] || 0) + 1) <= 5);
  }

  let results = [], active = 0;

  function render() {
    const box = $("searchResults"), q = $("searchInput").value.trim();
    if (!q) { box.hidden = true; return; }
    results = find(q);
    active = Math.min(active, Math.max(0, results.length - 1));
    box.hidden = false;
    if (!results.length) { box.innerHTML = `<p class="sr-empty">Nothing matches “${esc(q)}”.</p>`; return; }
    let html = "", group = null;
    // grouped in a fixed order
    const order = Object.keys(GROUPS);
    results.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.score - b.score);
    results.forEach((r, i) => {
      if (r.type !== group) { group = r.type; html += `<p class="sr-group">${GROUPS[group]}</p>`; }
      html += `<a class="sr-item ${i === active ? "on" : ""}" data-i="${i}" href="${r.href || "#"}" role="option"><i class="sr-ic sr-${r.type} ${r.sev ? "sev-" + r.sev[0] : ""}"></i><span><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span></a>`;
    });
    box.innerHTML = html;
  }

  function go(i) {
    const r = results[i];
    if (!r) return;
    close();
    if (r.run) r.run(); else location.href = r.href;
  }

  function close() { $("searchResults").hidden = true; $("searchInput").blur(); }

  function init(handlers) {
    onScreen = handlers.screen;
    onFeature = handlers.feature;
    const input = $("searchInput");
    input.addEventListener("input", () => { active = 0; render(); });
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = Math.max(0, Math.min(results.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
        render();
        $("searchResults").querySelector(".sr-item.on")?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") { e.preventDefault(); go(active); }
      else if (e.key === "Escape") { input.value = ""; close(); }
    });
    $("searchResults").addEventListener("click", (e) => {
      const a = e.target.closest(".sr-item");
      if (!a) return;
      e.preventDefault();
      go(Number(a.dataset.i));
    });
    $("searchResults").addEventListener("mousemove", (e) => {
      const a = e.target.closest(".sr-item");
      if (a && Number(a.dataset.i) !== active) { active = Number(a.dataset.i); for (const x of $("searchResults").querySelectorAll(".sr-item")) x.classList.toggle("on", x === a); }
    });
    document.addEventListener("mousedown", (e) => { if (!e.target.closest(".search")) $("searchResults").hidden = true; });
    // "/" or Ctrl+K jumps to the search box
    document.addEventListener("keydown", (e) => {
      if ($("deck").hidden || e.target.closest("input, textarea, dialog")) return;
      if (e.key === "/" || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); input.focus(); input.select(); }
    });
  }

  return { init };
})();
