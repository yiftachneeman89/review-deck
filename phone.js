// "Open on phone": your project, progress and Gemini key, copied from this computer to your phone
// through a QR code - no account, nothing to install.
//
// The computer packs everything, locks it (AES-GCM) with a random key, and puts the locked file on
// ntfy.sh, a free public relay that deletes files after 3 hours. The key exists only in the QR code
// (after the #, which browsers never send to any server), so ntfy.sh only ever holds scrambled data.
// The phone downloads the file, unlocks it and keeps everything in its own browser.

const Phone = (() => {
  const RELAY = "https://ntfy.sh";
  const HOME = "/review-deck/";
  const HOURS = 3;                                  // how long ntfy.sh keeps the file
  const MAX = 14 * 1024 * 1024;                     // ntfy.sh takes files up to 15 MB
  const SYNCED = /^(rd|cc|sm|dc)\./;
  const OWN = /^rd\.(phone\.|morning$)/;            // this device's own: never copied

  // ---------------------------------------------------------------- helpers

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  function hash(s) {
    if (s == null) return null;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return `${s.length}.${(h >>> 0).toString(36)}`;
  }

  function settings() {
    const out = {};
    try { for (const k of Object.keys(localStorage)) if (SYNCED.test(k) && !OWN.test(k)) out[k] = localStorage.getItem(k); } catch {}
    return out;
  }

  const gzip = (blob) => new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const gunzip = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();

  // [4-byte header length][header JSON][file bytes...]
  function packParts(head, files) {
    const h = new TextEncoder().encode(JSON.stringify(head));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, h.length);
    return new Blob([len, h, ...files]);
  }

  function unpackParts(buf) {
    const len = new DataView(buf).getUint32(0);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len)));
    return { head, at: 4 + len };
  }

  // ---------------------------------------------------------------- on the computer

  // -> { url, expires } for the QR code
  async function send() {
    const saved = await DeckStore.load();
    if (!saved) throw new Error("Set up your project here first.");
    const head = {
      v: 1,
      sentAt: Date.now(),
      settings: settings(),
      project: saved.project,
      files: saved.items.map(({ path, file }) => ({ path, type: file.type, size: file.size })),
    };
    const packed = await gzip(packParts(head, saved.items.map(({ file }) => file)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ck = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const locked = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, ck, packed));
    if (locked.length + iv.length > MAX) throw new Error(`Your project is ${Math.round(locked.length / 1048576)} MB packed - too big to send to a phone (the limit is 14 MB).`);

    const topic = "rd" + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    let res;
    try {
      res = await fetch(`${RELAY}/${topic}`, { method: "PUT", headers: { Filename: "review-deck.bin" }, body: new Blob([iv, locked]) });
    } catch { throw new Error("Couldn't reach ntfy.sh to send it. Check your connection and try again."); }
    if (!res.ok) throw new Error(`ntfy.sh didn't take the file (${res.status}). Try again in a minute.`);
    return { url: `${location.origin}${HOME}#phone=${topic}.${b64url(key)}`, expires: Date.now() + HOURS * 3600000 };
  }

  // ---------------------------------------------------------------- on the phone

  const link = () => location.hash.match(/^#phone=(rd[0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/);

  // -> { project: bool, settings: n } after taking in what the computer sent
  async function receive() {
    const m = link();
    if (!m) return null;
    history.replaceState(null, "", location.pathname + location.search);
    const [, topic, keyText] = m;
    const gone = `This code is older than ${HOURS} hours. Press “Open on phone” on your computer for a new one.`;

    let file;
    try {
      const lines = (await (await fetch(`${RELAY}/${topic}/json?poll=1`)).text()).trim().split("\n").filter(Boolean);
      const msg = lines.map((l) => JSON.parse(l)).reverse().find((x) => x.attachment?.url);
      if (!msg) throw new Error(gone);
      const r = await fetch(msg.attachment.url);
      if (!r.ok) throw new Error(gone);
      file = new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      throw e.message === gone ? e : new Error("Couldn't download your data. Check the phone's connection and scan again.");
    }

    let buf;
    try {
      const ck = await crypto.subtle.importKey("raw", unb64url(keyText), "AES-GCM", false, ["decrypt"]);
      buf = await gunzip(await crypto.subtle.decrypt({ name: "AES-GCM", iv: file.slice(0, 12) }, ck, file.slice(12)));
    } catch { throw new Error("That code didn't unlock the data. Scan the QR code again."); }

    const { head, at } = unpackParts(buf);
    let pos = at;
    const items = head.files.map(({ path, type, size }) => {
      const f = new File([buf.slice(pos, pos + size)], path.split("/").pop(), { type });
      pos += size;
      return { path, file: f };
    });

    // settings and progress: whatever you changed on this phone since the last copy stays;
    // everything else takes the computer's version
    const base = (() => { try { return JSON.parse(localStorage.getItem("rd.phone.base")) || {}; } catch { return {}; } })();
    const nextBase = {};
    let n = 0;
    for (const [k, v] of Object.entries(head.settings)) {
      let mine = null;
      try { mine = localStorage.getItem(k); } catch {}
      if (mine != null && mine !== v && hash(mine) !== base[k]) { nextBase[k] = base[k] ?? null; continue; }
      try { localStorage.setItem(k, v); n++; } catch {}
      nextBase[k] = hash(v);
    }
    try { localStorage.setItem("rd.phone.base", JSON.stringify(nextBase)); localStorage.setItem("rd.phone.from", String(head.sentAt)); } catch {}

    // the code - unless this device keeps its own copy in step with a folder (scanned on the computer itself)
    const here = await DeckStore.project();
    let project = false;
    if (!here?.linked) {
      await DeckStore.adopt(head.project, items);
      project = true;
    }
    return { project, settings: n };
  }

  return {
    HOURS,
    send,
    receive,
    hasLink: () => !!link(),
    copiedAt: () => { try { return Number(localStorage.getItem("rd.phone.from")) || 0; } catch { return 0; } },
  };
})();
