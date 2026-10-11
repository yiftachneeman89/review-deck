// Review Deck: one page for Code Check, Screen Map and Design Critic.
// All of them live on yiftachneeman89.github.io, so they share this browser's storage:
// Code Check's own quiz.js (loaded from ../code-check/) reads its progress, and the other two
// leave a small summary behind (sm.summary, dc.summary) every time they're used.

(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function ago(t) {
    if (!t) return "";
    const s = (Date.now() - t) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const d = Math.round(s / 86400);
    return d === 1 ? "yesterday" : `${d} days ago`;
  }

  function ring(pct, color) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return `<div class="ring" style="--p:${p};--c:${color}"><span>${p < 10 && p > 0 ? p.toFixed(1) : Math.round(p)}<small>%</small></span></div>`;
  }

  let importOpen = false;  // the import box stays open after "Import again" or a fresh import

  const empty = (text) => `<div class="empty-stats"><p>${text}</p></div>`;

  // ---------------------------------------------------------------- Code Check

  async function codeCheckStats() {
    const box = $("stats-code-check");
    let ok = false;
    try { ok = typeof Session !== "undefined" && await Session.load(); } catch { ok = false; }
    if (!ok) {
      box.innerHTML = empty("Not set up yet. Open it and upload your project, or import your desktop progress below.");
      $("importBox").classList.add("highlight");
      return null;
    }
    $("importBox").hidden = importOpen ? false : true;
    $("importAgain").hidden = !$("importBox").hidden;
    const m = Quiz.mastery();
    const st = dailyStatus();
    const hist = Quiz.history();
    const rounds = allRounds();
    const last = Object.keys(rounds).sort().pop();
    const answered = Object.values(rounds).reduce((n, r) => n + Object.keys(r.answers || {}).length, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = isoDate(d);
      const h = hist.find((x) => x.date === iso);
      days.push({ label: d.toLocaleDateString(undefined, { weekday: "narrow" }), met: h?.goal_met, some: h && h.answered > 0, today: i === 0 });
    }
    box.innerHTML = `
      <div class="stat-main">
        ${ring(m.known_pct, "var(--green)")}
        <div>
          <b class="big">${m.known_pct < 10 ? m.known_pct.toFixed(1) : Math.round(m.known_pct)}% known</b>
          <span>${m.mastered_pct.toFixed(1)}% mastered · ${m.files.filter((f) => f.known_pct > 0).length} of ${m.files.length} files touched</span>
          <span class="proj">${esc(Session.project.name)}</span>
        </div>
      </div>
      <div class="stat-rows">
        <div><span>Streak</span><b class="${st.streak ? "hot" : ""}">${st.streak} day${st.streak === 1 ? "" : "s"}</b></div>
        <div><span>Today</span><b class="${st.goal_met ? "ok" : ""}">${st.today_answered}/${st.goal}${st.goal_met ? " ✓" : ""}</b></div>
        <div><span>Answers</span><b>${answered}</b></div>
      </div>
      <div class="week">${days.map((d) => `<i class="${d.met ? "met" : d.some ? "some" : ""} ${d.today ? "today" : ""}" title="${d.met ? "goal met" : d.some ? "some answers" : "nothing"}">${d.label}</i>`).join("")}</div>
      ${last ? `<p class="note">Last chunk: <b>${esc(rounds[last].title || rounds[last].chunk.owner)}</b></p>` : ""}`;
    return { project: Session.project.name };
  }

  // ---------------------------------------------------------------- Screen Map

  function screenMapStats() {
    const box = $("stats-screen-map");
    const s = readJson("sm.summary");
    if (!s) { box.innerHTML = empty("Open it once with your Android project and its numbers show up here."); return null; }
    box.innerHTML = `
      <div class="stat-main">
        <div class="count"><b>${s.screens}</b><span>screens</span></div>
        <div>
          <b class="big">${s.links} connection${s.links === 1 ? "" : "s"}</b>
          <span>${[s.activities && `${s.activities} activit${s.activities === 1 ? "y" : "ies"}`, s.fragments && `${s.fragments} fragment${s.fragments === 1 ? "" : "s"}`, s.dialogs && `${s.dialogs} pop-up${s.dialogs === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
          <span class="proj">${esc(s.project)}</span>
        </div>
      </div>
      <div class="stat-rows">
        <div><span>Starts at</span><b>${esc(s.start || "-")}</b></div>
        <div><span>Buttons</span><b>${s.buttons ?? "-"}</b></div>
        <div><span>Opened</span><b>${ago(s.at)}</b></div>
      </div>`;
    return { project: s.project };
  }

  // ---------------------------------------------------------------- Design Critic

  function designCriticStats() {
    const box = $("stats-design-critic");
    const s = readJson("dc.summary");
    if (!s) { box.innerHTML = empty("Run a review once and your grade and open issues show up here."); return null; }
    const done = s.fixed + s.wont;
    box.innerHTML = `
      <div class="stat-main">
        <div class="grade grade-${s.grade}">${s.grade}</div>
        <div>
          <b class="big">${s.score}/100</b>
          <span>${s.blocker + s.major + s.minor} open issue${s.blocker + s.major + s.minor === 1 ? "" : "s"} across ${s.screens} screens</span>
          <span class="proj">${esc(s.project)}</span>
        </div>
      </div>
      <div class="sev">
        <span class="sev-blocker"><b>${s.blocker}</b> blocker${s.blocker === 1 ? "" : "s"}</span>
        <span class="sev-major"><b>${s.major}</b> major</span>
        <span class="sev-minor"><b>${s.minor}</b> minor</span>
      </div>
      <div class="bar"><i style="width:${s.total ? (s.fixed / s.total) * 100 : 0}%"></i><i class="wont" style="width:${s.total ? (s.wont / s.total) * 100 : 0}%"></i></div>
      <p class="note">${s.fixed} fixed${s.wont ? ` · ${s.wont} won't fix` : ""} of ${s.total} · scanned ${ago(s.at)}</p>`;
    return { project: s.project };
  }

  // ---------------------------------------------------------------- importing the desktop app's progress

  async function importProgress(file) {
    const label = $("importLabel"), text = $("importText");
    let data;
    try { data = JSON.parse(await file.text()); } catch { text.textContent = "That file isn't valid JSON."; return; }
    if (data.format !== "review-deck/code-check-import@1" || !Array.isArray(data.files) || !data.rounds) {
      text.textContent = "That isn't a Code Check progress file. Pick the code-check-progress.json made from the desktop app.";
      return;
    }
    const had = await Session.load().catch(() => false);
    if (had && Session.project && Session.project.name !== data.project.name &&
        !confirm(`Code Check here is set up for “${Session.project.name}”. Replace it with “${data.project.name}” from the desktop app? Progress for the old project will be kept but won't match the new code.`)) return;
    label.classList.add("busy");
    try {
      await Session.save(data.key || Session.key || "", data.project, data.files);
      // merge rounds: keep whichever copy of a round has more answers
      const rounds = allRounds();
      let added = 0;
      for (const [rid, r] of Object.entries(data.rounds)) {
        const mine = rounds[rid];
        if (!mine || Object.keys(mine.answers || {}).length < Object.keys(r.answers || {}).length) { rounds[rid] = r; added++; }
      }
      store.setJson("rounds", rounds);
      store.setJson("used", [...new Set([...(store.json("used", [])), ...(data.used || [])])]);
      const answers = Object.values(data.rounds).reduce((n, r) => n + Object.keys(r.answers || {}).length, 0);
      text.innerHTML = `<b>Imported.</b> ${data.files.length} files of ${esc(data.project.name)}, ${added} round${added === 1 ? "" : "s"} and ${answers} answers are now in Code Check. You can delete the progress file - it contains your API key.`;
      $("importBox").classList.remove("highlight");
      $("importBox").classList.add("done");
      importOpen = true;
      await refresh();
    } catch (e) {
      text.textContent = "Import failed: " + (e.message || e);
    } finally {
      label.classList.remove("busy");
    }
  }

  // ---------------------------------------------------------------- page

  async function refresh() {
    const results = [screenMapStats(), designCriticStats(), await codeCheckStats()].filter(Boolean);
    const projects = [...new Set(results.map((r) => r.project).filter(Boolean))];
    if (projects.length === 1) {
      $("kicker").textContent = projects[0];
      $("headline").textContent = "Pick a tool.";
    }
  }

  for (const card of document.querySelectorAll(".card")) {
    card.addEventListener("click", () => { try { sessionStorage.setItem("rd.from", "1"); } catch {} });
  }
  $("importAgain").onclick = () => { importOpen = true; $("importBox").hidden = false; $("importAgain").hidden = true; $("importBox").scrollIntoView({ behavior: "smooth" }); };
  $("importFile").addEventListener("change", (e) => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ""; });

  window.ReviewDeck = { importProgress, refresh };

  // installable app
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; $("installBtn").hidden = false; });
  $("installBtn").onclick = async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; $("installBtn").hidden = true; };
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // coming back from a tool (or switching tabs) shows fresh numbers
  window.addEventListener("pageshow", () => refresh());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
})();
