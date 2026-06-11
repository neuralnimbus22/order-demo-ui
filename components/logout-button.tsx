"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid="header-logout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        // Full navigation so the server-rendered header picks up the cleared
        // cookie immediately.
        window.location.assign("/");
      }}
      className="font-medium text-stone-600 transition-colors hover:text-stone-900 disabled:opacity-50"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
