// Review Deck insights: a snapshot of all three tools per day, so the home page can say what's
// due today, what changed since last time, how things trend, and how the week went.
// Kept in localStorage under "rd." (shared with the tools, all on one origin).

const Insights = (() => {
  const HIST = "rd.history";    // [{ d: "2026-10-12", start: snap, end: snap }], one per day you opened Review Deck
  const CHANGES = "rd.changes"; // [{ at, added: [paths], edited: [paths], removed: [paths] }] from auto-update
  const KEEP_DAYS = 120, KEYS_DAYS = 10;

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const dayOf = (t) => isoDate(new Date(t));
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

  // ---------------------------------------------------------------- one snapshot of everything

  function snapshot() {
    const snap = { at: Date.now() };
    try {
      const m = Quiz.mastery(), st = dailyStatus();
      const rounds = Object.values(allRounds());
      snap.cc = {
        known: m.known_pct, mastered: m.mastered_pct, streak: st.streak,
        answers: rounds.reduce((n, r) => n + Object.keys(r.answers || {}).length, 0),
      };
    } catch {}
    if (Session.project) snap.code = { files: Session.project.files, lines: Session.project.lines };
    const sm = read("sm.summary", null);
    if (sm) snap.sm = { screens: sm.screens, links: sm.links, unreachable: (sm.unreachable || []).length, names: sm.graph ? sm.graph.nodes.map((n) => n.n) : null };
    const dc = read("dc.summary", null);
    if (dc) snap.dc = {
      score: dc.score, grade: dc.grade, open: dc.blocker + dc.major + dc.minor, blockers: dc.blocker,
      keys: dc.issues ? dc.issues.map((i) => i.k) : null,
      blockerKeys: dc.issues ? dc.issues.filter((i) => i.v === "blocker").map((i) => i.k) : null,
    };
    return snap;
  }

  // today's entry: the first snapshot of the day stays as "start", the latest becomes "end"
  function record() {
    const snap = snapshot();
    const hist = read(HIST, []);
    const d = dayOf(snap.at);
    const last = hist[hist.length - 1];
    if (last && last.d === d) last.end = snap;
    else hist.push({ d, start: snap, end: snap });
    // issue keys and screen names are only needed for recent comparisons
    const cutoff = dayOf(Date.now() - KEYS_DAYS * 86400000);
    for (const h of hist) if (h.d < cutoff) for (const s of [h.start, h.end]) {
      if (s.dc) { s.dc.keys = null; s.dc.blockerKeys = null; }
      if (s.sm) s.sm.names = null;
    }
    write(HIST, hist.slice(-KEEP_DAYS));
    return snap;
  }

  function logChange(change) {
    if (!change.added.length && !change.edited.length && !change.removed.length) return;
    const log = read(CHANGES, []).filter((c) => c.at > Date.now() - 45 * 86400000);
    log.push({ at: Date.now(), ...change });
    write(CHANGES, log.slice(-300));
  }

  // the code files that changed after `since`, each path once (its latest kind wins)
  function codeChanges(since, until = Infinity) {
    const kind = new Map();
    for (const c of read(CHANGES, [])) {
      if (c.at <= since || c.at > until) continue;
      for (const k of ["added", "edited", "removed"]) for (const p of c[k]) {
        const before = kind.get(p);
        kind.set(p, before === "added" && k === "edited" ? "added" : before === "added" && k === "removed" ? null : k);
      }
    }
    const out = { added: [], edited: [], removed: [] };
    for (const [p, k] of kind) if (k) out[k].push(p);
    return out;
  }

  // ---------------------------------------------------------------- since last time

  function dayLabel(d) {
    const days = Math.round((new Date(isoDate(new Date()) + "T00:00") - new Date(d + "T00:00")) / 86400000);
    if (days === 1) return "yesterday";
    if (days < 7) return new Date(d + "T00:00").toLocaleDateString(undefined, { weekday: "long" });
    return new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // what "last time" means: the end of the last day you opened Review Deck, or this morning on day one
  function baseline() {
    const hist = read(HIST, []);
    const today = isoDate(new Date());
    const prev = hist.filter((h) => h.d < today).pop();
    if (prev) return { snap: prev.end, label: `Since ${dayLabel(prev.d)}` };
    const first = hist.find((h) => h.d === today);
    return first ? { snap: first.start, label: "Since this morning", firstDay: true } : null;
  }

  const sign = (n, digits = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);
  const names = (list, max = 2) => list.slice(0, max).join(", ") + (list.length > max ? ` +${list.length - max}` : "");
  const GRADES = "FDCBA";

  // -> [{ text, tone: "good" | "bad" | "info", href, key }] most important first
  function diff(a, b, since, until) {
    const out = [];
    if (!a || !b) return out;
    if (a.dc && b.dc) {
      if (a.dc.grade !== b.dc.grade) out.push({ key: "grade", text: `Design grade ${a.dc.grade} → ${b.dc.grade}`, tone: GRADES.indexOf(b.dc.grade) > GRADES.indexOf(a.dc.grade) ? "good" : "bad", href: "/design-critic/" });
      else if (Math.abs(b.dc.score - a.dc.score) >= 1) out.push({ key: "score", text: `Design score ${sign(b.dc.score - a.dc.score)}`, tone: b.dc.score > a.dc.score ? "good" : "bad", href: "/design-critic/" });
      if (a.dc.keys && b.dc.keys) {
        const before = new Set(a.dc.keys), now = new Set(b.dc.keys);
        const fixed = a.dc.keys.filter((k) => !now.has(k)).length;
        const fresh = b.dc.keys.filter((k) => !before.has(k)).length;
        if (fixed) out.push({ key: "fixed", text: `${plural(fixed, "issue")} fixed`, tone: "good", href: "/design-critic/" });
        if (fresh) out.push({ key: "new", text: `${plural(fresh, "new issue")}`, tone: "bad", href: "/design-critic/" });
      } else if (b.dc.open !== a.dc.open) {
        out.push({ key: "open", text: `${sign(b.dc.open - a.dc.open)} open issues`, tone: b.dc.open < a.dc.open ? "good" : "bad", href: "/design-critic/" });
      }
    }
    if (a.sm && b.sm) {
      if (a.sm.names && b.sm.names) {
        const added = b.sm.names.filter((n) => !a.sm.names.includes(n));
        const gone = a.sm.names.filter((n) => !b.sm.names.includes(n));
        if (added.length) out.push({ key: "screens+", text: `+${plural(added.length, "screen")}: ${names(added)}`, tone: "info", href: "/screen-map/" });
        if (gone.length) out.push({ key: "screens-", text: `−${plural(gone.length, "screen")}: ${names(gone)}`, tone: "info", href: "/screen-map/" });
      } else if (b.sm.screens !== a.sm.screens) {
        out.push({ key: "screens", text: `${sign(b.sm.screens - a.sm.screens)} screens`, tone: "info", href: "/screen-map/" });
      }
      if (b.sm.links !== a.sm.links) out.push({ key: "links", text: `${sign(b.sm.links - a.sm.links)} connections`, tone: "info", href: "/screen-map/" });
      if (b.sm.unreachable !== a.sm.unreachable) out.push({ key: "unreach", text: `${sign(b.sm.unreachable - a.sm.unreachable)} unreachable screens`, tone: b.sm.unreachable < a.sm.unreachable ? "good" : "bad", href: "/screen-map/" });
    }
    if (a.cc && b.cc) {
      const answered = b.cc.answers - a.cc.answers;
      if (answered > 0) out.push({ key: "answers", text: `${plural(answered, "question")} answered`, tone: "good", href: "/code-check/" });
      if (Math.abs(b.cc.known - a.cc.known) >= 0.1) out.push({ key: "known", text: `Code known ${sign(b.cc.known - a.cc.known, 1)}%`, tone: b.cc.known > a.cc.known ? "good" : "bad", href: "/code-check/" });
    }
    const ch = codeChanges(since ?? a.at, until);
    const parts = [ch.added.length && `${ch.added.length} added`, ch.edited.length && `${ch.edited.length} edited`, ch.removed.length && `${ch.removed.length} removed`].filter(Boolean);
    if (parts.length) out.push({ key: "code", text: `Code files: ${parts.join(", ")}`, tone: "info", href: "/code-check/", files: ch });
    return out;
  }

  function sinceLastTime(current) {
    const base = baseline();
    if (!base) return null;
    return { label: base.label, firstDay: base.firstDay, items: diff(base.snap, current) };
  }

  // ---------------------------------------------------------------- what to do today

  function today(current) {
    const out = [];
    try {
      const st = dailyStatus();
      const left = st.goal - st.today_answered;
      const late = new Date().getHours() >= 18;
      if (st.goal_met) out.push({ key: "quiz", tone: "good", text: `Quiz done today${st.streak ? ` · ${st.streak}-day streak` : ""}`, href: "/code-check/" });
      else out.push({ key: "quiz", tone: late && st.streak ? "bad" : "todo", text: `${plural(left, "quiz question")} to go${st.streak ? late ? ` · your ${st.streak}-day streak ends tonight` : ` · ${st.streak}-day streak` : ""}`, href: "/code-check/" });
      const ids = new Set(Session.chunks.map((c) => c.id));
      const focus = store.json("focus", []).filter((id) => ids.has(id)).length;
      if (focus) out.push({ key: "focus", tone: "todo", text: `${plural(focus, "piece")} of new code to quiz on`, href: "/code-check/" });
    } catch {}
    const dc = read("dc.summary", null);
    if (dc && dc.blocker) {
      const base = baseline();
      const before = new Set(base?.snap?.dc?.blockerKeys || []);
      const fresh = base?.snap?.dc?.blockerKeys ? (dc.issues || []).filter((i) => i.v === "blocker" && !before.has(i.k)) : [];
      const first = fresh[0] || (dc.issues || []).find((i) => i.v === "blocker");
      out.push({ key: "blockers", tone: "bad", text: fresh.length ? `${plural(fresh.length, "new blocker")} in your design` : `${plural(dc.blocker, "design blocker")} to fix`, href: first ? `/design-critic/?issue=${encodeURIComponent(first.k)}` : "/design-critic/" });
    }
    const sm = read("sm.summary", null);
    if (sm && sm.unreachable && sm.unreachable.length) {
      const id = sm.unreachableIds?.[0];
      out.push({ key: "unreach", tone: "todo", text: sm.unreachable.length === 1 ? `Nothing leads to ${sm.unreachable[0]}` : `${sm.unreachable.length} screens nothing leads to`, href: id ? `/screen-map/?screen=${encodeURIComponent(id)}` : "/screen-map/" });
    }
    const feats = read("rd.features", null);
    const wip = feats?.result?.in_progress?.length;
    if (wip) out.push({ key: "wip", tone: "info", text: `${plural(wip, "feature")} in progress`, href: "#features" });
    if (!out.some((i) => i.tone === "todo" || i.tone === "bad")) out.push({ key: "clear", tone: "good", text: "Nothing else waiting - nice" });
    return out;
  }

  // ---------------------------------------------------------------- trends (one value per day)

  function series(pick, days = 30) {
    const cutoff = dayOf(Date.now() - (days - 1) * 86400000);
    return read(HIST, []).filter((h) => h.d >= cutoff).map((h) => ({ d: h.d, v: pick(h.end) })).filter((p) => p.v != null && !Number.isNaN(p.v));
  }

  // ---------------------------------------------------------------- the week

  function week(endDate = new Date()) {
    const end = isoDate(endDate);
    const startD = new Date(endDate); startD.setDate(startD.getDate() - 6);
    const start = isoDate(startD);
    const hist = read(HIST, []);
    const inWeek = hist.filter((h) => h.d >= start && h.d <= end);
    const before = hist.filter((h) => h.d < start).pop();
    const a = before ? before.end : inWeek[0]?.start;
    const b = inWeek.length ? inWeek[inWeek.length - 1].end : null;
    const since = a ? a.at : new Date(start + "T00:00").getTime();
    const days = [];
    let answered = 0, scores = [];
    try {
      const qh = Quiz.history();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(endDate); d.setDate(d.getDate() - i);
        const h = qh.find((x) => x.date === isoDate(d));
        days.push({ d: isoDate(d), label: d.toLocaleDateString(undefined, { weekday: "short" }), answered: h?.answered || 0, met: !!h?.goal_met, avg: h?.avg ?? null });
      }
      for (const r of Object.values(allRounds())) {
        if (r.date < start || r.date > end) continue;
        for (const ans of Object.values(r.answers || {})) { answered++; if (ans.feedback) scores.push(ans.feedback.score); }
      }
    } catch {}
    const chunks = (() => { try { return new Set(Object.values(allRounds()).filter((r) => r.date >= start && r.date <= end && Object.keys(r.answers || {}).length).map((r) => r.chunk.id)).size; } catch { return 0; } })();
    const newScreens = a?.sm?.names && b?.sm?.names ? b.sm.names.filter((n) => !a.sm.names.includes(n)) : [];
    let fixed = null, fresh = null;
    if (a?.dc?.keys && b?.dc?.keys) {
      const now = new Set(b.dc.keys), was = new Set(a.dc.keys);
      fixed = a.dc.keys.filter((k) => !now.has(k)).length;
      fresh = b.dc.keys.filter((k) => !was.has(k)).length;
    }
    return {
      start, end, a, b, days, answered, chunks,
      avg: scores.length ? Math.round(scores.reduce((x, y) => x + y, 0) / scores.length) : null,
      goalDays: days.filter((d) => d.met).length,
      newScreens, fixed, fresh,
      code: codeChanges(since, new Date(end + "T23:59:59").getTime()),
      score: inWeek.map((h) => ({ d: h.d, v: h.end.dc?.score })).filter((p) => p.v != null),
      known: inWeek.map((h) => ({ d: h.d, v: h.end.cc?.known })).filter((p) => p.v != null),
      highlights: diff(a, b, since, new Date(end + "T23:59:59").getTime()),
      openedDays: inWeek.length,
    };
  }

  return { snapshot, record, logChange, sinceLastTime, today, series, week, baseline };
})();
