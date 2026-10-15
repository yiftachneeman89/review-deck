// Loaded by Code Check, Screen Map and Design Critic. Signed in to a Review Deck account:
// loads the account code, which saves this tool's progress to your account when you leave it.
(() => {
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("rd.acct.uid"); } catch {}
  if (!signedIn) return;
  const add = (src, then) => {
    const s = document.createElement("script");
    s.src = src;
    if (then) s.onload = then;
    document.head.appendChild(s);
  };
  add("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js", () =>
    add("/review-deck/account-config.js?v=1", () => add("/review-deck/account.js?v=1")));
})();
