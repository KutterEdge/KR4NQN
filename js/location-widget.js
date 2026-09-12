/* ============================================================
   5XJ Ranch — Latitude/Longitude Widget
   ============================================================
   Gives a visitor who doesn't have a resolvable ham call sign a
   way to tell us where they are, so everything that depends on
   location (Ranch Almanac, HF/MUF day-night calculations, etc.)
   works for them too -- not just for hams with a verified
   Station 1 call sign.

   Storage:
     - '5xj.locWidget.manual.v1' -- THIS widget's own record of a
       manually-entered location (map-link paste or device geo).
       Only this file ever writes it.
     - '5xj.hamLocation.v1' (SHARED_HAM_LOCATION_KEY) -- the
       cross-page shared location key already used by the HF/MUF/
       day-night resolvers (see hamClockWeb.html's
       resolveConditionsLocation()). Kept in sync here so those
       existing consumers keep working without any changes to them.

   Precedence, every page load:
     1) A per-visit override (paste or device geolocation) set while
        a Station 1 call sign was locked in -- for hams who travel
        and are visiting the site from somewhere other than their
        home QTH. Stored in sessionStorage only (see OVERRIDE_KEY),
        so it applies for this browser tab's session and is gone the
        next time the visitor opens the site -- their call sign's
        home QTH comes back automatically. A "Use my call sign
        location now" button clears it early.
     2) Otherwise, a verified Station 1 call sign (QRZ/HamQTH via
        updateCalls() in the host page) -- it's re-resolved fresh on
        every load, so it's this visitor's home QTH, not a stale
        guess. If THIS load's fresh re-verification is slow, fails,
        or hasn't started yet, the last-known Station 1 coordinates
        (and place label) cached from a previous successful load are
        used provisionally -- see readCachedStation1() -- so a single
        network hiccup never makes a ham with a perfectly good saved
        call sign see "we don't know your location."
     3) Otherwise, whatever this widget has saved manually (paste or
        device geolocation) for visitors with no call sign on file.
        Persisted in localStorage (see MANUAL_KEY) since there's no
        call sign to fall back to -- it's the only location they've
        got. Best-effort reverse-geocoded into a "City, State"/"City,
        Country" place label alongside the raw coordinates -- see
        enrichPlace().
     4) Otherwise, nothing -- the widget's title flashes for
        attention until something is saved.

   The paste box and "Use My Device Location" button are always
   available, even while a call sign location is locked in -- setting
   a new location there while locked creates a session-only override
   (tier 1) rather than touching the saved call sign or the
   persistent manual location.

   Events:
     - Listens for '5xj:station1locationResolved' (dispatched once,
       at the true end of updateCalls() in the host page -- see the
       comment there) to learn whether Station 1 resolved this load.
     - Dispatches '5xj:activeLocationChanged' with
       {lat, lon, source} (or null) whenever the winning location
       changes, so other widgets (Ranch Almanac) can react without
       needing to know anything about call signs or this widget.
   ============================================================ */
(function (global) {
  'use strict';

  var MANUAL_KEY = '5xj.locWidget.manual.v1';
  var OVERRIDE_KEY = '5xj.locWidget.override.v1'; // sessionStorage -- this visit only
  var SHARED_HAM_LOCATION_KEY = '5xj.hamLocation.v1';
  var MAPS_PROXY_URL = 'php/resolve_maps_link.php';
  var STATION_WAIT_TIMEOUT_MS = 8000;

  var widget, titleEl, bodyEl, currentEl, controlsEl, statusEl,
      pasteInput, updateBtn, deviceBtn, useStationBtn;

  var manualLoc = null;      // { lat, lon, source, ts, place } | null -- persisted, no-call-sign visitors
  var overrideLoc = null;    // { lat, lon, source, ts, place } | null -- this-visit-only, over a locked call sign
  var stationLoc = null;     // { lat, lon, callsign, place, stale } | null
  var stationChecked = false;
  var stationWaitTimer = null;

  // Free, no-API-key reverse geocoder -- same "no server-side secrets
  // needed" spirit as the site's other client-side lookups (ipwho.is,
  // Open-Meteo). Best-effort only: a manually-set location still works
  // fine with just coordinates if this fails or is slow.
  var REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

  function tr(key, fallback) {
    try { return (global._5xjLang && global._5xjLang[key]) || fallback; }
    catch (e) { return fallback; }
  }

  function loadManualLoc() {
    try {
      var v = JSON.parse(localStorage.getItem(MANUAL_KEY) || 'null');
      if (!v) return null;
      var lat = Number(v.lat), lon = Number(v.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return { lat: lat, lon: lon, source: String(v.source || 'manual-map-link'), ts: Number(v.ts) || 0, place: String(v.place || '') };
    } catch (e) { return null; }
  }

  function saveManualLoc(lat, lon, source) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    var rec = { lat: lat, lon: lon, source: source || 'manual-map-link', ts: Date.now(), place: '' };
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify(rec)); } catch (e) {}
    try {
      localStorage.setItem(SHARED_HAM_LOCATION_KEY, JSON.stringify({
        lat: lat, lon: lon, source: rec.source, label: '', callsign: '',
        updatedAt: new Date().toISOString()
      }));
    } catch (e) {}
    manualLoc = rec;
    return true;
  }

  function loadOverrideLoc() {
    try {
      var v = JSON.parse(sessionStorage.getItem(OVERRIDE_KEY) || 'null');
      if (!v) return null;
      var lat = Number(v.lat), lon = Number(v.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return { lat: lat, lon: lon, source: String(v.source || 'override-map-link'), ts: Number(v.ts) || 0, place: String(v.place || '') };
    } catch (e) { return null; }
  }

  function saveOverrideLoc(lat, lon, source) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    var rec = { lat: lat, lon: lon, source: source || 'override-map-link', ts: Date.now(), place: '' };
    try { sessionStorage.setItem(OVERRIDE_KEY, JSON.stringify(rec)); } catch (e) {}
    // Cross-page consumers (HF/MUF, day-night) read this key directly --
    // keep it pointed at whatever's actually active so they see the
    // override too, same as a plain manual save does.
    try {
      localStorage.setItem(SHARED_HAM_LOCATION_KEY, JSON.stringify({
        lat: lat, lon: lon, source: rec.source, label: '', callsign: '',
        updatedAt: new Date().toISOString()
      }));
    } catch (e) {}
    overrideLoc = rec;
    return true;
  }

  function clearOverrideLoc() {
    try { sessionStorage.removeItem(OVERRIDE_KEY); } catch (e) {}
    overrideLoc = null;
    // Restore the shared cross-page key to Station 1's location, if we
    // have one, so HF/MUF/day-night calculations switch back too.
    if (stationLoc) {
      try {
        localStorage.setItem(SHARED_HAM_LOCATION_KEY, JSON.stringify({
          lat: stationLoc.lat, lon: stationLoc.lon, source: 'station1',
          label: stationLoc.place || '', callsign: stationLoc.callsign || '',
          updatedAt: new Date().toISOString()
        }));
      } catch (e) {}
    }
  }

  // Best-effort: fills in a saved location's .place (e.g. "Sweeny, TX")
  // once the reverse-geocode call resolves, then re-renders. A slow or
  // failed lookup just leaves the widget showing coordinates only --
  // never blocks saving/using the location itself. `rec` is whichever
  // of manualLoc/overrideLoc this save just updated.
  function enrichPlace(rec, lat, lon) {
    reverseGeocode(lat, lon).then(function (place) {
      if (!place) return;
      // The visitor may have set a different location again while this
      // was in flight -- don't stomp a newer save with a stale answer.
      if (!rec || rec.lat !== lat || rec.lon !== lon) return;
      rec.place = place;
      var key = (rec === overrideLoc) ? OVERRIDE_KEY : MANUAL_KEY;
      var store = (rec === overrideLoc) ? sessionStorage : localStorage;
      try { store.setItem(key, JSON.stringify(rec)); } catch (e) {}
      render();
    });
  }

  function reverseGeocode(lat, lon) {
    var url = REVERSE_GEOCODE_URL + '?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&localityLanguage=en';
    return fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return '';
        var city = d.city || d.locality || '';
        var region = d.principalSubdivision || d.countryName || '';
        // Prefer a compact 2-letter state code for US results ("City,
        // TX") over the full subdivision name ("City, Texas"), matching
        // how Station 1's QRZ/HamQTH-derived place label looks.
        if (d.countryCode === 'US' && d.principalSubdivisionCode) {
          region = String(d.principalSubdivisionCode).replace(/^US-/, '');
        }
        if (city && region) return city + ', ' + region;
        return city || region || '';
      })
      .catch(function () { return ''; });
  }

  // Cross-page shared key already carries Station 1's last-known
  // coordinates AND place label (see saveSharedHamLocation() in the
  // host page). Used as a fallback so a single transient QRZ/HamQTH
  // hiccup on THIS load doesn't make a ham with a perfectly good saved
  // call sign suddenly see "we don't know your location" -- only used
  // when it's for the SAME call sign currently on file, so a changed
  // or no-longer-verifying call sign never shows someone else's stale
  // home QTH.
  function readCachedStation1() {
    try {
      var v = JSON.parse(localStorage.getItem(SHARED_HAM_LOCATION_KEY) || 'null');
      if (!v || v.source !== 'station1') return null;
      var lat = Number(v.lat), lon = Number(v.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      var savedCall = String(v.callsign || '').toUpperCase();
      var currentCall = '';
      try { currentCall = String((global.CallsignShared && global.CallsignShared.getStation1()) || '').toUpperCase(); } catch (e) {}
      if (!savedCall || !currentCall || savedCall !== currentCall) return null;
      return { lat: lat, lon: lon, callsign: v.callsign || '', place: v.label || '', stale: true };
    } catch (e) { return null; }
  }

  // ---------- Active-location resolution + broadcast ----------
  function computeActive() {
    if (overrideLoc) return { lat: overrideLoc.lat, lon: overrideLoc.lon, source: overrideLoc.source };
    if (stationLoc) return { lat: stationLoc.lat, lon: stationLoc.lon, source: 'station1' };
    if (manualLoc) return { lat: manualLoc.lat, lon: manualLoc.lon, source: manualLoc.source };
    return null;
  }
  function broadcastActiveLocation() {
    try { global.dispatchEvent(new CustomEvent('5xj:activeLocationChanged', { detail: computeActive() })); }
    catch (e) {}
  }

  // ---------- State + rendering ----------
  function hasPendingCallsign() {
    try { return !!(global.CallsignShared && global.CallsignShared.getStation1()); }
    catch (e) { return false; }
  }
  function currentState() {
    if (overrideLoc) return 'override';
    if (stationLoc) return 'locked';
    if (manualLoc) return 'manual';
    if (!stationChecked && hasPendingCallsign()) return 'checking';
    return 'unknown';
  }

  function fmtLocation(loc) {
    var coords = loc.lat.toFixed(3) + '°, ' + loc.lon.toFixed(3) + '°';
    return loc.place ? (loc.place + ' (' + coords + ')') : coords;
  }

  function render() {
    if (!widget) return;
    var state = currentState();

    widget.classList.toggle('ll-flash', state === 'unknown');
    if (titleEl) titleEl.classList.toggle('flash-attention', state === 'unknown');

    var bodyText, showControls, showCurrent = false, showUseStation = false, activeLoc = null;
    if (state === 'checking') {
      bodyText = tr('locWidgetCheckingStatus', 'Checking your call sign for a saved location…');
      showControls = false;
    } else if (state === 'override') {
      bodyText = tr('locWidgetOverrideBody',
        "You're temporarily using a different location for this visit only. Your call sign, {call}, will be used again automatically next time you visit — or click below to switch back right now.")
        .split('{call}').join((stationLoc && stationLoc.callsign) || '');
      showControls = true;
      showCurrent = true;
      showUseStation = !!stationLoc;
      activeLoc = overrideLoc;
    } else if (state === 'locked') {
      bodyText = tr('locWidgetLockedBody',
        "This is set from your call sign, {call}, and is looked up fresh every time you visit — so it's normally your Station 1 home QTH. Away from home? Set a temporary location below just for this visit — we'll go back to your call sign's location next time you visit.")
        .split('{call}').join(stationLoc.callsign || '');
      // Controls stay visible even while locked -- a traveling ham needs
      // a way to set a temporary (this-visit-only) location without
      // touching their saved call sign or home QTH.
      showControls = true;
      showCurrent = true;
      activeLoc = stationLoc;
    } else if (state === 'manual') {
      bodyText = tr('locWidgetKnownBody',
        "We have your latitude/longitude, but you can change it if you're at a new location. We'll help you — click the Google Maps link below, zoom in on your location, and click the map. You'll see a Google share icon — click it, then click Copy Link. Come back here, paste it into the box below, and click Update Location.");
      showControls = true;
      showCurrent = true;
      activeLoc = manualLoc;
    } else {
      bodyText = tr('locWidgetUnknownBody',
        "We don't know your latitude/longitude — we'll help you find it. Click the Google Maps link below, zoom in on your location, and click the map. You'll see a Google share icon — click it, then click Copy Link. Come back here, paste it into the box below, and click Update Location.");
      showControls = true;
    }

    if (bodyEl) bodyEl.textContent = bodyText;
    if (controlsEl) controlsEl.style.display = showControls ? '' : 'none';
    if (useStationBtn) useStationBtn.style.display = showUseStation ? '' : 'none';
    if (currentEl) {
      if (showCurrent && activeLoc) {
        currentEl.style.display = '';
        currentEl.textContent = tr('locWidgetCurrentLabel', 'Current:') + ' ' + fmtLocation(activeLoc);
      } else {
        currentEl.style.display = 'none';
      }
    }
  }
  global._5xjRefreshLocationWidget = render;

  // ---------- Status line ----------
  function showStatus(key, fallback, kind) {
    if (!statusEl) return;
    statusEl.textContent = tr(key, fallback);
    statusEl.className = 'll-status' + (kind ? ' ' + kind : '');
  }
  function clearStatus() {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.className = 'll-status';
  }

  // ---------- Google Maps link parsing ----------
  function isShortLink(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host === 'goo.gl' || host.slice(-7) === '.goo.gl';
    } catch (e) { return false; }
  }

  // A visitor may just paste raw coordinates copied out of Google Maps
  // (or anywhere else) instead of a share link -- e.g. "29.020823,
  // -95.691751", optionally with degree signs, N/S/E/W suffixes, or
  // surrounding parentheses/whitespace. Anchored to the WHOLE string so
  // this never accidentally fires on a fragment inside a URL -- that's
  // still parseCoordsFromMapsText()'s job.
  function parseBareLatLon(text) {
    if (!text) return null;
    var s = text.trim().replace(/^\(|\)$/g, '').trim();
    var m = s.match(/^(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EWew])?$/);
    if (!m) return null;
    var lat = Number(m[1]), lon = Number(m[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (/[Ss]/.test(m[2] || '')) lat = -Math.abs(lat);
    if (/[Ww]/.test(m[4] || '')) lon = -Math.abs(lon);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon };
  }

  function parseCoordsFromMapsText(text) {
    if (!text) return null;
    var bare = parseBareLatLon(text);
    if (bare) return bare;
    // Most precise first: the dropped-pin coordinates embedded in a
    // place URL (!3d<lat>!4d<lon>), which is where the visitor
    // actually tapped -- NOT just wherever the map view happens to
    // be centered.
    var m = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (!m) m = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!m) m = text.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!m) m = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    var lat = Number(m[1]), lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon };
  }

  function resolveShortLink(url) {
    var proxyUrl = MAPS_PROXY_URL + '?url=' + encodeURIComponent(url);
    return fetch(proxyUrl, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.ok && d.finalUrl) return d.finalUrl;
        throw new Error('resolve-failed');
      });
  }

  function onUpdateClick() {
    var raw = pasteInput ? pasteInput.value.trim() : '';
    if (!raw) { showStatus('locWidgetErrorEmpty', 'Paste a Google Maps link first.', 'error'); return; }

    var urlMatch = raw.match(/https?:\/\/\S+/);
    var workingUrl = urlMatch ? urlMatch[0] : raw;

    if (updateBtn) updateBtn.disabled = true;
    showStatus('locWidgetResolvingStatus', 'Reading your link…', 'loading');

    var expandPromise = isShortLink(workingUrl)
      ? resolveShortLink(workingUrl)
      : Promise.resolve(workingUrl);

    expandPromise
      .catch(function () { return null; }) // fall through to try parsing the original text below
      .then(function (expanded) {
        var coords = (expanded && parseCoordsFromMapsText(expanded)) || parseCoordsFromMapsText(workingUrl) || parseCoordsFromMapsText(raw);
        if (!coords) {
          showStatus('locWidgetErrorParse', "Couldn't find coordinates in that link. Make sure you used Google's Copy Link share button.", 'error');
          return;
        }
        // A call sign location is currently locked in -> this is a
        // temporary, this-visit-only override rather than a change to
        // the saved manual location.
        var rec = stationLoc
          ? (saveOverrideLoc(coords.lat, coords.lon, 'override-map-link'), overrideLoc)
          : (saveManualLoc(coords.lat, coords.lon, 'manual-map-link'), manualLoc);
        showStatus('locWidgetSavedStatus', '✔ Location updated', 'success');
        if (pasteInput) pasteInput.value = '';
        render();
        broadcastActiveLocation();
        enrichPlace(rec, coords.lat, coords.lon);
      })
      .finally(function () {
        if (updateBtn) updateBtn.disabled = false;
      });
  }

  function onDeviceLocationClick() {
    if (!navigator.geolocation) {
      showStatus('locWidgetErrorGeo', "Couldn't get your device's location. Check your browser's location permission and try again.", 'error');
      return;
    }
    if (deviceBtn) deviceBtn.disabled = true;
    showStatus('locWidgetLocatingStatus', 'Locating…', 'loading');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        if (deviceBtn) deviceBtn.disabled = false;
        var lat = pos.coords.latitude, lon = pos.coords.longitude;
        var rec = stationLoc
          ? (saveOverrideLoc(lat, lon, 'override-device-geo'), overrideLoc)
          : (saveManualLoc(lat, lon, 'manual-device-geo'), manualLoc);
        showStatus('locWidgetSavedStatus', '✔ Location updated', 'success');
        render();
        broadcastActiveLocation();
        enrichPlace(rec, lat, lon);
      },
      function () {
        if (deviceBtn) deviceBtn.disabled = false;
        showStatus('locWidgetErrorGeo', "Couldn't get your device's location. Check your browser's location permission and try again.", 'error');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
  }

  function onUseStationClick() {
    clearOverrideLoc();
    clearStatus();
    render();
    broadcastActiveLocation();
  }

  // ---------- Station 1 coordination ----------
  function onStation1Resolved(detail) {
    stationChecked = true;
    if (stationWaitTimer) { clearTimeout(stationWaitTimer); stationWaitTimer = null; }
    if (detail && Number.isFinite(detail.lat) && Number.isFinite(detail.lon)) {
      stationLoc = {
        lat: Number(detail.lat), lon: Number(detail.lon),
        callsign: String(detail.callsign || ''), place: String(detail.place || ''),
        stale: false
      };
    } else {
      // THIS load's fresh QRZ/HamQTH re-verification came up empty --
      // could be a genuinely stale/broken call sign, or just a one-off
      // network hiccup. Don't flip straight to "we don't know your
      // location" if we still have last-known-good coordinates for
      // this exact call sign; readCachedStation1() returns null (and
      // we correctly fall through to unknown/manual) if there's
      // nothing usable to fall back on.
      stationLoc = readCachedStation1();
    }
    render();
    broadcastActiveLocation();
  }
  global.addEventListener('5xj:station1locationResolved', function (e) { onStation1Resolved(e.detail); });

  // ---------- Boot ----------
  function init() {
    widget = document.getElementById('locLonWidget');
    if (!widget) return;
    titleEl = document.getElementById('locLonTitle');
    bodyEl = document.getElementById('locLonBody');
    currentEl = document.getElementById('locLonCurrent');
    controlsEl = document.getElementById('locLonControls');
    statusEl = document.getElementById('locLonStatus');
    pasteInput = document.getElementById('locLonPasteInput');
    updateBtn = document.getElementById('locLonUpdateBtn');
    deviceBtn = document.getElementById('locLonDeviceBtn');
    useStationBtn = document.getElementById('locLonUseStationBtn');

    manualLoc = loadManualLoc();
    overrideLoc = loadOverrideLoc();
    // Seed from last-known Station 1 coordinates immediately, before
    // this load's fresh QRZ/HamQTH round trip even starts -- so a
    // returning ham sees their locked home QTH right away instead of a
    // few seconds of "Checking...", and so the page still shows the
    // right thing if that round trip is slow or briefly fails.
    // onStation1Resolved() will confirm or correct this once the real
    // lookup for THIS load finishes.
    stationLoc = readCachedStation1();

    if (updateBtn) updateBtn.addEventListener('click', function () { clearStatus(); onUpdateClick(); });
    if (deviceBtn) deviceBtn.addEventListener('click', function () { clearStatus(); onDeviceLocationClick(); });
    if (useStationBtn) useStationBtn.addEventListener('click', onUseStationClick);
    if (pasteInput) pasteInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearStatus(); onUpdateClick(); }
    });

    // If a call sign is on file, updateCalls() in the host page will
    // fire '5xj:station1locationResolved' shortly -- but if for any
    // reason it never does (an unusual code path skipped it, a
    // script error elsewhere on the page), don't leave the widget
    // stuck showing "Checking..." forever.
    if (hasPendingCallsign()) {
      stationWaitTimer = setTimeout(function () {
        if (!stationChecked) { stationChecked = true; render(); broadcastActiveLocation(); }
      }, STATION_WAIT_TIMEOUT_MS);
    }

    render();
    // Announce whatever we know immediately (e.g. a cached manual
    // location) rather than waiting on the Station 1 round trip --
    // Ranch Almanac and friends can start loading right away.
    broadcastActiveLocation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
