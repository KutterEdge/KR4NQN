/* ============================================================
   5XJ Ranch — Shared Call Sign Verification / Adoption
   ============================================================
   Single source of truth for:
     - what a "valid" call sign format looks like
     - where Station 1 / Station 2 / fallback-name are stored
       (localStorage + cookie + server-side durable copy)
     - QRZ -> HamQTH verification (city/state/country, lat/lon
       when available, SWL handling)
     - the "auto-adopt into Station 1" rule used by every entry
       point that ISN'T the explicit Station 1 box + button:
       AIM chat box, OnTheAir.html's call sign field, and the
       initial call-sign popup.

   Loaded via <script src="js/callsign-shared.js"></script>
   BEFORE any page script that uses window.CallsignShared.

   Design notes (read before changing behavior):

   - "Auto-adopt" (checkAndAdoptStation1) is for passive entry
     points where the visitor didn't explicitly submit a
     Station 1 form: the AIM box and OnTheAir's call sign field.
     Rule, per site owner: if Station 1 already holds a call sign
     (which, going forward, only ever got there by passing
     verification — see below), leave it alone. Otherwise, adopt
     the candidate as this SESSION's identity right away — so the
     visitor has something to chat/plot with immediately, even if
     it's just a typed name — then verify it in the background.
     Only once verification actually succeeds does it get written
     to Station 1 storage for next visit. A candidate that never
     verifies (a bad call sign, a plain name, SWL-without-a-base,
     etc.) is used for this session only and is never saved —
     which also means it's never saved un-verified for someone
     else to see it treated as "confirmed" later.

   - A call sign only ever needs to be well-FORMED to be used as
     Station 1 for the current session — we never make "usable
     right now" depend on a successful QRZ/HamQTH lookup, so a bad
     network moment never blocks chat/plotting. Verification is
     what decides whether it's remembered for NEXT time.

   - An explicit Station 1 box submission (item 2) always wins;
     it's the one place a visitor is deliberately telling us
     their call sign, so it may overwrite whatever auto-adopt
     put there.
   ============================================================ */
(function (global) {
  'use strict';

  // ---------- Endpoints ----------
  var QRZ_LOOKUP_URL    = 'https://5xjranch.com/php/qrz_lookup.php';
  var HAMQTH_LOOKUP_URL = 'https://5xjranch.com/php/callsign_lookup.php';
  var CALL_STORE_URL = (global.location && global.location.origin && global.location.origin.indexOf('http') === 0)
    ? global.location.origin + '/php/callsign_store.php'
    : 'https://5xjranch.com/php/callsign_store.php';

  // ---------- Storage keys (unchanged from the pre-refactor code,
  // so nobody's already-saved call sign gets dropped) ----------
  var KEYS = {
    USER_CALLSIGN:  'newHamClockWeb.userCallsign.v3',
    DX_CALLSIGN:    'newHamClockWeb.dxCallsign.v2',
    USER_NAME:      'newHamClockWeb.userName.v1',
    RESET_ON_LOAD:  'newHamClockWeb.resetCallOnLoad.v2',
    AIM_CALLSIGN:   '5xjAimCallsign'
  };

  // Final local fallback if both QRZ and HamQTH are unreachable.
  var callsignDatabase = {
    'W5NF': { callsign: 'W5NF', grid: 'EL29da', lat: 29.02, lon: -95.72, timeZone: 'America/Chicago', city: 'Sweeny', state: 'TX', country: 'United States' }
  };

  var tzByCoordCache = new Map();

  // ---------- Basic helpers ----------
  function normalizeCallsign(cs) {
    return String(cs || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  // Format-only check. Deliberately permissive (also matches plain
  // names like "JOHN") — see the README note in the repo about the
  // AIM box tradeoff. This is the ONE gate for "is this worth saving
  // as an identifier", independent of whether QRZ/HamQTH ever
  // resolves it to a real location.
  function isValidCallFormat(cs) {
    return /^[A-Z0-9\/\-]{3,12}$/.test(normalizeCallsign(cs || ''));
  }

  function setCookie(name, value) {
    try {
      var maxAge = 60 * 60 * 24 * 365; // 1 year
      document.cookie = name + '=' + encodeURIComponent(value) +
        '; max-age=' + maxAge + '; path=/; SameSite=Lax';
    } catch (_) {}
  }
  function getCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : '';
    } catch (_) { return ''; }
  }

  // ---------- Server-side durable copy (survives iOS ITP) ----------
  function serverGetCallsign() {
    return fetch(CALL_STORE_URL + '?action=get', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.ok && d.callsign) return { callsign: d.callsign, name: d.name || '', dx: d.dx || '' };
        return null;
      })
      .catch(function () { return null; });
  }
  function serverSaveField(params) {
    try {
      var p = new URLSearchParams(params);
      fetch(CALL_STORE_URL + '?action=set&' + p.toString(), { credentials: 'same-origin', cache: 'no-store', keepalive: true });
    } catch (_) {}
  }
  function serverClearCallsign() {
    try { return fetch(CALL_STORE_URL + '?action=clear', { credentials: 'same-origin', cache: 'no-store', keepalive: true }); }
    catch (_) { return Promise.resolve(); }
  }

  // ---------- Station 1 / Station 2 / Name storage ----------
  function getStation1() {
    var v = '';
    try { v = (localStorage.getItem(KEYS.USER_CALLSIGN) || '').trim(); } catch (_) { v = ''; }
    if (!v) v = getCookie(KEYS.USER_CALLSIGN).trim();
    if (!v) {
      // Borrow from the AIM box's own copy if it has a well-formed
      // one and we have nothing of our own yet. This is a read-only
      // borrow: it's returned for THIS call so Station 1 has
      // something to show/use right away, but it is deliberately NOT
      // written into USER_CALLSIGN storage here. Persisting it is
      // checkAndAdoptStation1()'s job, and only happens once QRZ/HamQTH
      // has actually verified it — see the "save gate" note there. If
      // it's saved unconditionally here instead, an unverified call
      // sign typed into the AIM box would quietly become a "saved
      // Station 1" the very next time anything calls getStation1(),
      // without ever going through verification at all.
      var aim = '';
      try { aim = (localStorage.getItem(KEYS.AIM_CALLSIGN) || '').trim(); } catch (_) {}
      if (!aim) aim = getCookie(KEYS.AIM_CALLSIGN).trim();
      if (aim && isValidCallFormat(aim)) {
        v = normalizeCallsign(aim);
      }
    }
    return v;
  }
  function saveStation1(cs) {
    try { localStorage.setItem(KEYS.USER_CALLSIGN, cs); } catch (_) {}
    setCookie(KEYS.USER_CALLSIGN, cs);
    if (cs) serverSaveField({ callsign: cs });
  }
  // Removes ONLY the saved Station 1 call sign (local + cookie +
  // server) — unlike clearEverything(), this leaves any saved name
  // and Station 2 default alone. Used when a previously-saved
  // Station 1 no longer verifies on QRZ/HamQTH (see
  // ensureUserCallsignOnLoad()'s reverify-on-load in the clock
  // pages) so the visitor is re-prompted next load instead of the
  // page silently continuing to use a call sign that's gone stale.
  function clearStation1() {
    try { localStorage.removeItem(KEYS.USER_CALLSIGN); } catch (_) {}
    setCookie(KEYS.USER_CALLSIGN, '');
    // Best-effort: ask the server to drop just the callsign field.
    // callsign_store.php's own ?action=set handler is what decides
    // what an empty value means for that field; this assumes it
    // treats an empty callsign the same as "no call sign on file".
    serverSaveField({ callsign: '' });
  }
  function getStation2() {
    var v = '';
    try { v = (localStorage.getItem(KEYS.DX_CALLSIGN) || '').trim(); } catch (_) { v = ''; }
    if (!v) v = getCookie(KEYS.DX_CALLSIGN).trim();
    return v;
  }
  function saveStation2(cs) {
    try { localStorage.setItem(KEYS.DX_CALLSIGN, cs); } catch (_) {}
    setCookie(KEYS.DX_CALLSIGN, cs);
    if (cs) serverSaveField({ dx: cs });
  }
  function getUserName() {
    var v = '';
    try { v = (localStorage.getItem(KEYS.USER_NAME) || '').trim(); } catch (_) { v = ''; }
    if (!v) v = getCookie(KEYS.USER_NAME).trim();
    return v;
  }
  function saveUserName(name) {
    try { localStorage.setItem(KEYS.USER_NAME, name); } catch (_) {}
    setCookie(KEYS.USER_NAME, name);
    if (name) serverSaveField({ name: name });
  }
  function clearEverything() {
    try { localStorage.removeItem(KEYS.USER_CALLSIGN); } catch (_) {}
    try { localStorage.removeItem(KEYS.USER_NAME); } catch (_) {}
    try { localStorage.removeItem(KEYS.RESET_ON_LOAD); } catch (_) {}
    try { localStorage.removeItem(KEYS.AIM_CALLSIGN); } catch (_) {}
    setCookie(KEYS.USER_CALLSIGN, '');
    setCookie(KEYS.USER_NAME, '');
    setCookie(KEYS.AIM_CALLSIGN, '');
    return serverClearCallsign();
  }
  function recoverStation1FromServer() {
    if (getStation1()) return Promise.resolve(false);
    return serverGetCallsign().then(function (rec) {
      if (rec && rec.callsign) {
        saveStation1(rec.callsign);
        if (rec.name) saveUserName(rec.name);
        if (rec.dx) saveStation2(rec.dx);
        return true;
      }
      return false;
    });
  }

  // ---------- QRZ / HamQTH verification ----------
  function fetchQRZLookup(callsign) {
    var url = QRZ_LOOKUP_URL + '?callsign=' + encodeURIComponent(callsign);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && !data.error && data.callsign) {
          return {
            callsign: String(data.callsign).toUpperCase(),
            name: data.name || '',
            qth: data.qth || '',
            city: data.city || '',
            state: data.state || '',
            country: data.country || '',
            grid: data.grid || 'Unknown',
            lat: (data.lat !== '' && data.lat != null) ? parseFloat(data.lat) : null,
            lon: (data.lon !== '' && data.lon != null) ? parseFloat(data.lon) : null
          };
        }
        return null;
      })
      .catch(function (e) { console.warn('QRZ lookup error:', e); return null; });
  }

  function fetchHamQTHLookup(callsign) {
    var url = HAMQTH_LOOKUP_URL + '?callsign=' + encodeURIComponent(callsign);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.callsign) {
          return {
            callsign: String(data.callsign).toUpperCase(),
            name: data.name || '',
            qth: data.qth || '',
            city: data.city || '',
            state: data.state || '',
            country: data.country || '',
            grid: data.grid || 'Unknown',
            lat: (data.lat !== '' && data.lat != null) ? parseFloat(data.lat) : null,
            lon: (data.lon !== '' && data.lon != null) ? parseFloat(data.lon) : null
          };
        }
        return null;
      })
      .catch(function (e) { console.warn('HamQTH lookup error:', e); return null; });
  }

  function enrichWithLiveTimezone(data) {
    if (!data || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return Promise.resolve(data);
    var key = Number(data.lat).toFixed(2) + ',' + Number(data.lon).toFixed(2);
    if (tzByCoordCache.has(key)) return Promise.resolve(Object.assign(data, tzByCoordCache.get(key)));
    var url = 'https://timeapi.io/api/TimeZone/coordinate?latitude=' + encodeURIComponent(data.lat) + '&longitude=' + encodeURIComponent(data.lon);
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (tz) {
        if (tz) {
          var seconds = Number(tz && tz.currentUtcOffset && tz.currentUtcOffset.seconds);
          var enrich = {
            timeZone: (tz && tz.timeZone) || data.timeZone || null,
            offset: Number.isFinite(seconds) ? (seconds / 3600) : data.offset
          };
          tzByCoordCache.set(key, enrich);
          return Object.assign(data, enrich);
        }
        return data;
      })
      .catch(function (e) { console.warn('Timezone lookup error:', e); return data; });
  }

  // "W5NF/SWL" -> base W5NF. Bare listener IDs have no separable base.
  function stripSWLSuffix(callRaw) {
    var cs = normalizeCallsign(callRaw);
    var m = cs.match(/^([A-Z0-9]{3,})[\/\-]SWL$/);
    if (m) return { base: m[1], isSWL: true };
    return { base: '', isSWL: /SWL$/.test(cs) };
  }

  function hasCoords(d) { return !!d && Number.isFinite(d.lat) && Number.isFinite(d.lon); }
  function hasLocation(d) { return !!d && (d.country || d.city || d.state); }

  /* The single verification entry point. Tries QRZ, then HamQTH, then
     the SWL-base fallback, then the tiny local table. Returns:
       - a data object with as much of {city,state,country,grid,lat,lon}
         filled in as could be resolved (lat/lon may legitimately be
         null — callers must treat that as "gray out the map/bearing
         bits", not as an overall failure), or
       - null if NOTHING could be resolved at all (caller still keeps
         the call sign itself; there's just no location data for it). */
  function verifyCallsign(callsignRaw) {
    var upperCall = normalizeCallsign(callsignRaw);
    if (!upperCall) return Promise.resolve(null);

    function finish(data) {
      if (hasCoords(data)) {
        return enrichWithLiveTimezone(data).then(function (d) {
          if (d.offset == null) d.offset = Math.round(d.lon / 15);
          return d;
        });
      }
      return data;
    }

    return fetchQRZLookup(upperCall).then(function (qrzData) {
      if (hasCoords(qrzData)) return finish(qrzData);

      return fetchHamQTHLookup(upperCall).then(function (hamData) {
        if (hasCoords(hamData)) return finish(hamData);
        if (hasLocation(qrzData)) return qrzData;
        if (hasLocation(hamData)) return hamData;

        var swl = stripSWLSuffix(upperCall);
        if (swl.base && swl.base !== upperCall) {
          return fetchQRZLookup(swl.base).then(function (bd) {
            if (!hasCoords(bd)) return fetchHamQTHLookup(swl.base).then(function (h) { return h; });
            return bd;
          }).then(function (bd) {
            if (hasCoords(bd)) {
              return finish(bd).then(function (d) {
                d.callsign = upperCall;
                d.isSWL = true;
                return d;
              });
            }
            if (callsignDatabase[upperCall]) return finish(Object.assign({}, callsignDatabase[upperCall]));
            return null;
          });
        }

        if (callsignDatabase[upperCall]) return finish(Object.assign({}, callsignDatabase[upperCall]));
        return null;
      });
    });
  }

  // ---------- Auto-adopt (items 3, 4, 5) ----------
  // Custom event fired on window whenever a passive entry point
  // successfully adopts a NEW Station 1 call sign, so any page
  // (or widget on the same page) can react without being tightly
  // coupled to where the adoption happened.
  //   detail: { callsign }            -- fired immediately on adopt
  //   '5xj:station1verified' detail: { callsign, data }  -- fired
  //     later if/when the background lookup resolves (data may still
  //     have null lat/lon; treat that as "no coords available").
  function fireAdopted(callsign) {
    try { global.dispatchEvent(new CustomEvent('5xj:station1adopted', { detail: { callsign: callsign } })); } catch (_) {}
  }
  function fireVerified(callsign, data) {
    try { global.dispatchEvent(new CustomEvent('5xj:station1verified', { detail: { callsign: callsign, data: data } })); } catch (_) {}
  }

  /* Call this from any passive entry point (AIM box, OnTheAir field).
     - Does nothing if Station 1 already holds a well-formed call sign
       (which, by construction going forward, means it already passed
       verification at some point — see the file header note).
     - Does nothing if the candidate isn't well-formed.
     - Otherwise, adopts the candidate as THIS SESSION's identity right
       away — fires '5xj:station1adopted' immediately so any listener
       (chat, presence, the map) can use it now — but does NOT write it
       to Station 1 storage yet. It's verified in the background, and
       only written to storage (so it comes back next visit) once that
       verification actually succeeds. A candidate that never verifies
       stays usable for the rest of this session (the event already
       fired, and callers keep using whatever they adopted) but is
       simply never saved — next page load starts the prompt over.
     Returns the adopted call sign, or '' if nothing was adopted. */
  function checkAndAdoptStation1(candidateRaw) {
    var candidate = normalizeCallsign(candidateRaw);
    if (!isValidCallFormat(candidate)) return '';

    var current = getStation1();
    if (current && isValidCallFormat(current)) return '';

    fireAdopted(candidate);

    verifyCallsign(candidate).then(function (data) {
      fireVerified(candidate, data);
      // The save gate: verifyCallsign() only ever returns non-null
      // when QRZ/HamQTH (or the SWL-base fallback, or the tiny local
      // table) actually resolved SOMETHING for this call sign — see
      // its own doc comment above. That's this project's whole
      // definition of "a valid ham call sign", so it's also the only
      // condition under which this gets remembered for next time.
      if (data) {
        saveStation1(candidate);
      }
    });

    return candidate;
  }

  // ---------- Public API ----------
  global.CallsignShared = {
    KEYS: KEYS,
    CALL_STORE_URL: CALL_STORE_URL,
    normalizeCallsign: normalizeCallsign,
    isValidCallFormat: isValidCallFormat,
    setCookie: setCookie,
    getCookie: getCookie,

    getStation1: getStation1,
    saveStation1: saveStation1,
    clearStation1: clearStation1,
    getStation2: getStation2,
    saveStation2: saveStation2,
    getUserName: getUserName,
    saveUserName: saveUserName,
    clearEverything: clearEverything,
    recoverStation1FromServer: recoverStation1FromServer,

    serverGetCallsign: serverGetCallsign,
    serverSaveField: serverSaveField,
    serverClearCallsign: serverClearCallsign,

    verifyCallsign: verifyCallsign,
    hasCoords: hasCoords,
    hasLocation: hasLocation,

    checkAndAdoptStation1: checkAndAdoptStation1
  };
})(window);
