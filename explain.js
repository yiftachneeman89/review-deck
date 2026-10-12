// Review Deck "Explain": pick a class, or describe a feature in your own words, and Gemini walks you
// through it in your own code - what it's for, how it works step by step (with the real lines), what
// it uses and what uses it, and what to watch out for. You can ask follow-up questions under it.
// Explanations are kept in "rd.explain" (newest first) so you can open them again without waiting.

const Explain = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const KEY = "rd.explain";
  const KEEP = 20;
  const CLASS_BUDGET = 260000;  // chars of code sent when explaining one class (it + its neighbours)

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, KEEP))); } catch {} };
  const json = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const base = (path) => path.split("/").pop().replace(/\.\w+$/, "");
  const ago = (t) => {
    const s = (Date.now() - t) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : `${d} days ago`;
  };

  let handlers = { evidence: () => "", screen: () => {} };  // from app.js
  let mode = "class";
  let st = { phase: "idle" };  // idle | loading | show | error; show/loading carry the entry id
  let followBusy = false, followError = "";

  // ---------------------------------------------------------------- what Gemini gets to read

  const codeFile = (path) => !/\.(xml|html?|css|scss|less|json|gradle|kts|properties|toml)$/.test(path) && !/\/(test|androidTest)\//.test(path);
  const numbered = (code) => code.split("\n").map((l, i) => `${i + 1}| ${l}`).join("\n");

  function classes() {
    return (Session.files || []).filter((f) => codeFile(f.path)).map((f) => {
      const parts = f.path.split("/");
      return { path: f.path, name: parts.pop().replace(/\.\w+$/, ""), group: parts.slice(-1)[0] || "" };
    }).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  function fileOf(path) {
    if (!path) return null;
    const files = Session.files || [];
    return files.find((f) => f.path === path) || files.find((f) => f.path.endsWith("/" + path.replace(/^\/+/, ""))) || files.find((f) => f.path.split("/").pop() === path.split("/").pop());
  }

  function mapText() {
    const sm = json("sm.summary");
    if (!sm?.graph) return "(not mapped yet)";
    return sm.graph.nodes.map((n, i) => {
      const to = sm.graph.edges.filter(([a]) => a === i).map(([, b]) => sm.graph.nodes[b].n);
      return `- ${n.n} (${n.k}${n.s ? ", start screen" : ""}${n.f ? `, ${n.f}` : ""}) -> ${to.join(", ") || "nothing"}`;
    }).join("\n");
  }

  // which classes this one uses, and which use it - found by name, so it's exact
  function links(path) {
    const target = fileOf(path);
    if (!target) return { uses: [], usedBy: [] };
    const name = base(target.path);
    const others = (Session.files || []).filter((f) => f !== target && codeFile(f.path));
    const word = (w) => new RegExp(`\\b${w.replace(/[^\w]/g, "")}\\b`);
    return {
      uses: others.filter((f) => base(f.path).length > 2 && word(base(f.path)).test(target.code)).map((f) => f.path),
      usedBy: others.filter((f) => word(name).test(f.code)).map((f) => f.path),
    };
  }

  // the class in full, then its layouts and the classes around it, as far as the budget goes
  function classContext(path) {
    const target = fileOf(path);
    const { uses, usedBy } = links(path);
    const layoutNames = new Set([
      ...[...target.code.matchAll(/R\.layout\.(\w+)/g)].map((m) => m[1]),
      ...[...target.code.matchAll(/\b(\w+)Binding\b/g)].map((m) => m[1].replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()),
    ]);
    const layouts = (Session.files || []).filter((f) => /\/res\/layout[^/]*\//.test(f.path) && layoutNames.has(base(f.path)));
    const parts = [`=== ${target.path} (THE CLASS TO EXPLAIN)\n${numbered(target.code)}`];
    let used = parts[0].length, skipped = 0;
    for (const f of [...layouts, ...uses.map(fileOf), ...usedBy.map(fileOf)]) {
      const body = codeFile(f.path) ? numbered(f.code) : f.code;
      if (used + body.length > CLASS_BUDGET) { skipped++; continue; }
      used += body.length;
      parts.push(`=== ${f.path}\n${body}`);
    }
    const p = Session.project || {};
    return `App: ${p.name || "my app"} (${p.language || "unknown language"}, ${p.files} files)

Screens and where their buttons lead:
${mapText()}

Uses: ${uses.map(base).join(", ") || "no other classes of the app"}
Used by: ${usedBy.map(base).join(", ") || "nothing else in the app"}

Every code file in the app:
${classes().map((c) => c.path).join("\n")}

The code (each line starts with its line number; ${skipped ? `${skipped} related files left out for length` : "nothing left out"}):
${parts.join("\n\n")}`;
  }

  const context = (entry) => entry.kind === "class" ? classContext(entry.target) : Features.context(true).prompt;

  // ---------------------------------------------------------------- asking Gemini

  const SYSTEM = `You explain a developer's own app code back to them, like a patient senior colleague sitting next to them.
They ask about ONE class, or about a feature described in their own words. Code lines are given as "12| code" - use those numbers.
- title: what it is, in a few words (for a class, its name and what it is, e.g. "LessonActivity - the lesson screen").
- summary: one plain sentence - what it's for, from the user's point of view where possible.
- overview: 2-4 sentences: the big picture of how it works and why it's built this way.
- steps: 2-7 steps that walk through how it works in the order things happen (e.g. the screen opens, data loads, a tap is handled, a result is saved). Each step: a short title, 1-3 sentences explaining it plainly (name the methods and variables involved, explain any Android or library idea the first time it appears), and the exact file path and first/last line numbers of the code that does it (smallest block, at most 25 lines). Use file "" and 0 when a step has no single place in the code.
- parts: the most important pieces (methods for a class; classes, layouts or files for a feature), each with its role in one sentence.
- screens: names of the screens involved (use the screen names given).
- watch_out: real things to be careful about that you can see in THIS code - bugs, edge cases, state lost on rotation, work on the main thread, null risks, duplicated logic. Empty when there's nothing real. Never generic advice.
- followups: 3 short questions the developer might want to ask next about this.
For a feature: find where the app does it across all files. If the app doesn't have it, say so in summary and overview, explain what exists closest to it, and leave steps empty if there's nothing.
Plain, friendly English, short sentences. Never invent code, files or line numbers.`;

  const SCHEMA = {
    type: "object",
    properties: {
      title: { type: "string" }, summary: { type: "string" }, overview: { type: "string" },
      steps: { type: "array", items: { type: "object", properties: {
        title: { type: "string" }, text: { type: "string" }, file: { type: "string" }, start: { type: "integer" }, end: { type: "integer" },
      }, required: ["title", "text", "file", "start", "end"] } },
      parts: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, file: { type: "string" }, role: { type: "string" },
      }, required: ["name", "file", "role"] } },
      screens: { type: "array", items: { type: "string" } },
      watch_out: { type: "array", items: { type: "string" } },
      followups: { type: "array", items: { type: "string" } },
    },
    required: ["title", "summary", "overview", "steps", "parts", "screens", "watch_out", "followups"],
  };

  const FOLLOW_SCHEMA = {
    type: "object",
    properties: {
      answer: { type: "string", description: "2-6 plain sentences" },
      file: { type: "string", description: "the file of the most relevant code, or empty" },
      start: { type: "integer" }, end: { type: "integer" },
    },
    required: ["answer", "file", "start", "end"],
  };

  // line ranges Gemini gives back, checked against the real file
  function place(file, start, end) {
    const f = fileOf(file);
    if (!f || !start) return null;
    const n = f.code.split("\n").length;
    let a = Math.max(1, Math.min(n, start | 0)), b = Math.max(1, Math.min(n, end | 0 || a));
    if (a > b) [a, b] = [b, a];
    return { file: f.path, start: a, end: Math.min(b, a + 39) };
  }

  function clean(r) {
    r.steps = (r.steps || []).map((s) => ({ title: s.title, text: s.text, at: place(s.file, s.start, s.end) }));
    r.parts = (r.parts || []).map((p) => ({ ...p, file: fileOf(p.file)?.path || "" }));
    return r;
  }

  const sameAsk = (e, kind, target) => e.kind === kind && e.target.trim().toLowerCase() === target.trim().toLowerCase();

  async function ask(kind, target, { fresh = false, scroll = true } = {}) {
    target = String(target || "").trim();
    if (!target || st.phase === "loading") return;
    if (kind === "class" && !fileOf(target)) return;
    if (kind === "class") target = fileOf(target).path;
    mode = kind;
    renderForm(target);
    if (scroll) $("explain").scrollIntoView({ behavior: "smooth", block: "start" });
    const project = await DeckStore.project().catch(() => null);
    const old = read().find((e) => sameAsk(e, kind, target));
    if (old && !fresh) { show(old.id); return; }
    const entry = { id: `x${Date.now().toString(36)}`, kind, target, at: Date.now(), savedAt: project?.savedAt || 0, follow: [] };
    st = { phase: "loading", entry };
    followError = "";
    render();
    try {
      const label = kind === "class" ? `The class to explain: ${target}` : `The feature to explain, in the developer's words:\n"${target}"`;
      entry.result = clean(await askGemini(Session.key, SYSTEM, `${label}\n\n${context(entry)}`, SCHEMA));
      write([entry, ...read().filter((e) => !sameAsk(e, kind, target))]);
      st = { phase: "show", id: entry.id };
    } catch (e) {
      st = { phase: "error", error: e.message || String(e), kind, target };
    }
    render();
  }

  async function follow(question) {
    const entry = read().find((e) => e.id === st.id);
    question = question.trim();
    if (!entry || !question || followBusy) return;
    followBusy = true;
    followError = "";
    render();
    try {
      const r = entry.result;
      const before = entry.follow.map((f) => `Q: ${f.q}\nA: ${f.answer}`).join("\n\n");
      const prompt = `You already explained ${entry.kind === "class" ? `the class ${entry.target}` : `the feature "${entry.target}"`}:
${r.title} - ${r.summary}
${r.overview}
Steps: ${r.steps.map((s, i) => `${i + 1}. ${s.title}`).join("; ")}
${before ? `\nEarlier questions:\n${before}\n` : ""}
The developer now asks: "${question}"
Answer it from the code below, plainly and specifically. Point at the most relevant lines (file and first/last line, at most 25 lines), or file "" and 0 when no single place fits.

${context(entry)}`;
      const a = await askGemini(Session.key, SYSTEM, prompt, FOLLOW_SCHEMA);
      const all = read();
      const e = all.find((x) => x.id === entry.id);
      e.follow.push({ q: question, answer: a.answer, at: place(a.file, a.start, a.end) });
      write(all);
    } catch (e) {
      followError = e.message || String(e);
    } finally {
      followBusy = false;
      render();
      const box = $("exFollowText");
      if (box && followError) box.value = question;
    }
  }

  // ---------------------------------------------------------------- drawing

  function snippet(at, label = "") {
    if (!at) return "";
    const f = fileOf(at.file);
    if (!f) return "";
    const lines = f.code.split("\n").slice(at.start - 1, at.end);
    const text = lines.join("\n");
    let html = esc(text);
    try { if (window.hljs) html = hljs.highlight(text, { language: hljs.getLanguage(f.lang) ? f.lang : "plaintext", ignoreIllegals: true }).value; } catch {}
    const nums = lines.map((_, i) => at.start + i).join("\n");
    return `<div class="fg-code ex-code">
      <div class="fg-file"><span>${esc(at.file.split("/").pop())}</span><small>${label || `line${at.end > at.start ? `s ${at.start}–${at.end}` : ` ${at.start}`}`}</small>
        <a class="ex-open" href="/code-check/?file=${encodeURIComponent(at.file)}" title="Quiz me on ${esc(at.file)}">Quiz me</a></div>
      <div class="fg-scroll"><div class="fg-inner"><div class="fg-gutter">${nums}</div><pre><code>${html}</code></pre></div></div>
    </div>`;
  }

  const classChip = (path) => `<button class="ev ev-file" data-ex-class="${esc(path)}" title="Explain ${esc(path)}">${esc(base(path))}</button>`;

  function classSelect(selected) {
    let html = `<option value="">Choose a class…</option>`, group = null;
    for (const c of classes()) {
      if (c.group !== group) { if (group !== null) html += "</optgroup>"; group = c.group; html += `<optgroup label="${esc(group)}">`; }
      html += `<option value="${esc(c.path)}" ${c.path === selected ? "selected" : ""}>${esc(c.name)}</option>`;
    }
    return `<select id="exClass" class="field" aria-label="The class to explain">${html}</optgroup></select>`;
  }

  function featureNames() {
    const v = Features.view();
    return [...new Set([...Features.mine().map((m) => m.result.name), ...v.built, ...v.in_progress].map((f) => f.name || f))];
  }

  function renderForm(value) {
    const keep = value ?? (mode === "class" ? $("exClass")?.value : $("exText")?.value) ?? "";
    $("exForm").innerHTML = `
      <div class="theme-switch ex-mode" role="group" aria-label="What to explain">
        <button type="button" data-ex-mode="class" class="${mode === "class" ? "on" : ""}">A class</button>
        <button type="button" data-ex-mode="feature" class="${mode === "feature" ? "on" : ""}">A feature</button>
      </div>
      ${mode === "class"
        ? classSelect(keep)
        : `<input id="exText" class="field" list="exFeats" placeholder="e.g. how the daily streak is counted" value="${esc(keep)}" autocomplete="off" aria-label="The feature to explain">
           <datalist id="exFeats">${featureNames().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`}
      <button type="submit" class="pill-btn dark" ${st.phase === "loading" ? "disabled" : ""}>Explain</button>`;
  }

  function renderRecent() {
    const list = read();
    $("exRecent").innerHTML = list.length
      ? `<span class="mini-h">Explained before</span>${list.slice(0, 8).map((e) => `<button class="ex-chip ${e.id === st.id ? "on" : ""}" data-ex-open="${e.id}"><i class="ex-k-${e.kind}"></i>${esc(e.kind === "class" ? base(e.target) : e.result?.title || e.target)}</button>`).join("")}`
      : "";
  }

  function renderResult(project) {
    const box = $("exResult");
    if (st.phase === "idle") {
      box.innerHTML = `<div class="ex-intro">
        <div class="ex-art" aria-hidden="true"><i></i><i class="hit"></i><i></i><b>?</b></div>
        <div><h3>What does this code actually do?</h3><p>Pick one of your classes, or describe a feature in your own words. You get the big picture, a step-by-step walk through your real code, what it connects to, and what to watch out for. Then ask anything about it.</p></div>
      </div>`;
      return;
    }
    if (st.phase === "loading") {
      const what = st.entry.kind === "class" ? base(st.entry.target) : `“${st.entry.target}”`;
      box.innerHTML = `<div class="busy"><i></i>Reading your code to explain ${esc(what)}…${st.entry.kind === "feature" ? " (a feature can be anywhere, so this reads the whole project - up to a minute)" : ""}</div>`;
      return;
    }
    if (st.phase === "error") {
      box.innerHTML = `<p class="setup-error">Couldn't explain it: ${esc(st.error)}</p><button class="pill-btn" data-ex-retry>Try again</button>`;
      return;
    }
    const entry = read().find((e) => e.id === st.id);
    if (!entry) { st = { phase: "idle" }; return renderResult(project); }
    const r = entry.result;
    const stale = project && entry.savedAt < project.savedAt;
    const { uses, usedBy } = entry.kind === "class" ? links(entry.target) : { uses: [], usedBy: [] };
    const fits = entry.kind === "class"
      ? `<div class="ex-fit"><span>Uses</span><div class="evs">${uses.map(classChip).join("") || `<span class="note">no other classes</span>`}</div></div>
         <div class="ex-fit"><span>Used by</span><div class="evs">${usedBy.map(classChip).join("") || `<span class="note">nothing else in your app</span>`}</div></div>`
      : "";
    const screens = handlers.evidence({ screens: r.screens || [], files: [] });
    box.innerHTML = `<article class="ex-card">
      <header class="ex-head">
        <div>
          <p class="mini-h">${entry.kind === "class" ? `Class · ${esc(entry.target.split("/").pop())}` : `Feature · “${esc(entry.target)}”`}</p>
          <h3>${esc(r.title)}</h3>
          <p class="ex-sum">${esc(r.summary)}</p>
        </div>
        <div class="ex-meta">
          <small>${stale ? `<span class="stale">Your code changed since</span> · ` : ""}explained ${ago(entry.at)}</small>
          <button class="link-btn" data-ex-again>Explain again</button>
          <button class="x-btn sm" data-ex-close aria-label="Close">×</button>
        </div>
      </header>
      <p class="ex-over">${esc(r.overview)}</p>

      ${r.steps.length ? `<h4 class="ex-h">How it works</h4>
      <ol class="ex-steps">${r.steps.map((s, i) => `<li>
        <span class="ex-num">${i + 1}</span>
        <div class="ex-step"><b>${esc(s.title)}</b><p>${esc(s.text)}</p>${snippet(s.at)}</div>
      </li>`).join("")}</ol>` : ""}

      <div class="ex-grid">
        ${r.parts.length ? `<div><h4 class="ex-h">The main parts</h4><ul class="ex-parts">${r.parts.map((p) => `<li><code>${esc(p.name)}</code>${p.file && p.file !== entry.target ? classChip(p.file) : ""}<p>${esc(p.role)}</p></li>`).join("")}</ul></div>` : ""}
        ${fits || screens ? `<div><h4 class="ex-h">Where it fits</h4>${fits}${screens ? `<div class="ex-fit"><span>Screens</span>${screens}</div>` : ""}</div>` : ""}
      </div>

      ${r.watch_out.length ? `<div class="ex-watch"><h4 class="ex-h">Watch out for</h4><ul>${r.watch_out.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}

      <div class="ex-follow">
        <h4 class="ex-h">Ask about it</h4>
        ${entry.follow.map((f) => `<div class="ex-qa"><p class="ex-q">${esc(f.q)}</p><p class="ex-a">${esc(f.answer)}</p>${snippet(f.at)}</div>`).join("")}
        ${followBusy ? `<div class="busy"><i></i>Looking into it…</div>` : ""}
        ${followError ? `<p class="setup-error">${esc(followError)}</p>` : ""}
        ${!followBusy && r.followups.length ? `<div class="ex-sugg">${r.followups.filter((q) => !entry.follow.some((f) => f.q === q)).map((q) => `<button class="ex-chip" data-ex-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
        <form class="ex-follow-form" id="exFollowForm">
          <input id="exFollowText" class="field" placeholder="Ask a question about ${esc(entry.kind === "class" ? base(entry.target) : "this feature")}…" autocomplete="off" ${followBusy ? "disabled" : ""}>
          <button type="submit" class="pill-btn dark" ${followBusy ? "disabled" : ""}>Ask</button>
        </form>
      </div>

      ${entry.kind === "class" ? `<div class="fg-bar"><span></span><a class="pill-btn" href="/code-check/?file=${encodeURIComponent(entry.target)}">Quiz me on this class</a></div>` : ""}
    </article>`;
  }

  async function render() {
    const project = await DeckStore.project().catch(() => null);
    renderRecent();
    renderResult(project);
    const btn = $("exForm").querySelector("button[type=submit]");
    if (btn) btn.disabled = st.phase === "loading";
  }

  function show(id) {
    st = { phase: "show", id };
    followError = "";
    const e = read().find((x) => x.id === id);
    if (e) { mode = e.kind; renderForm(e.kind === "class" ? e.target : e.target); }
    render();
  }

  // ---------------------------------------------------------------- events

  function init(h) {
    handlers = { ...handlers, ...h };
    $("exForm").addEventListener("click", (e) => {
      const m = e.target.closest("[data-ex-mode]");
      if (!m || m.dataset.exMode === mode) return;
      mode = m.dataset.exMode;
      renderForm("");
      (mode === "class" ? $("exClass") : $("exText")).focus();
    });
    $("exForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if (mode === "class") ask("class", $("exClass").value, { scroll: false });
      else ask("feature", $("exText").value, { scroll: false });
    });
    $("exForm").addEventListener("change", (e) => { if (e.target.id === "exClass" && e.target.value) ask("class", e.target.value, { scroll: false }); });
    $("exRecent").addEventListener("click", (e) => { const b = e.target.closest("[data-ex-open]"); if (b) show(b.dataset.exOpen); });
    $("exResult").addEventListener("click", (e) => {
      const t = (sel) => e.target.closest(sel);
      if (t("[data-ex-close]")) { st = { phase: "idle" }; render(); return; }
      if (t("[data-ex-again]")) { const x = read().find((y) => y.id === st.id); if (x) ask(x.kind, x.target, { fresh: true, scroll: false }); return; }
      if (t("[data-ex-retry]")) { ask(st.kind, st.target, { fresh: true, scroll: false }); return; }
      if (t("[data-ex-class]")) { ask("class", t("[data-ex-class]").dataset.exClass); return; }
      if (t("[data-ex-ask]")) { follow(t("[data-ex-ask]").dataset.exAsk); return; }
      const sc = t("[data-screen]");
      if (sc) {
        const n = (json("sm.summary")?.graph?.nodes || []).find((x) => x.id === sc.dataset.screen);
        if (n) handlers.screen(n);
      }
    });
    $("exResult").addEventListener("submit", (e) => {
      if (e.target.id !== "exFollowForm") return;
      e.preventDefault();
      const q = $("exFollowText").value;
      if (q.trim().length > 2) follow(q);
    });
    renderForm("");
    render();
  }

  // the class list and feature names change when the code does
  function refresh() {
    if (document.activeElement && document.activeElement.closest("#explain input, #explain select")) return;
    renderForm();
    render();
  }

  return { init, ask, refresh, isClass: (q) => classes().find((c) => c.name.toLowerCase() === String(q).trim().toLowerCase())?.path || null };
})();
