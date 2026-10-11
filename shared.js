// Review Deck shared project store - loaded by Review Deck, Code Check, Screen Map and Design Critic
// (all on yiftachneeman89.github.io, so they share this browser's IndexedDB).
// Review Deck's sign-in saves the picked project folder here once; every tool reads it from here.

const DeckStore = (() => {
  const DB = "review-deck";
  const HOME = "/review-deck/";

  // what any of the tools can use: source code, Android resources, images and fonts
  const SKIP = new Set([".git", ".svn", ".hg", "node_modules", "bower_components", "vendor", "build", "dist", "out", "target",
    ".gradle", ".idea", ".vscode", ".vs", "venv", ".venv", "env", "__pycache__", "bin", "obj", "Pods", "DerivedData",
    ".next", ".nuxt", "coverage", ".dart_tool", "generated", "intermediates", ".cxx", ".externalNativeBuild", "site-packages", "captures", "tmp", ".cache"]);
  const TEXT = new Set(["java", "kt", "kts", "xml", "gradle", "groovy", "scala", "js", "mjs", "cjs", "jsx", "ts", "tsx", "vue", "svelte",
    "py", "rb", "php", "go", "rs", "swift", "dart", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "m", "mm", "lua", "r", "jl",
    "ex", "exs", "sh", "ps1", "sql", "html", "htm", "css", "scss", "less", "json", "toml", "properties"]);
  const BINARY = new Set(["png", "jpg", "jpeg", "webp", "gif", "ttf", "otf"]);
  const MAX_TEXT = 1024 * 1024, MAX_BINARY = 6 * 1024 * 1024, MAX_TOTAL = 80 * 1024 * 1024;

  function open() {
    return new Promise((ok, fail) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(new Error("This browser won't let the site save your project. Turn off private browsing and try again."));
    });
  }

  async function put(entries) {
    const db = await open();
    await new Promise((ok, fail) => {
      const tx = db.transaction("kv", "readwrite");
      for (const [k, v] of entries) tx.objectStore("kv").put(v, k);
      tx.oncomplete = ok;
      tx.onerror = () => fail(tx.error);
    });
    db.close();
  }

  async function get(key) {
    const db = await open();
    const value = await new Promise((ok, fail) => {
      const req = db.transaction("kv").objectStore("kv").get(key);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
    db.close();
    return value;
  }

  function keepForever() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  }

  function wanted(path, size) {
    const parts = path.split("/");
    if (parts.slice(0, -1).some((p) => SKIP.has(p) || (p.startsWith(".") && p.length > 1))) return false;
    const name = parts[parts.length - 1];
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    if (TEXT.has(ext)) return size > 0 && size <= MAX_TEXT && !/(^|\.)(lock|map)$|\.min\.(js|css)$|^package-lock\.json$/.test(name);
    return BINARY.has(ext) && size <= MAX_BINARY;
  }

  return {
    HOME,
    keepForever,

    // [{path, file}] from a folder pick or drop -> saved for every tool. Returns the saved project info.
    async save(name, items) {
      const keep = [];
      let total = 0;
      for (const { path, file } of items.slice().sort((a, b) => a.path.localeCompare(b.path))) {
        if (!wanted(path, file.size) || total + file.size > MAX_TOTAL) continue;
        total += file.size;
        // a real copy, so it survives the folder changing or moving
        keep.push({ path, file: new File([await file.arrayBuffer()], path.split("/").pop(), { type: file.type }) });
      }
      if (!keep.length) throw new Error("No code found in that folder. Pick the folder that contains your project.");
      const project = { name, files: keep.length, bytes: total, savedAt: Date.now() };
      await put([["items", keep], ["project", project]]);
      keepForever();
      return project;
    },

    async project() { return (await get("project").catch(() => null)) || null; },

    // -> { project, items: [{path, file}] } or null when nothing has been set up yet
    async load() {
      const project = await get("project").catch(() => null);
      if (!project) return null;
      const items = await get("items").catch(() => null);
      return items && items.length ? { project, items } : null;
    },

    // tools call this: the saved project, or off to Review Deck's sign-in
    async require() {
      const saved = await this.load();
      if (!saved) { location.replace(HOME); return new Promise(() => {}); }
      return saved;
    },
  };
})();
