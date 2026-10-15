// Review Deck account: your project and progress saved to your account, so another device
// (your phone, through "Open on phone") opens with the same data.
// Loaded by Review Deck's pages and, once you're signed in, by the three tools (see shared.js).
//
// What's saved: every rd. / cc. / sm. / dc. setting in this browser (progress, quiz rounds, caches,
// your Gemini key) as one row, and the project files as one packed file. Each device merges:
// a value you changed here since the last save wins, anything else takes the account's copy.

const Account = (() => {
  const cfg = window.RD_ACCOUNT || {};
  const ready = !!(cfg.url && cfg.anonKey && window.supabase);
  const HOME = "/review-deck/";
  const onHub = location.pathname.startsWith(HOME);
  const SYNCED = /^(rd|cc|sm|dc)\./;
  const OWN = /^rd\.acct\./;           // this device's account bookkeeping, never synced
  const LINK_MINUTES = 10;             // a phone code works once, for this long

  const sb = ready ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  // ---------------------------------------------------------------- this device's bookkeeping

  const local = {
    get(k) { try { return localStorage.getItem("rd.acct." + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("rd.acct." + k, v); } catch {} },
    json(k, d) { try { return JSON.parse(this.get(k)) ?? d; } catch { return d; } },
    setJson(k, v) { this.set(k, JSON.stringify(v)); },
    clear() {
      try { Object.keys(localStorage).filter((k) => OWN.test(k)).forEach((k) => localStorage.removeItem(k)); } catch {}
    },
  };

  function hash(s) {
    if (s == null) return null;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return `${s.length}.${(h >>> 0).toString(36)}`;
  }

  function snapshot() {
    const out = {};
    try {
      for (const k of Object.keys(localStorage)) if (SYNCED.test(k) && !OWN.test(k)) out[k] = localStorage.getItem(k);
    } catch {}
    return out;
  }

  const hashes = (state) => Object.fromEntries(Object.entries(state).map(([k, v]) => [k, hash(v)]));

  // ---------------------------------------------------------------- the project as one file

  async function pack(project, items) {
    const head = new TextEncoder().encode(JSON.stringify({
      project, files: items.map(({ path, file }) => ({ path, type: file.type, size: file.size })),
    }));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, head.length);
    const raw = new Blob([len, head, ...items.map(({ file }) => file)]);
    return new Response(raw.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  }

  async function unpack(blob) {
    const buf = await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const len = new DataView(buf).getUint32(0);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
    let at = 4 + len;
    const items = head.files.map(({ path, type, size }) => {
      const file = new File([buf.slice(at, at + size)], path.split("/").pop(), { type });
      at += size;
      return { path, file };
    });
    return { project: head.project, items };
  }

  const projectPath = (uid) => `${uid}/project.bin`;

  // ---------------------------------------------------------------- who's signed in

  async function user() {
    if (!ready) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;                            // e.g. offline: still signed in, just can't check
    const u = data.session?.user || null;
    if (!u && local.get("uid")) local.clear();         // signed out elsewhere, or the session ran out
    if (u && local.get("uid") !== u.id) remember(u);
    return u;
  }

  function remember(u) {
    if (local.get("uid") !== u.id) {                   // another account than last time: start the merge fresh
      local.clear();
      local.set("uid", u.id);
    }
    local.set("email", u.email || "");
  }

  // a second, separate session kept for "Open on phone" (your password is never stored)
  async function mintSpare(email, password) {
    const c = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "rd-spare" },
    });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    local.setJson("phone", { token: data.session.refresh_token });
  }

  const friendly = (e) => {
    const m = String(e?.message || e);
    if (/invalid login credentials/i.test(m)) return "That email and password don't match an account.";
    if (/already registered|already exists/i.test(m)) return "There's already an account with that email. Log in instead.";
    if (/email not confirmed/i.test(m)) return "Confirm your email first - open the link we sent you, then log in.";
    if (/password should be at least/i.test(m)) return "Use a password of at least 6 characters.";
    if (/failed to fetch|network/i.test(m)) return "Couldn't reach the account server. Check your connection and try again.";
    return m;
  };

  async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + HOME + "account.html" } });
    if (error) throw new Error(friendly(error));
    if (!data.session) return { confirm: true };     // the server wants the email confirmed first
    remember(data.user);
    await mintSpare(email, password).catch(() => {});
    return { confirm: false, result: await sync({ apply: true }) };
  }

  async function logIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendly(error));
    remember(data.user);
    await mintSpare(email, password).catch(() => {});
    return sync({ apply: true });
  }

  async function logOut() {
    if (ready) await sb.auth.signOut({ scope: "local" }).catch(() => {});
    local.clear();
  }

  // ---------------------------------------------------------------- saving and merging

  let running = null;
  const listeners = [];

  // apply: false (in the tools) saves this page's changes without touching what's in memory here
  function sync(opts = {}) {
    if (!running) {
      running = doSync(opts).finally(() => { running = null; });
      // after it's done, so a listener can start another save
      running.then(async (r) => { if (r && (r.applied || r.adopted)) for (const fn of listeners) await fn(r); }).catch(() => {});
    }
    return running;
  }

  const sameState = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  };

  async function doSync({ apply = onHub } = {}) {
    const u = await user();
    if (!u) return null;
    const uid = u.id;
    const { data: head, error } = await sb.from("decks").select("state_at, project_at").eq("user_id", uid).maybeSingle();
    if (error) throw error;

    // ---- settings and progress
    const base = local.json("base", {});
    const mine = snapshot();
    let theirs = null;
    if (head && head.state_at > Number(local.get("stateAt") || 0)) {
      const { data, error: e2 } = await sb.from("decks").select("state, state_at").eq("user_id", uid).single();
      if (e2) throw e2;
      theirs = data.state || {};
    }
    const merged = { ...mine };
    const newBase = { ...base };
    let applied = 0, skipped = 0;
    for (const k of Object.keys(mine)) if (hash(mine[k]) !== (base[k] ?? null)) newBase[k] = hash(mine[k]);
    for (const k of Object.keys(base)) if (!(k in mine)) delete newBase[k];
    if (theirs) {
      for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
        const lv = mine[k], cv = theirs[k];
        if (hash(lv) !== (base[k] ?? null)) continue;            // changed here since the last save: keep it
        if (hash(cv) === (base[k] ?? null)) continue;            // nobody changed it
        if (cv == null) delete merged[k]; else merged[k] = cv;   // changed on another device
        if (!apply) { skipped++; continue; }                     // a tool page: Review Deck applies it next time
        try { if (cv == null) localStorage.removeItem(k); else localStorage.setItem(k, cv); } catch {}
        if (cv == null) delete newBase[k]; else newBase[k] = hash(cv);
        applied++;
      }
    }

    // the account's copy as this device last knew it: what it pulled, or what it saved last time
    const known = theirs ? hashes(theirs) : base;
    const push = !head || !sameState(hashes(merged), known);
    const now = Date.now();
    if (push) {
      const { error: e3 } = await sb.from("decks").upsert({ user_id: uid, state: merged, state_at: now, project_at: head?.project_at || 0 });
      if (e3) throw e3;
    }
    local.setJson("base", newBase);
    // with changes left for Review Deck to apply, it has to fetch the account's copy again next time
    if (!skipped) local.set("stateAt", String(push ? now : head?.state_at || 0));

    // ---- the project files (only Review Deck moves these; a folder-linked device always wins)
    let adopted = false, uploaded = false;
    if (onHub && typeof DeckStore !== "undefined") {
      const proj = await DeckStore.project();
      const cloudAt = head?.project_at || 0;
      if (proj && proj.savedAt > cloudAt) {
        const saved = await DeckStore.load();
        if (saved) {
          const blob = await pack(saved.project, saved.items);
          const { error: e4 } = await sb.storage.from("projects").upload(projectPath(uid), blob, { upsert: true, contentType: "application/octet-stream" });
          if (e4) throw e4;
          const { error: e5 } = await sb.from("decks").update({ project_at: proj.savedAt }).eq("user_id", uid);
          if (e5) throw e5;
          uploaded = true;
        }
      } else if (cloudAt > (proj?.savedAt || 0) && !proj?.linked) {
        const { data: blob, error: e6 } = await sb.storage.from("projects").download(projectPath(uid));
        if (e6) throw e6;
        const got = await unpack(blob);
        await DeckStore.adopt(got.project, got.items);
        adopted = true;
      }
    }

    local.set("savedAt", String(Date.now()));
    return { applied, adopted, uploaded, pushed: push };
  }

  // ---------------------------------------------------------------- open on phone

  // -> the link for the QR code. Throws { code: "signin" } or { code: "password" } when it needs that first.
  async function phoneLink(password) {
    const u = await user();
    if (!u) throw Object.assign(new Error("Sign in first."), { code: "signin" });
    await sync();                                         // the phone gets what you see now
    let spare = local.json("phone", null);
    if (spare?.linkId) {
      const { data } = await sb.from("phone_links").select("id, created_at").eq("id", spare.linkId).maybeSingle();
      if (!data) spare = null;                            // a phone used it: that session is the phone's now
      else if (Date.now() - new Date(data.created_at).getTime() < (LINK_MINUTES - 1) * 60000) return linkUrl(spare.linkId);
      else { await sb.from("phone_links").delete().eq("id", spare.linkId); delete spare.linkId; }
    }
    if (!spare?.token) {
      if (!password) throw Object.assign(new Error("Enter your password to make a phone link."), { code: "password" });
      try { await mintSpare(u.email, password); } catch (e) { throw new Error(friendly(e)); }
      spare = local.json("phone", null);
    }
    const id = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await sb.from("phone_links").insert({ id, user_id: u.id, token: spare.token });
    if (error) throw error;
    local.setJson("phone", { ...spare, linkId: id });
    return linkUrl(id);
  }

  const linkUrl = (id) => `${location.origin}${HOME}#phone=${id}`;

  // on the phone: the code from the QR -> signed in, with your data
  async function takeLink() {
    const m = location.hash.match(/^#phone=([0-9a-f]{20,})$/);
    if (!m || !ready) return null;
    history.replaceState(null, "", location.pathname + location.search);
    const { data: token, error } = await sb.rpc("take_phone_link", { link_id: m[1] });
    if (error) throw new Error(friendly(error));
    if (!token) throw new Error(`This code was used already or is older than ${LINK_MINUTES} minutes. Press “Open on phone” on your computer for a new one.`);
    await sb.auth.signOut({ scope: "local" }).catch(() => {});
    const { data, error: e2 } = await sb.auth.refreshSession({ refresh_token: token });
    if (e2 || !data.session) throw new Error("That phone code didn't work. Press “Open on phone” on your computer for a new one.");
    remember(data.session.user);
    return sync({ apply: true });
  }

  // ---------------------------------------------------------------- saving on its own

  function autoSave() {
    if (!ready || !local.get("uid")) return;
    let last = 0;
    const soon = (force) => {
      if (!force && Date.now() - last < 20000) return;
      last = Date.now();
      sync({ apply: onHub }).catch((e) => console.warn("Review Deck account: couldn't save", e));
    };
    document.addEventListener("visibilitychange", () => soon(document.hidden));
    window.addEventListener("pagehide", () => soon(true));
    if (onHub) setInterval(() => { if (!document.hidden) soon(true); }, 60000);
  }

  if (!onHub) autoSave();

  return {
    ready,
    LINK_MINUTES,
    user, signUp, logIn, logOut, sync, phoneLink, takeLink, autoSave,
    email: () => local.get("email"),
    signedIn: () => !!local.get("uid"),
    lastSaved: () => Number(local.get("savedAt") || 0),
    onData: (fn) => listeners.push(fn),
    // the "want to sign up?" pop-up: not more than once a week, never again after "Don't ask again"
    shouldAsk() {
      if (!ready || local.get("uid")) return false;
      const n = local.get("nag");
      return n !== "never" && Date.now() - Number(n || 0) > 7 * 86400000;
    },
    snooze(forever) { local.set("nag", forever ? "never" : String(Date.now())); },
  };
})();
