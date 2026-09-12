(function () {
  "use strict";

  const LS_LAST_SEEN = (wall) => `social_wall_last_seen_${wall}`;
  const LS_LATEST = (wall) => `social_wall_last_latest_${wall}`;

  function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function getInt(key) {
    const v = localStorage.getItem(key);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function setInt(key, val) {
    const n = Math.floor(Number(val) || 0);
    if (n > 0) localStorage.setItem(key, String(n));
  }

  function getLastSeen(wall) {
    return getInt(LS_LAST_SEEN(wall));
  }

  function setLastSeen(wall, epoch) {
    setInt(LS_LAST_SEEN(wall), epoch);
  }

  function getCachedLatest(wall) {
    return getInt(LS_LATEST(wall));
  }

  function setCachedLatest(wall, epoch) {
    setInt(LS_LATEST(wall), epoch);
  }

  async function fetchLatestEpoch(wall) {
    const url = `/php/social/latest_epoch.php?wall=${encodeURIComponent(wall)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`latest_epoch.php HTTP ${res.status}`);
    const data = await res.json();
    const latest = Number(data && data.latest_epoch) || 0;
    return latest > 0 ? Math.floor(latest) : 0;
  }

  function addFlash(el) { el.classList.add("flashSocial"); }
  function removeFlash(el) { el.classList.remove("flashSocial"); }

  window.setupSocialFlash = function setupSocialFlash(buttonId, wall, minutesWindow) {
    const el = document.getElementById(buttonId);
    if (!el) return;

    const windowSeconds = (Number(minutesWindow) || 48) * 60;

    async function tick() {
      try {
        const latest = await fetchLatestEpoch(wall);
        if (latest > 0) setCachedLatest(wall, latest);

        const lastSeen = getLastSeen(wall);
        const age = nowEpochSeconds() - latest;

        const isNewSinceSeen = latest > lastSeen;
        const isRecent = latest > 0 && age >= 0 && age <= windowSeconds;

        if (isNewSinceSeen && isRecent) addFlash(el);
        else removeFlash(el);
      } catch (e) {
        removeFlash(el);
      }
    }

    // IMPORTANT: mark "seen" even if we don't have cachedLatest yet
    el.addEventListener("click", () => {
      const latestCached = getCachedLatest(wall);
      const seen = Math.max(latestCached, nowEpochSeconds()); // <-- key fix
      setLastSeen(wall, seen);
      removeFlash(el);
    });

    // Handles returning via back/forward cache
    window.addEventListener("pageshow", () => tick());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });

    tick();
    setInterval(tick, 60 * 1000);
  };
})();