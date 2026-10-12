// Review Deck "Features": reads your whole project and tells you what the app already does,
// what's half-built, and what would improve it most. Gemini (the key from sign-in) does the
// reading; the hints below point it at work that looks unfinished. Kept in "rd.features".

const Features = (() => {
  const KEY = "rd.features";
  const MAX_CHARS = 650000;  // ~170k tokens, far below Gemini's limit; big projects get trimmed

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  const kind = (path) => {
    if (/AndroidManifest\.xml$/.test(path)) return "manifest";
    if (/\/res\/layout[^/]*\/[^/]+\.xml$/.test(path)) return "layout";
    if (/\/res\/menu[^/]*\/|\/res\/navigation[^/]*\//.test(path)) return "nav";
    if (/\/res\/values[^/]*\/strings\.xml$/.test(path)) return "strings";
    if (/\/res\/values/.test(path)) return "values";
    if (/\.gradle(\.kts)?$/.test(path)) return "build";
    return "code";
  };

  // layouts shrink to their ids and visible text - enough to know what a screen shows
  function layoutDigest(code) {
    const ids = [...code.matchAll(/android:id="@\+?id\/([^"]+)"/g)].map((m) => m[1]);
    const text = [...code.matchAll(/android:(?:text|hint|contentDescription|title)="([^"]+)"/g)].map((m) => m[1]);
    const tags = [...new Set([...code.matchAll(/<([A-Za-z][\w.]*)/g)].map((m) => m[1].split(".").pop()))];
    return `views: ${tags.join(", ")}\nids: ${ids.join(", ")}\ntext: ${text.join(" | ")}`;
  }

  function stringsDigest(code) {
    return [...code.matchAll(/<string name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g)].map((m) => `${m[1]} = ${m[2].replace(/\s+/g, " ").slice(0, 160)}`).join("\n");
  }

  // signs of unfinished work the model should look at first
  function hints(files, sm) {
    const out = [];
    const code = files.filter((f) => kind(f.path) === "code");
    const all = files.map((f) => f.code).join("\n");
    for (const f of code) {
      const lines = f.code.split("\n");
      lines.forEach((l, i) => {
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(l)) out.push(`${f.path}:${i + 1} comment: ${l.trim().slice(0, 140)}`);
        // only in text the user sees or in comments - not in names like placeholderTv
        const said = [...l.matchAll(/"([^"]*)"|\/\/(.*)$/g)].map((m) => m[1] ?? m[2]).join(" ");
        if (/coming soon|not (yet )?implemented|under construction|placeholder|work in progress/i.test(said)) out.push(`${f.path}:${i + 1} says: ${l.trim().slice(0, 140)}`);
      });
      for (const m of f.code.matchAll(/(?:void|fun|public|private|protected)\s+[\w<>\[\]]*\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{\s*\}/g)) {
        if (/@Override\s*(public\s+|protected\s+)?$|override\s+$/.test(f.code.slice(Math.max(0, m.index - 40), m.index))) continue;  // listener methods Android makes you write
        out.push(`${f.path}:${f.code.slice(0, m.index).split("\n").length} empty method ${m[1]}()`);
      }
      for (const m of f.code.matchAll(/setOnClickListener\([^;]*?->\s*\{?\s*Toast\.makeText\([^,]+,\s*("[^"]*"|R\.string\.\w+)/g)) {
        out.push(`${f.path}:${f.code.slice(0, m.index).split("\n").length} button only shows a toast ${m[1]}`);
      }
    }
    for (const f of files.filter((x) => kind(x.path) === "layout")) {
      const name = f.path.split("/").pop().replace(/\.xml$/, "");
      if (!new RegExp(`R\\.layout\\.${name}\\b|@layout/${name}\\b|${name.replace(/_(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase())}Binding`).test(all)) out.push(`layout ${name}.xml is never used`);
    }
    if (sm?.unreachable?.length) out.push(`screens nothing navigates to: ${sm.unreachable.join(", ")}`);
    return out.slice(0, 80);
  }

  function buildPrompt(project, files, sm) {
    const parts = [];
    const order = { manifest: 0, nav: 1, code: 2, strings: 3, layout: 4, build: 5, values: 6 };
    const sorted = files.filter((f) => kind(f.path) !== "values").sort((a, b) => order[kind(a.path)] - order[kind(b.path)] || a.path.localeCompare(b.path));
    let used = 0, skipped = 0;
    for (const f of sorted) {
      const k = kind(f.path);
      const body = k === "layout" ? layoutDigest(f.code) : k === "strings" ? stringsDigest(f.code) : f.code;
      if (used + body.length > MAX_CHARS) { skipped++; continue; }
      used += body.length;
      parts.push(`=== ${f.path}${k === "layout" ? " (summary)" : ""}\n${body}`);
    }
    const map = sm?.graph ? sm.graph.nodes.map((n, i) => {
      const to = sm.graph.edges.filter(([a]) => a === i).map(([, b]) => sm.graph.nodes[b].n);
      return `- ${n.n} (${n.k}${n.s ? ", start screen" : ""}, ${n.b ?? 0} buttons) -> ${to.join(", ") || "nothing"}`;
    }).join("\n") : "(not mapped yet)";
    const prompt = `App: ${project.name} (${project.language || "unknown language"}, ${project.files} files, ${project.lines} lines)

Screens and where their buttons lead:
${map}

Signs of unfinished work found by a scan (check each against the code before using it):
${hints(files, sm).join("\n") || "(none found)"}

The code${skipped ? ` (${skipped} files left out for length)` : ""}:
${parts.join("\n\n")}`;
    return { prompt, files: parts.length, skipped };
  }

  const SYSTEM = `You read an app's whole source code and describe its features to the developer who wrote it.
Return three lists:
- built: features that work end to end today. A feature is something a user can do or see (e.g. "Sign in with email", "Weekly practice plan"), not a class or a technique. Group small things into one feature. Order by how central they are to the app.
- in_progress: features that are started but not finished: screens nobody can reach, buttons that do nothing or only show a toast, data that is collected but never used, hard-coded placeholder content, half-wired flows. Say what exists and exactly what is still missing. Only list what the code shows; never invent.
- recommended: the most valuable things to add or improve next for THIS app and its users, judged from what it is trying to do. Mix new features with quality work (bugs you can see, data loss, missing error handling, accessibility) only when it matters. Each one says why it helps.
For every item name the real screens (use the screen names given) and the most relevant files (exact paths from the code). Plain, friendly English, short sentences, no jargon. Be specific to this app - nothing generic like "add unit tests" unless the code gives a concrete reason.`;

  const SCHEMA = {
    type: "object",
    properties: {
      summary: { type: "string", description: "One sentence: what the app is for and who uses it" },
      built: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, detail: { type: "string" },
        screens: { type: "array", items: { type: "string" } }, files: { type: "array", items: { type: "string" } },
      }, required: ["name", "detail", "screens", "files"] } },
      in_progress: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, detail: { type: "string", description: "what already exists" }, missing: { type: "string", description: "what is still missing" },
        screens: { type: "array", items: { type: "string" } }, files: { type: "array", items: { type: "string" } },
      }, required: ["name", "detail", "missing", "screens", "files"] } },
      recommended: { type: "array", items: { type: "object", properties: {
        name: { type: "string" }, why: { type: "string" },
        effort: { type: "string", enum: ["small", "medium", "large"] },
        type: { type: "string", enum: ["feature", "improvement", "fix"] },
        screens: { type: "array", items: { type: "string" } }, files: { type: "array", items: { type: "string" } },
      }, required: ["name", "why", "effort", "type", "screens", "files"] } },
    },
    required: ["summary", "built", "in_progress", "recommended"],
  };

  // ---------------------------------------------------------------- one feature you describe

  const ONE_SYSTEM = `You read an app's whole source code. The developer describes one feature in their own words.
Decide whether the app has it, judged only from the code:
- built: a user can do it end to end today.
- in_progress: some of it exists (screens, layouts, data, half-wired code) but a user can't fully do it yet.
- missing: nothing meaningful exists for it yet.
percent: how much of the feature exists (built = 90-100, missing = 0-10). Be honest and specific: name what exists (real screens and exact file paths) and exactly what is missing. If the description is vague, judge the most likely meaning and say which one you used. Plain, friendly English.`;

  const ONE_SCHEMA = {
    type: "object",
    properties: {
      name: { type: "string", description: "a short name for the feature (2-5 words)" },
      status: { type: "string", enum: ["built", "in_progress", "missing"] },
      percent: { type: "integer" },
      detail: { type: "string", description: "what already exists, or why nothing does" },
      missing: { type: "string", description: "what is still missing; empty when built" },
      screens: { type: "array", items: { type: "string" } },
      files: { type: "array", items: { type: "string" } },
    },
    required: ["name", "status", "percent", "detail", "missing", "screens", "files"],
  };

  const MINE = "rd.features.mine";  // [{ id, asked, column, at, savedAt, result }] - your own, kept across re-checks
  const readMine = () => { try { return JSON.parse(localStorage.getItem(MINE)) || []; } catch { return []; } };
  const writeMine = (v) => { try { localStorage.setItem(MINE, JSON.stringify(v)); } catch {} };

  async function checkOne(text, column, project, id = null) {
    const sm = (() => { try { return JSON.parse(localStorage.getItem("sm.summary")); } catch { return null; } })();
    const { prompt } = buildPrompt(Session.project, Session.files, sm);
    const result = await askGemini(Session.key, ONE_SYSTEM, `The feature to look for:\n"${text}"\n\n${prompt}`, ONE_SCHEMA);
    result.percent = Math.max(0, Math.min(100, Math.round(result.percent)));
    const entry = { id: id || `m${Date.now().toString(36)}`, asked: text, column, at: Date.now(), savedAt: project.savedAt, result };
    const list = readMine().filter((m) => m.id !== entry.id);
    list.unshift(entry);
    writeMine(list);
    return entry;
  }

  // ---------------------------------------------------------------- your edits to Gemini's list
  // { "<column>:<slug of the original name>": { removed: true } | { name, detail, why, missing } }
  // Kept apart from the list, so they still apply after "Check again" finds the same feature.

  const EDITS = "rd.features.edits";
  const readEdits = () => { try { return JSON.parse(localStorage.getItem(EDITS)) || {}; } catch { return {}; } };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const keyOf = (col, f) => `${col}:${slug(f.name)}`;

  function setEdit(key, value) {
    const all = readEdits();
    if (value == null) delete all[key]; else all[key] = value;
    try { localStorage.setItem(EDITS, JSON.stringify(all)); } catch {}
  }

  // Gemini's lists with your edits applied and removed ones left out; each item knows its key
  function view() {
    const r = read()?.result || {};
    const edits = readEdits();
    const out = { built: [], in_progress: [], recommended: [], removed: [] };
    for (const col of ["built", "in_progress", "recommended"]) {
      for (const f of r[col] || []) {
        const key = keyOf(col, f), e = edits[key];
        if (e?.removed) { out.removed.push({ ...f, key, col }); continue; }
        out[col].push(e ? { ...f, ...e, key, edited: true } : { ...f, key });
      }
    }
    return out;
  }

  let running = null;

  return {
    view,
    setEdit,
    saved: read,
    mine: readMine,
    checkOne,
    removeMine(id) { writeMine(readMine().filter((m) => m.id !== id)); },
    restoreMine(entry) { writeMine([entry, ...readMine().filter((m) => m.id !== entry.id)]); },

    // the saved result is from older code
    stale(project) { const s = read(); return !!(s && project && s.savedAt < project.savedAt); },

    running: () => !!running,

    async run(project) {
      if (running) return running;
      running = (async () => {
        const sm = (() => { try { return JSON.parse(localStorage.getItem("sm.summary")); } catch { return null; } })();
        const { prompt, files, skipped } = buildPrompt(Session.project, Session.files, sm);
        const result = await askGemini(Session.key, SYSTEM, prompt, SCHEMA);
        const entry = { at: Date.now(), savedAt: project.savedAt, files, skipped, result };
        write(entry);
        return entry;
      })();
      try { return await running; } finally { running = null; }
    },
  };
})();
