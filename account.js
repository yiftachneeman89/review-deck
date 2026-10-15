// Review Deck account: your project and progress saved to your account (Firebase, collection
// "review deck"), so another device - your phone, through "Open on phone" - opens with the same data.
// Loaded by Review Deck's pages and, once you're signed in, by the three tools (see account-hook.js).
//
// review deck/{owner}              owner, email, members (linked phones), state_at, stateParts, project_at, projectParts
// review deck/{owner}/state/{i}    every rd. / cc. / sm. / dc. setting (progress, quiz, caches, Gemini key) as JSON, in parts
// review deck/{owner}/project/{i}  the project files, packed and gzipped, in parts (a Firestore doc holds at most 1 MB)
// review deck/{owner}/links/{id}   "Open on phone" codes: claimed once by the phone within 10 minutes
//
// Each device merges: a value you changed here since the last save wins, anything else takes the account's copy.

const Account = (() => {
  const cfg = window.RD_ACCOUNT || {};
  const ready = !!(cfg.apiKey && cfg.projectId && window.firebase);
  const COLL = "review deck";
  const HOME = "/review-deck/";
  const onHub = location.pathname.startsWith(HOME);
  const SYNCED = /^(rd|cc|sm|dc)\./;
  const OWN = /^rd\.acct\./;           // this device's account bookkeeping, never synced
  const LINK_MINUTES = 10;
  const STATE_PART = 250000;           // characters per state part (stays under 1 MB even as UTF-8)
  const PROJECT_PART = 900000;         // bytes per project part

  let auth = null, db = null, authReady = null;
  if (ready) {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(Object.fromEntries(Object.entries(cfg).filter(([, v]) => v)));
    auth = app.auth();
    db = app.firestore();
    authReady = new Promise((ok) => { const off = auth.onAuthStateChanged(() => { off(); ok(); }); });
  }

  // ---------------------------------------------------------------- this device's bookkeeping

  const local = {
    get(k) { try { return localStorage.getItem("rd.acct." + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("rd.acct." + k, v); } catch {} },
    json(k, d) { try { return JSON.parse(this.get(k)) ?? d; } catch { return d; } },
    setJson(k, v) { this.set(k, JSON.stringify(v)); },
    clear() {
      try { Object.keys(localStorage).filter((k) => OWN.test(k) && k !== "rd.acct.nag").forEach((k) => localStorage.removeItem(k)); } catch {}
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
  const sameState = (a, b) => {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
  };

  // ---------------------------------------------------------------- the project as one file

  async function pack(project, items) {
    const head = new TextEncoder().encode(JSON.stringify({
      project, files: items.map(({ path, file }) => ({ path, type: file.type, size: file.size })),
    }));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, head.length);
    const raw = new Blob([len, head, ...items.map(({ file }) => file)]);
    return new Uint8Array(await new Response(raw.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  }

  async function unpack(bytes) {
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
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

  // ---------------------------------------------------------------- big values as several docs

  const deckRef = (owner) => db.collection(COLL).doc(owner);

  async function writeParts(owner, sub, parts, oldCount = 0) {
    const col = deckRef(owner).collection(sub);
    for (let i = 0; i < Math.max(parts.length, oldCount); i += 8) {
      const batch = db.batch();
      for (let j = i; j < Math.min(i + 8, Math.max(parts.length, oldCount)); j++) {
        if (j < parts.length) batch.set(col.doc(String(j)), { data: parts[j] });
        else batch.delete(col.doc(String(j)));
      }
      await batch.commit();
    }
  }

  async function readParts(owner, sub, count) {
    const col = deckRef(owner).collection(sub);
    const snaps = await Promise.all(Array.from({ length: count }, (_, i) => col.doc(String(i)).get()));
    return snaps.map((s) => s.exists ? s.data().data : null);
  }

  function split(s, n) { const out = []; for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n)); return out.length ? out : [""]; }

  // ---------------------------------------------------------------- who's signed in

  async function user() {
    if (!ready) return null;
    await authReady;
    const u = auth.currentUser;
    if (!u && local.get("uid")) local.clear();         // signed out elsewhere
    if (u && local.get("uid") !== u.uid) remember(u);
    return u;
  }

  function remember(u, owner = u.uid, email = u.email) {
    if (local.get("uid") !== u.uid || (local.get("owner") || u.uid) !== owner) {
      local.clear();                                    // another account than last time: start the merge fresh
      local.set("uid", u.uid);
    }
    local.set("owner", owner);
    if (email) local.set("email", email);
  }

  const friendly = (e) => {
    const c = e?.code || "", m = String(e?.message || e);
    if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(c)) return "That email and password don't match an account.";
    if (c.includes("email-already-in-use")) return "There's already an account with that email (maybe from IntuiTeacher Guitar). Log in with its password instead.";
    if (c.includes("weak-password")) return "Use a password of at least 6 characters.";
    if (c.includes("invalid-email")) return "That doesn't look like an email address.";
    if (c.includes("too-many-requests")) return "Too many tries. Wait a minute and try again.";
    if (c.includes("operation-not-allowed") || c.includes("admin-restricted-operation")) return "This sign-in method is switched off in Firebase (Authentication → Sign-in method).";
    if (c.includes("permission-denied")) return "Firebase refused it. Check that the Review Deck rules are added (tools/firestore-rules.txt).";
    if (c.includes("network-request-failed") || c.includes("unavailable")) return "Couldn't reach the account server. Check your connection and try again.";
    if (/api-key|API key/i.test(c + m)) return "Firebase didn't accept the web key in account-config.js.";
    return m;
  };

  async function signUp(email, password) {
    try {
      const { user: u } = await auth.createUserWithEmailAndPassword(email, password);
      remember(u);
    } catch (e) { throw new Error(friendly(e)); }
    return { confirm: false, result: await sync({ apply: true }).catch((e) => { throw new Error(friendly(e)); }) };
  }

  async function logIn(email, password) {
    try {
      const { user: u } = await auth.signInWithEmailAndPassword(email, password);
      remember(u);
    } catch (e) { throw new Error(friendly(e)); }
    return sync({ apply: true }).catch((e) => { throw new Error(friendly(e)); });
  }

  async function logOut() {
    if (ready) await auth.signOut().catch(() => {});
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

  async function doSync({ apply = onHub } = {}) {
    const u = await user();
    if (!u) return null;
    const owner = local.get("owner") || u.uid;
    const isOwner = owner === u.uid;
    const ref = deckRef(owner);
    const snap = await ref.get();
    const head = snap.exists ? snap.data() : null;
    if (!head && !isOwner) throw new Error("This phone isn't linked to an account any more. Use “Open on phone” on your computer again.");
    if (isOwner) await takeClaims(ref);

    // ---- settings and progress
    const base = local.json("base", {});
    const mine = snapshot();
    let theirs = null;
    if (head && head.state_at > Number(local.get("stateAt") || 0)) {
      const parts = await readParts(owner, "state", head.stateParts || 0);
      theirs = parts.includes(null) ? null : JSON.parse(parts.join("") || "{}");
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
      const parts = split(JSON.stringify(merged), STATE_PART);
      await writeParts(owner, "state", parts, head?.stateParts || 0);
      if (!head) await ref.set({ owner, email: u.email || "", members: [], state_at: now, stateParts: parts.length, project_at: 0, projectParts: 0 });
      else await ref.update({ state_at: now, stateParts: parts.length });
    }
    local.setJson("base", newBase);
    // with changes left for Review Deck to apply, it has to fetch the account's copy again next time
    if (!skipped) local.set("stateAt", String(push ? now : head?.state_at || 0));
    if (head?.email && !u.email) local.set("email", head.email);

    // ---- the project files (only Review Deck moves these; a folder-linked device always wins)
    let adopted = false, uploaded = false;
    if (onHub && typeof DeckStore !== "undefined") {
      const proj = await DeckStore.project();
      const cloudAt = head?.project_at || 0;
      if (proj && proj.savedAt > cloudAt) {
        const saved = await DeckStore.load();
        if (saved) {
          const bytes = await pack(saved.project, saved.items);
          const parts = [];
          for (let i = 0; i < bytes.length; i += PROJECT_PART) parts.push(firebase.firestore.Blob.fromUint8Array(bytes.subarray(i, i + PROJECT_PART)));
          await writeParts(owner, "project", parts, head?.projectParts || 0);
          await ref.update({ project_at: proj.savedAt, projectParts: parts.length });
          uploaded = true;
        }
      } else if (cloudAt > (proj?.savedAt || 0) && !proj?.linked && head.projectParts) {
        const parts = await readParts(owner, "project", head.projectParts);
        if (!parts.includes(null)) {
          const chunks = parts.map((b) => b.toUint8Array());
          const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let at = 0;
          for (const c of chunks) { bytes.set(c, at); at += c.length; }
          const got = await unpack(bytes);
          await DeckStore.adopt(got.project, got.items);
          adopted = true;
        }
      }
    }

    local.set("savedAt", String(Date.now()));
    return { applied, adopted, uploaded, pushed: push };
  }

  // ---------------------------------------------------------------- open on phone
  // The computer makes a one-time code; the phone signs in anonymously and claims it; the computer
  // then adds the phone to the account's members, which lets it read and save the same data.

  async function claimOne(ref, linkDoc) {
    const { claimedBy } = linkDoc.data();
    if (claimedBy) await ref.update({ members: firebase.firestore.FieldValue.arrayUnion(claimedBy) });
    await linkDoc.ref.delete();
  }

  // claimed codes the computer hasn't seen yet (the QR window was closed early), and old unused ones
  async function takeClaims(ref) {
    const links = await ref.collection("links").get();
    for (const d of links.docs) {
      const { claimedBy, created } = d.data();
      if (claimedBy || (created && Date.now() - created.toMillis() > 86400000)) await claimOne(ref, d);
    }
  }

  // -> { url, watch(onPhone) -> stop }. Throws { code: "signin" } when nobody is signed in.
  async function phoneLink() {
    const u = await user();
    if (!u) throw Object.assign(new Error("Sign in first."), { code: "signin" });
    if (u.isAnonymous) throw new Error("Make phone codes on a computer where you logged in with your email.");
    await sync();                                         // the phone gets what you see now
    const ref = deckRef(u.uid);
    const id = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const link = ref.collection("links").doc(id);
    try { await link.set({ created: firebase.firestore.FieldValue.serverTimestamp(), claimedBy: null }); }
    catch (e) { throw new Error(friendly(e)); }
    return {
      url: `${location.origin}${HOME}#phone=${u.uid}.${id}`,
      watch(onPhone) {
        return link.onSnapshot(async (s) => {
          if (s.exists && s.data().claimedBy) { await claimOne(ref, s).catch(() => {}); onPhone(); }
        }, () => {});
      },
    };
  }

  // on the phone: the code from the QR -> signed in, with your data
  async function takeLink() {
    const m = location.hash.match(/^#phone=([A-Za-z0-9]+)\.([0-9a-f]{20,})$/);
    if (!m || !ready) return null;
    history.replaceState(null, "", location.pathname + location.search);
    const [, owner, id] = m;
    const expired = `This code was used already or is older than ${LINK_MINUTES} minutes. Press “Open on phone” on your computer for a new one.`;
    await authReady;
    let u = auth.currentUser;
    if (u && u.uid === owner) return sync({ apply: true });  // scanned on the computer it came from
    if (!u || !u.isAnonymous) {
      if (u) await auth.signOut();
      try { u = (await auth.signInAnonymously()).user; } catch (e) { throw new Error(friendly(e)); }
    }
    try { await deckRef(owner).collection("links").doc(id).update({ claimedBy: u.uid }); }
    catch (e) { throw new Error(/not-found|permission-denied/.test(e?.code || "") ? expired : friendly(e)); }
    // the computer adds this phone to the account (right away while its QR code is open)
    for (let i = 0; i < 80; i++) {
      try {
        const s = await deckRef(owner).get();
        if (s.exists) { remember(u, owner, s.data().email); return sync({ apply: true }); }
      } catch (e) { if (!/permission-denied/.test(e?.code || "")) throw new Error(friendly(e)); }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Your computer didn't confirm the phone. Open Review Deck on your computer, then scan a new code.");
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
    user, signUp, logIn, logOut, sync, phoneLink, takeLink, autoSave, friendly,
    email: () => local.get("email"),
    signedIn: () => !!local.get("uid"),
    isPhone: () => !!local.get("uid") && (local.get("owner") || local.get("uid")) !== local.get("uid"),  // linked by a QR code
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
