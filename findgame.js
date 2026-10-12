// "Find your code": a small game on the home page. You get something your app does, pick the class
// it's in, then highlight the lines that do it. The answer is a piece of your own code (one of Code
// Check's chunks), so it's checked exactly; Gemini only writes the clue, the hint and the explanation.

const FindGame = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const KEY = "rd.find";
  const LINE = 21, PAD = 12;  // must match .fg-code in home.css

  const stats = () => { try { return { played: 0, found: 0, streak: 0, best: 0, seen: [], ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { played: 0, found: 0, streak: 0, best: 0, seen: [] }; } };
  const saveStats = (s) => { try { localStorage.setItem(KEY, JSON.stringify({ ...s, seen: s.seen.slice(-300) })); } catch {} };

  // phase: idle | loading | play | result | error
  let st = { phase: "idle" };
  let next = null;  // the next challenge, made while you play this one

  // ---------------------------------------------------------------- making a challenge

  const codeFile = (path) => !/\.(xml|html?|css|scss|less|json|gradle|kts|properties|toml)$/.test(path) && !/\/(test|androidTest)\//.test(path);

  function classes() {
    return (Session.files || []).filter((f) => codeFile(f.path)).map((f) => {
      const parts = f.path.split("/");
      return { path: f.path, name: parts.pop().replace(/\.\w+$/, ""), group: parts.slice(-1)[0] || "" };
    }).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  function pickChunk(seen) {
    const pool = Session.chunks.filter((c) => codeFile(c.file) && !isMarkup(c) && c.end - c.start >= 6 && !isBoilerplate(c.code));
    const fresh = pool.filter((c) => !seen.includes(c.id));
    const list = fresh.length ? fresh : pool;
    return list[Math.floor(Math.random() * list.length)];
  }

  const SYSTEM = `You make a "find it in the code" puzzle for the developer who wrote this app. You get one piece of their code with line numbers.
Pick ONE specific, interesting thing these lines do and write:
- clue: a short task (max 18 words) starting with "Find where" or "Find the code that", described as behaviour - what the app does or what happens - e.g. "Find where the app remembers which lesson you finished last". NEVER mention class, method, variable, file or library names, and never quote code.
- focus_start, focus_end: the line numbers (as given) of the smallest block, 2 to 15 lines, that does exactly that.
- hint: one sentence that narrows it down without giving it away (which screen, or what happens just before or after).
- explain: one or two sentences, for after the answer is shown, on how those lines do it. Here you may name the code.
usable: false when the lines are boilerplate with nothing worth finding.`;

  const SCHEMA = {
    type: "object",
    properties: {
      usable: { type: "boolean" }, clue: { type: "string" }, hint: { type: "string" }, explain: { type: "string" },
      focus_start: { type: "integer" }, focus_end: { type: "integer" },
    },
    required: ["usable", "clue", "hint", "explain", "focus_start", "focus_end"],
  };

  // names the clue mustn't give away: the class, and the methods/fields in the chunk
  function giveaways(c) {
    const words = new Set([c.file.split("/").pop().replace(/\.\w+$/, "")]);
    for (const part of String(c.owner || "").split(/[\s›.]+/)) if (part.length > 3) words.add(part);
    for (const m of c.code.matchAll(/\b([a-z]+[A-Z]\w{3,})\b/g)) words.add(m[1]);
    return [...words].map((w) => w.toLowerCase());
  }

  async function make() {
    const seen = stats().seen;
    for (let attempt = 0; attempt < 4; attempt++) {
      const c = pickChunk(seen);
      if (!c) throw new Error("There isn't enough code to play with yet.");
      const lines = c.code.split("\n");
      const numbered = lines.map((l, i) => `${c.start + i}| ${l}`).join("\n");
      const r = await askGemini(Session.key, SYSTEM, `File: ${c.file}\n\n${numbered}`, SCHEMA);
      if (!r.usable || !r.clue) { seen.push(c.id); continue; }
      const clue = r.clue.toLowerCase();
      if (giveaways(c).some((w) => clue.includes(w))) continue;
      let a = Math.max(c.start, Math.min(c.end, r.focus_start | 0)), b = Math.max(c.start, Math.min(c.end, r.focus_end | 0));
      if (a > b) [a, b] = [b, a];
      if (!a) { a = c.start; b = c.end; }
      return { id: c.id, file: c.file, start: a, end: b, clue: r.clue, hint: r.hint, explain: r.explain };
    }
    throw new Error("Couldn't find a good piece of code for a puzzle. Try again.");
  }

  async function start() {
    st = { phase: "loading" };
    render();
    try {
      const ch = await (next || make());
      next = null;
      st = { phase: "play", ch, cls: "", sel: null, hint: false };
      render();
      next = make().catch(() => null);  // ready by the time you finish this one
    } catch (e) {
      next = null;
      st = { phase: "error", error: e.message || String(e) };
      render();
    }
  }

  // ---------------------------------------------------------------- checking

  // The same code is often copied into several classes (or twice in one). Every place where the
  // answer's lines appear again - ignoring spacing and comments - counts as a right answer too.
  const norm = (l) => l.replace(/\/\/.*$/, "").replace(/\s+/g, " ").trim();
  const meaningful = (l) => l.length >= 4 && !/^[{}()[\];,.\s]*$/.test(l) && !/^(\} ?)?(else|try|finally|do)( ?\{)?$|^(break|continue|return|super\.\w+\(.*\));?$|^@Override$/.test(l);

  function places(ch) {
    if (ch.places) return ch.places;
    const own = Session.files.find((f) => f.path === ch.file);
    const want = own ? own.code.split("\n").slice(ch.start - 1, ch.end).map(norm).filter(meaningful) : [];
    const out = [{ file: ch.file, start: ch.start, end: ch.end }];
    if (want.length < 2) return (ch.places = out);
    const wanted = new Set(want);
    const span = Math.ceil((ch.end - ch.start + 1) * 1.25) + 2;  // room for an extra line or two in the copy
    for (const f of Session.files.filter((x) => codeFile(x.path))) {
      const lines = f.code.split("\n").map(norm);
      for (let i = 0; i < lines.length; i++) {
        if (!wanted.has(lines[i])) continue;
        const left = [...want];  // each wanted line can be matched once
        let first = 0, last = 0, hits = 0;
        for (let j = i; j < Math.min(lines.length, i + span); j++) {
          const k = left.indexOf(lines[j]);
          if (k < 0) continue;
          left.splice(k, 1);
          hits++;
          first ||= j + 1;
          last = j + 1;
        }
        if (hits / want.length < 0.8) continue;
        // and the copy must be mostly those lines - not a longer, different block that happens to contain them
        if (hits / lines.slice(first - 1, last).filter(meaningful).length < 0.8) continue;
        const p = { file: f.path, start: first, end: last };
        const same = out.find((o) => o.file === p.file && o.start <= p.end && p.start <= o.end);
        if (!same) out.push(p);
        i = last - 1;  // carry on after this copy
      }
    }
    return (ch.places = out);
  }

  const RANK = { "found": 0, "close": 1, "wrong-lines": 2 };
  function judge(sel, p) {
    const overlap = Math.max(0, Math.min(sel.end, p.end) - Math.max(sel.start, p.start) + 1);
    const recall = overlap / (p.end - p.start + 1), precision = overlap / (sel.end - sel.start + 1);
    const gap = overlap ? 0 : Math.min(Math.abs(sel.start - p.end), Math.abs(p.start - sel.end));
    return recall >= 0.5 && precision >= 0.35 ? "found" : overlap || gap <= 8 ? "close" : "wrong-lines";
  }

  function check(gaveUp = false) {
    const { ch, cls, sel } = st;
    const s = stats();
    const all = places(ch);
    let verdict, match = all[0];
    if (gaveUp) verdict = "gave-up";
    else if (!all.some((p) => p.file === cls)) verdict = "wrong-class";
    else {
      // the copy in your class that your lines come closest to
      const tries = all.filter((p) => p.file === cls).map((p) => ({ p, v: judge(sel, p) }));
      tries.sort((a, b) => RANK[a.v] - RANK[b.v]);
      ({ p: match, v: verdict } = tries[0]);
    }
    s.played++;
    if (verdict === "found") { s.found++; s.streak++; s.best = Math.max(s.best, s.streak); } else s.streak = 0;
    s.seen.push(ch.id);
    saveStats(s);
    st = { ...st, phase: "result", verdict, picked: cls, match };
    render();
  }

  // ---------------------------------------------------------------- drawing

  function fileHtml(path) {
    const f = Session.files.find((x) => x.path === path);
    if (!f) return { html: "", lines: 0 };
    let html = esc(f.code);
    try { if (window.hljs) html = hljs.highlight(f.code, { language: hljs.getLanguage(f.lang) ? f.lang : "plaintext", ignoreIllegals: true }).value; } catch {}
    return { html, lines: f.code.split("\n").length };
  }

  function codeView(path, bands, note) {
    const { html, lines } = fileHtml(path);
    const band = ([a, b, cls]) => `<div class="fg-band ${cls}" style="top:${PAD + (a - 1) * LINE}px;height:${(b - a + 1) * LINE}px"></div>`;
    return `<div class="fg-code" id="fgCode" data-lines="${lines}">
      <div class="fg-file"><span>${esc(path.split("/").pop())}</span><small>${esc(note || "")}</small></div>
      <div class="fg-scroll" id="fgScroll"><div class="fg-inner">
        <div class="fg-gutter">${Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</div>
        <div class="fg-bands">${bands.map(band).join("")}</div>
        <pre><code id="fgText">${html}</code></pre>
      </div></div>
    </div>`;
  }

  function classSelect() {
    let html = `<option value="">Choose a class…</option>`, group = null;
    for (const c of classes()) {
      if (c.group !== group) { if (group !== null) html += "</optgroup>"; group = c.group; html += `<optgroup label="${esc(group)}">`; }
      html += `<option value="${esc(c.path)}" ${c.path === st.cls ? "selected" : ""}>${esc(c.name)}</option>`;
    }
    return `<select id="fgClass" class="field">${html}</optgroup></select>`;
  }

  function renderStats() {
    const s = stats();
    $("findStats").textContent = s.played ? `Found ${s.found} of ${s.played}${s.streak > 1 ? ` · ${s.streak} in a row` : ""}${s.best > 1 ? ` · best ${s.best}` : ""}` : "";
  }

  const VERDICT = {
    "found": ["good", "Found it!", "Those are the lines."],
    "close": ["mid", "Close!", "Right class, but not quite the right lines."],
    "wrong-lines": ["bad", "Right class, wrong place", "It's somewhere else in this class."],
    "wrong-class": ["bad", "Not in that class", ""],
    "gave-up": ["mid", "Here it is", ""],
  };

  function render() {
    renderStats();
    const body = $("findBody");
    if (st.phase === "idle") {
      body.innerHTML = `<div class="fg-intro">
        <div class="fg-art" aria-hidden="true"><i></i><i></i><i class="hit"></i><i></i></div>
        <div><h3>Do you know where your code does what?</h3><p>You get something your app does. Pick the class it's in, then highlight the lines that do it.</p></div>
        <button class="pill-btn dark big-btn" data-fg="start">Play</button>
      </div>`;
      return;
    }
    if (st.phase === "loading") { body.innerHTML = `<div class="busy"><i></i>Picking something your code does…</div>`; return; }
    if (st.phase === "error") {
      body.innerHTML = `<p class="setup-error">${esc(st.error)}</p><button class="pill-btn" data-fg="start">Try again</button>`;
      return;
    }
    const { ch } = st;
    const task = `<div class="fg-task">
      <p class="mini-h">Find this in your code</p>
      <h3>${esc(ch.clue)}</h3>
      ${st.phase === "play" ? (st.hint ? `<p class="fg-hint">${esc(ch.hint)}</p>` : `<button class="link-btn" data-fg="hint">Show a hint</button>`) : ""}
    </div>`;

    if (st.phase === "play") {
      const n = st.sel ? st.sel.end - st.sel.start + 1 : 0;
      body.innerHTML = `${task}
        <div class="fg-step"><span class="step-num">1</span><label for="fgClass">Which class is it in?</label>${classSelect()}</div>
        ${st.cls ? `
          <div class="fg-step"><span class="step-num">2</span><label>Highlight the lines that do it</label><p class="fg-how">Drag over the code, or click a line and Shift-click another.</p></div>
          ${codeView(st.cls, st.sel ? [[st.sel.start, st.sel.end, "sel"]] : [])}
          <div class="fg-bar">
            <span>${st.sel ? `Lines ${st.sel.start}${n > 1 ? `–${st.sel.end}` : ""} · ${n} line${n === 1 ? "" : "s"}` : "Nothing highlighted yet"}</span>
            <button class="link-btn" data-fg="giveup">Show me</button>
            <button class="pill-btn dark" data-fg="check" ${st.sel ? "" : "disabled"}>Check</button>
          </div>` : `<p class="note fg-wait">The class's code opens here.</p>`}`;
      return;
    }

    // result
    const [tone, title, sub] = VERDICT[st.verdict];
    const m = st.match || ch;  // the copy you were judged against (the original unless you picked another copy)
    const name = (path) => (path || "").split("/").pop().replace(/\.\w+$/, "");
    const all = places(ch);
    const classesWithIt = [...new Set(all.map((p) => p.file))];
    const inClasses = classesWithIt.map((f) => `<b>${esc(name(f))}</b>`);
    const list = inClasses.length > 1 ? `${inClasses.slice(0, -1).join(", ")} and ${inClasses.at(-1)}` : inClasses[0];
    const where = st.verdict === "wrong-class" ? `It's in ${list}, not ${esc(name(st.picked))}.`
      : st.verdict === "gave-up" ? `It's in ${list}.` : esc(sub);
    // other places the same code lives, besides the one shown
    const others = all.filter((p) => p !== m);
    const copies = others.length ? `<p class="fg-copies">The same code is also in ${others.map((p) => `<b>${esc(name(p.file))}</b> (lines ${p.start}–${p.end})`).join(", ")}${st.verdict === "found" || st.verdict === "close" ? " - any of them counts." : "."}</p>` : "";
    const bands = [[m.start, m.end, "ans"]];
    if (st.sel && st.picked === m.file && st.verdict !== "found") bands.push([st.sel.start, st.sel.end, "sel"]);
    body.innerHTML = `${task}
      <div class="fg-verdict tone-${tone}"><b>${title}</b><span>${where}</span></div>
      <p class="fg-explain">${esc(ch.explain)}</p>
      ${copies}
      ${codeView(m.file, bands, `lines ${m.start}–${m.end}`)}
      <div class="fg-bar">
        <span class="fg-key"><i class="ans"></i>The answer${bands.length > 1 ? `<i class="sel"></i>Your lines` : ""}</span>
        <button class="pill-btn" data-fg="explain">Explain this class</button>
        <a class="pill-btn" href="/code-check/?file=${encodeURIComponent(m.file)}">Quiz me on this class</a>
        <button class="pill-btn dark" data-fg="start">Next one</button>
      </div>`;
    scrollTo(m.start);
  }

  function scrollTo(line) {
    const box = $("fgScroll");
    if (box) box.scrollTop = Math.max(0, PAD + (line - 1) * LINE - box.clientHeight / 3);
  }

  // ---------------------------------------------------------------- highlighting lines

  function lineAt(y) {
    const code = $("fgText"), total = Number($("fgCode").dataset.lines);
    const n = Math.floor((y - code.getBoundingClientRect().top) / LINE) + 1;
    return Math.max(1, Math.min(total, n));
  }

  let anchor = null;
  function onMouseUp(e) {
    if (st.phase !== "play" || !e.target.closest("#fgScroll")) return;
    const sel = window.getSelection();
    let a, b;
    if (sel && !sel.isCollapsed && $("fgText").contains(sel.anchorNode)) {
      const rects = [...sel.getRangeAt(0).getClientRects()].filter((r) => r.width > 0 || r.height > 0);
      if (!rects.length) return;
      a = lineAt(Math.min(...rects.map((r) => r.top)) + 2);
      b = lineAt(Math.max(...rects.map((r) => r.bottom)) - 2);
      sel.removeAllRanges();
      anchor = a;
    } else {
      const l = lineAt(e.clientY);
      if (e.shiftKey && anchor) { a = Math.min(anchor, l); b = Math.max(anchor, l); }
      else { a = b = anchor = l; }
    }
    const top = $("fgScroll").scrollTop;
    st.sel = { start: a, end: b };
    render();
    $("fgScroll").scrollTop = top;
  }

  function init() {
    const body = $("findBody");
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fg]");
      if (!b) return;
      const act = b.dataset.fg;
      if (act === "start") start();
      else if (act === "hint") { st.hint = true; render(); }
      else if (act === "check" && st.sel) check();
      else if (act === "giveup") check(true);
      else if (act === "explain") Explain.ask("class", (st.match || st.ch).file);
    });
    body.addEventListener("change", (e) => {
      if (e.target.id !== "fgClass") return;
      st.cls = e.target.value;
      st.sel = null;
      anchor = null;
      render();
      $("fgClass").focus();
    });
    body.addEventListener("mouseup", onMouseUp);
    render();
  }

  return { init, render };
})();
