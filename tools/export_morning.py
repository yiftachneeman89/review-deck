"""Export Morning Code Check (the local desktop app) progress for Code Check / Review Deck.

Default: writes code-check-progress.json (rounds, answers, scores, used chunks - no key, no code)
into the root of the project folder. When you set up Code Check or Review Deck and pick that folder,
the progress is found and merged automatically.

--full writes everything (also the code and the Gemini key) to the given output file instead.

usage: python export_morning.py [path-to-IntuiteacherDailyQuiz] [--full output.json]
"""
import json
import os
import re
import sys
from pathlib import Path

SOURCE_LANGS = {
    "java": "java", "kt": "kotlin", "kts": "kotlin", "scala": "scala", "groovy": "groovy", "gradle": "groovy",
    "js": "javascript", "mjs": "javascript", "cjs": "javascript", "jsx": "javascript",
    "ts": "typescript", "tsx": "typescript", "vue": "xml", "svelte": "xml",
    "py": "python", "rb": "ruby", "php": "php", "go": "go", "rs": "rust", "swift": "swift", "dart": "dart",
    "c": "c", "h": "c", "cc": "cpp", "cpp": "cpp", "cxx": "cpp", "hpp": "cpp", "hh": "cpp", "cs": "csharp",
    "m": "objectivec", "mm": "objectivec", "lua": "lua", "r": "r", "jl": "julia", "ex": "elixir", "exs": "elixir",
    "sh": "bash", "ps1": "powershell", "sql": "sql",
    "html": "xml", "htm": "xml", "xml": "xml", "css": "css", "scss": "scss", "less": "less",
}
SKIP_DIRS = {
    ".git", ".svn", ".hg", "node_modules", "bower_components", "vendor", "build", "dist", "out", "target",
    ".gradle", ".idea", ".vscode", ".vs", "venv", ".venv", "env", "__pycache__", ".pytest_cache", ".mypy_cache",
    "bin", "obj", "Pods", "DerivedData", ".next", ".nuxt", ".svelte-kit", "coverage", ".dart_tool",
    "generated", "intermediates", ".cxx", "site-packages", ".expo", ".angular", ".cache", "tmp",
}
MAX_FILE_BYTES = 300 * 1024
MAX_TOTAL_BYTES = 8 * 1024 * 1024
MAX_FILES = 3000
SECRET_RE = re.compile(r"AIza[0-9A-Za-z_\-]{30,}|AQ\.[0-9A-Za-z_\-]{30,}|sk-ant-[0-9A-Za-z_\-]+|sk-[0-9A-Za-z]{32,}|gh[pousr]_[0-9A-Za-z]{30,}")
LANG_NAMES = {"java": "Java", "kotlin": "Kotlin", "xml": "HTML/XML", "javascript": "JavaScript", "typescript": "TypeScript", "python": "Python", "groovy": "Groovy"}


# same rules as code-check/js/ingest.js langFor() / skippedDir()
def lang_for(path):
    name = path.split("/")[-1]
    if re.search(r"\.min\.(js|css)$", name) or re.search(r"(^|\.)(lock|map)$", name) or name == "package-lock.json":
        return None
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    lang = SOURCE_LANGS.get(ext)
    if not lang:
        return None
    parts = path.split("/")
    res = len(parts) - 1 - parts[::-1].index("res") if "res" in parts else -1
    if ext == "xml" and 0 <= res < len(parts) - 2 and not re.match(r"^(layout|values|menu|navigation)", parts[res + 1]):
        return None
    return lang


def skipped_dir(path):
    return any(p in SKIP_DIRS or (p.startswith(".") and len(p) > 1) for p in path.split("/")[:-1])


def read_project(root):
    paths = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            full = Path(dirpath) / f
            paths.append(full.relative_to(root).as_posix())
    files, total = [], 0
    for rel in sorted(paths):  # JS sorts with localeCompare; close enough for picking
        lang = lang_for(rel)
        full = Path(root) / rel
        size = full.stat().st_size
        if not lang or skipped_dir(rel) or size > MAX_FILE_BYTES or size == 0:
            continue
        if len(files) >= MAX_FILES or total + size > MAX_TOTAL_BYTES:
            continue
        text = full.read_bytes().decode("utf-8", errors="replace")
        if "\x00" in text:
            continue
        total += size
        files.append({"path": rel, "lang": lang, "code": SECRET_RE.sub("<API_KEY>", text.replace("\r\n", "\n").replace("\r", "\n"))})
    return files


def main_language(files):
    lines = {}
    for f in files:
        lines[f["lang"]] = lines.get(f["lang"], 0) + f["code"].count("\n") + 1
    ranked = sorted(lines.items(), key=lambda kv: -kv[1])
    code = next((kv for kv in ranked if kv[0] not in ("xml", "css", "scss", "less")), ranked[0] if ranked else None)
    return LANG_NAMES.get(code[0], code[0]) if code else "code"


def main():
    app_dir = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path.home() / "IntuiteacherDailyQuiz")
    full = "--full" in sys.argv
    config = json.loads((app_dir / "config.json").read_text(encoding="utf-8"))
    project_root = Path(config["project_path"])
    files = read_project(project_root)
    rounds = {}
    for f in sorted((app_dir / "data" / "days").glob("*.json")):
        state = json.loads(f.read_text(encoding="utf-8"))
        rid = f.stem
        state["round_id"] = rid
        state.setdefault("date", rid[:10])
        state.setdefault("answers", {})
        rounds[rid] = state
    used_file = app_dir / "data" / "used.json"
    used = json.loads(used_file.read_text(encoding="utf-8")) if used_file.exists() else []
    if not full:
        out = project_root / "code-check-progress.json"
        progress = {"format": "code-check/progress@1", "project": project_root.name, "rounds": rounds, "used": used}
        out.write_text(json.dumps(progress, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{out}: {len(rounds)} rounds, {sum(len(r['answers']) for r in rounds.values())} answers (no key, no code)")
        return
    out = Path(sys.argv[sys.argv.index("--full") + 1])
    export = {
        "format": "review-deck/code-check-import@1",
        "key": config.get("gemini_api_key", ""),
        "project": {"name": project_root.name, "language": main_language(files), "files": len(files),
                    "lines": sum(f["code"].count("\n") + 1 for f in files)},
        "files": files,
        "rounds": rounds,
        "used": used,
    }
    out.write_text(json.dumps(export, ensure_ascii=False), encoding="utf-8")
    answered = sum(len(r["answers"]) for r in rounds.values())
    print(f"{out}: {len(files)} files, {len(rounds)} rounds, {answered} answers")


if __name__ == "__main__":
    main()
