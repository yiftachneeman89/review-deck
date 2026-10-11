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

  // Code Check: how much of the project you've completed
  function codeCheckDetails() {
    const m = Quiz.mastery(), st = dailyStatus();
    const rounds = Object.values(allRounds());
    const ids = new Set(Session.chunks.map((c) => c.id));
    const done = new Set(rounds.filter((r) => Object.keys(r.answers || {}).length && ids.has(r.chunk.id)).map((r) => r.chunk.id));
    const scores = rounds.flatMap((r) => Object.values(r.answers || {}).filter((a) => a.feedback).map((a) => a.feedback.score));
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const touched = m.files.filter((f) => f.known_pct > 0).length;
    $("info-code-check").textContent = `${pct(m.known_pct)} of your code completed`;
    $("det-code-check").innerHTML = `
      ${bar([[m.mastered_pct, "good"], [m.learning_pct, "mid"]])}
      <p class="legend"><i class="good"></i>${pct(m.mastered_pct)} mastered <i class="mid"></i>${pct(m.learning_pct)} learning <i></i>${pct(Math.max(0, 100 - m.mastered_pct - m.learning_pct))} not seen yet</p>
      ${row("Chunks done", `${done.size} of ${Session.chunks.length}`)}
      ${row("Files touched", `${touched} of ${m.files.length}`)}
      ${row("Answers", scores.length ? `${scores.length} · average ${avg}/100` : "none yet")}
      ${row("Streak", plural(st.streak, "day"))}
      ${row("Today", `${st.today_answered} of ${st.goal}${st.goal_met ? " · goal met" : ""}`)}`;
  }

  // Screen Map: what the app is made of
  function screenMapDetails(s) {
    $("info-screen-map").textContent = `${plural(s.screens, "screen")} and ${plural(s.links, "connection")}`;
    const kinds = [s.activities && plural(s.activities, "activity", "activities"), s.fragments && plural(s.fragments, "fragment"), s.dialogs && plural(s.dialogs, "pop-up")].filter(Boolean).join(" · ");
    $("det-screen-map").innerHTML = `
      ${row("Screens", kinds || s.screens)}
      ${row("Connections", s.autoLinks != null ? `${s.links} · ${s.autoLinks} automatic` : s.links)}
      ${row("Buttons with code", s.buttons ?? "-")}
      ${s.layouts != null ? row("XML layouts", s.layouts) : ""}
      ${row("App starts at", esc(s.start || "-"))}
      ${s.unreachable ? row("Nothing leads to", s.unreachable.length ? esc(s.unreachable.slice(0, 3).join(", ")) + (s.unreachable.length > 3 ? ` +${s.unreachable.length - 3}` : "") : "none") : ""}`;
  }

  // Design Critic: how many problems, and what kind
  const CATS = { accessibility: "Accessibility", color: "Color", typography: "Typography", layout: "Layout", states: "States", copy: "Copy" };
  function designCriticDetails(s) {
    const open = s.blocker + s.major + s.minor;
    $("info-design-critic").textContent = `Grade ${s.grade} · ${s.score}/100 · ${plural(open, "open issue")}`;
    const cats = s.cats || {};
    const max = Math.max(1, ...Object.values(cats));
    $("det-design-critic").innerHTML = `
      <div class="sev"><span class="blocker"><b>${s.blocker}</b> ${s.blocker === 1 ? "blocker" : "blockers"}</span><span class="major"><b>${s.major}</b> major</span><span class="minor"><b>${s.minor}</b> minor</span></div>
      ${Object.keys(cats).length ? `<div class="cats">${Object.entries(CATS).map(([k, label]) => `<div class="cat"><span>${label}</span><i style="width:${(cats[k] || 0) / max * 100}%"></i><b>${cats[k] || 0}</b></div>`).join("")}</div>` : ""}
      ${s.worst ? row("Worst screen", `${esc(s.worst.screen)} · ${plural(s.worst.count, "issue")}`) : ""}
      ${row("Fixed", `${s.fixed} of ${s.total}${s.wont ? ` · ${s.wont} won't fix` : ""}`)}
      ${s.blockers && s.blockers.length ? `<p class="first">First to fix: ${esc(s.blockers[0])}</p>` : ""}`;
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
    const fresh = (s) => s && s.at >= current.savedAt;
    const sm = readJson("sm.summary"), dc = readJson("dc.summary");
    if (fresh(sm)) screenMapDetails(sm); else runInBackground("screen-map", "sm.summary", "Mapping your screens…");
    // one at a time: the review starts after the map is done
    if (fresh(dc)) designCriticDetails(dc);
    else if (fresh(sm)) runInBackground("design-critic", "dc.summary", "Reviewing your design…");
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
