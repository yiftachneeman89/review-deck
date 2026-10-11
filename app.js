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

  function info(id, text) { $(id).textContent = text; }

  function fillCards(project) {
    try {
      const m = Quiz.mastery(), st = dailyStatus();
      const known = m.known_pct < 10 ? m.known_pct.toFixed(1) : Math.round(m.known_pct);
      info("info-code-check", `${known}% known · ${st.streak}-day streak · today ${st.today_answered}/${st.goal}`);
    } catch { /* keeps its tagline */ }
    // the other two leave a summary when they open; only trust it if it's about the current code
    const fresh = (s) => s && s.at >= project.savedAt;
    const sm = readJson("sm.summary");
    info("info-screen-map", fresh(sm) ? `${sm.screens} screens · ${sm.links} connections · starts at ${sm.start || "?"}` : "Your Android app as a flow chart");
    const dc = readJson("dc.summary");
    info("info-design-critic", fresh(dc) ? `Grade ${dc.grade} · ${dc.blocker + dc.major + dc.minor} open issues · ${dc.blocker} blocker${dc.blocker === 1 ? "" : "s"}` : "A design review that doesn't go easy on you");
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
