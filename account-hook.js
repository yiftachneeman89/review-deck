// Loaded by Code Check, Screen Map and Design Critic. Signed in to a Review Deck account:
// loads the account code, which saves this tool's progress to your account when you leave it.
(() => {
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("rd.acct.uid"); } catch {}
  if (!signedIn) return;
  const FB = "https://www.gstatic.com/firebasejs/10.12.2/firebase-";
  const queue = [FB + "app-compat.js", FB + "auth-compat.js", FB + "firestore-compat.js", "/review-deck/account-config.js?v=2", "/review-deck/account.js?v=2"];
  const next = () => {
    const src = queue.shift();
    if (!src) return;
    const s = document.createElement("script");
    s.src = src;
    s.onload = next;
    document.head.appendChild(s);
  };
  next();
})();
