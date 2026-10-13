/* White/Black mode shared by Review Deck, Code Check, Screen Map and Design Critic.
   Loaded in <head> (not deferred) so the page never flashes the wrong colours.
   The choice lives in localStorage "rd.theme"; all four sites share the origin,
   so switching on one page updates every open tab through the storage event. */
(function () {
  var BG = { light: "#f4f3ef", dark: "#0e0e0f" };
  function read() {
    try { return localStorage.getItem("rd.theme") === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
  }
  function apply(theme) {
    var root = document.documentElement;
    if (theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = BG[theme];
    document.dispatchEvent(new CustomEvent("rd-theme", { detail: theme }));
  }
  apply(read());
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(read()); });
  window.addEventListener("storage", function (e) { if (e.key === "rd.theme") apply(read()); });
  window.RDTheme = {
    get: read,
    set: function (theme) {
      try { localStorage.setItem("rd.theme", theme); } catch (e) {}
      apply(theme === "dark" ? "dark" : "light");
    }
  };
})();
