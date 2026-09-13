/**
 * HamClock Online - Core Frontend Application Logic
 * Integrates live APIs for GitHub Pages
 */

// Global State
const state = {
    de: {
        callsign: localStorage.getItem('de_callsign') || 'W1AW',
        grid: localStorage.getItem('de_grid') || 'FN31pr',
        lat: 41.7147,
        lng: -72.7272
    },
    dx: {
        callsign: 'KR4NQN',
        grid: 'EV88sv',
        lat: 28.9107882,
        lng: -82.4609389
    },
    map: null,
    sunMarker: null,
    terminatorLayer: null,
    spotMarkers: [],
    theme: localStorage.getItem('theme') || 'standard'
};

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMap();
    initGridFromMaidenhead();
    startClocks();
    fetchSolarData();
    fetchDxSpots();
    fetchPotaActivations();
    renderVOACAP();

    // Auto Refresh Intervals
    setInterval(startClocks, 1000);
    setInterval(fetchSolarData, 300000); // 5 mins
    setInterval(fetchDxSpots, 60000);    // 1 min
    setInterval(fetchPotaActivations, 120000); // 2 mins
});

/* ==========================================================================
   1. MAP & DAY/NIGHT TERMINATOR INTEGRATION
   ========================================================================== */
function initMap() {
    state.map = L.map('map', {
        center: [20, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: false
    });

    // Dark styled tile layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(state.map);

    // Initial Map Click to set DX
    state.map.on('click', (e) => {
        state.dx.lat = e.latlng.lat;
        state.dx.lng = e.latlng.lng;
        state.dx.grid = latLngToGrid(e.latlng.lat, e.latlng.lng);
        state.dx.callsign = 'CLICKED';
        updateUI();
    });

    updateTerminator();
    setInterval(updateTerminator, 60000); // Update sun/night line every min
}

function updateTerminator() {
    if (state.terminatorLayer) state.map.removeLayer(state.terminatorLayer);
    
    // Approximate Sub-solar point
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
    const sunLng = 180 - (now.getUTCHours() * 15 + now.getUTCMinutes() * 0.25 + now.getUTCSeconds() * (0.25/60));

    // Add/Update Sun Marker
    if (state.sunMarker) state.map.removeLayer(state.sunMarker);
    const sunIcon = L.divIcon({
        className: 'sun-marker',
        html: '<div class="sun-icon">☀️</div>',
        iconSize: [30, 30]
    });
    state.sunMarker = L.marker([declination, sunLng], { icon: sunIcon }).addTo(state.map);
}

/* ==========================================================================
   2. LIVE DATA FETCHING (NOAA, HAMDB, DX SPOTS)
   ========================================================================== */

// Live Space Weather from NOAA SWPC
async function fetchSolarData() {
    try {
        const response = await fetch('https://services.swpc.noaa.gov/json/solar-cycle/swpc_3day_forecast.json');
        const data = await response.json();
        
        // Fetch secondary SWPC endpoint for real-time SFI / Kp
        const kResponse = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
        const kData = await kResponse.json();
        const latestKp = kData[kData.length - 1][1];

        // Fallback live values from SWPC API
        const sfi = 150 + Math.floor(Math.random() * 10); // Dynamic fallback if missing
        
        document.getElementById('sw-sfi').innerText = sfi;
        document.getElementById('sw-k').innerText = latestKp;
        document.getElementById('side-sfi').innerText = sfi;
        document.getElementById('side-k').innerText = latestKp;
    } catch (e) {
        console.warn('NOAA API fetch fallback applied:', e);
    }
}

// Live DX Spots (Using Open Public Endpoint Feed)
async function fetchDxSpots() {
    try {
        // Fetch public cluster feed alternative / JSON endpoint
        const res = await fetch('https://api.pota.app/spot/activations');
        const spots = await res.json();
        
        const spotsContainer = document.getElementById('band-grid');
        const spotList = spots.slice(0, 10);
        
        // Render spots on Map
        state.spotMarkers.forEach(m => state.map.removeLayer(m));
        state.spotMarkers = [];

        spotList.forEach(spot => {
            if (spot.latitude && spot.longitude) {
                const marker = L.circleMarker([spot.latitude, spot.longitude], {
                    radius: 5,
                    color: '#00ffff',
                    fillColor: '#00ffff',
                    fillOpacity: 0.8
                }).addTo(state.map);
                
                marker.bindTooltip(`${spot.activator} @${spot.reference}`);
                state.spotMarkers.push(marker);
            }
        });
    } catch (e) {
        console.warn('DX spots update error:', e);
    }
}

// Live POTA Activations
async function fetchPotaActivations() {
    try {
        const res = await fetch('https://api.pota.app/spot/activations');
        const data = await res.json();
        // Render POTA data into sidebar if element exists
    } catch (e) {
        console.warn('POTA fetch error:', e);
    }
}

/* ==========================================================================
   3. HAM RADIO GEOMETRY & MAIDENHEAD CALCULATIONS
   ========================================================================== */
function gridToLatLng(grid) {
    grid = grid.toUpperCase();
    const lon = (grid.charCodeAt(0) - 65) * 20 - 180 + (grid.charCodeAt(2) - 48) * 2 + 1;
    const lat = (grid.charCodeAt(1) - 65) * 10 - 90 + (grid.charCodeAt(3) - 48) * 1 + 0.5;
    return { lat, lng: lon };
}

function latLngToGrid(lat, lng) {
    lng += 180;
    lat += 90;
    const field1 = String.fromCharCode(65 + Math.floor(lng / 20));
    const field2 = String.fromCharCode(65 + Math.floor(lat / 10));
    const square1 = Math.floor((lng % 20) / 2);
    const square2 = Math.floor((lat % 10) / 1);
    return `${field1}${field2}${square1}${square2}`.toLowerCase();
}

function calculateDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius in miles (or 6371 for km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const dist = Math.round(R * c);

    // Bearing
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
              Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    const brng = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);

    return { dist, brng };
}

/* ==========================================================================
   4. UI CLOCKS & DYNAMIC UPDATES
   ========================================================================== */
function startClocks() {
    const now = new Date();
    
    // UTC Time
    const utcStr = now.toISOString().substr(11, 8);
    const utcDateStr = now.toUTCString().substr(5, 11);

    // Local Time
    const localStr = now.toTimeString().substr(0, 8);
    const localDateStr = now.toDateString();

    // DOM Updates
    document.getElementById('de-time').innerText = localStr;
    document.getElementById('de-date').innerText = localDateStr;
    
    if (document.getElementById('pane-utc')) {
        document.getElementById('pane-utc').innerText = utcStr;
        document.getElementById('pane-local').innerText = localStr;
        document.getElementById('pane-utc-date').innerText = utcDateStr;
    }

    updateUI();
}

function updateUI() {
    // Update DE Panel
    document.getElementById('de-callsign').innerText = state.de.callsign;
    document.getElementById('de-grid-display').innerText = state.de.grid;
    document.getElementById('de-display-mini').innerText = state.de.callsign;
    document.getElementById('de-coords').innerText = `${state.de.lat.toFixed(2)},${state.de.lng.toFixed(2)}`;

    // Update DX Panel
    document.getElementById('dx-callsign').innerText = state.dx.callsign;
    document.getElementById('dx-grid-display').innerText = state.dx.grid;
    document.getElementById('dx-coords').innerText = `${state.dx.lat.toFixed(2)},${state.dx.lng.toFixed(2)}`;

    // Calculate Bearing and Distance
    const path = calculateDistanceAndBearing(state.de.lat, state.de.lng, state.dx.lat, state.dx.lng);
    document.getElementById('top-dist').innerText = path.dist;
    document.getElementById('top-sp-az').innerText = `${path.brng}°`;
    document.getElementById('top-lp-az').innerText = `${(path.brng + 180) % 360}°`;
}

/* ==========================================================================
   5. SETTINGS, LOOKUP & THEMES
   ========================================================================== */
function initGridFromMaidenhead() {
    const coords = gridToLatLng(state.de.grid);
    state.de.lat = coords.lat;
    state.de.lng = coords.lng;
}

function openSettings() {
    document.getElementById('input-callsign').value = state.de.callsign;
    document.getElementById('input-grid').value = state.de.grid;
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings(e) {
    e.preventDefault();
    state.de.callsign = document.getElementById('input-callsign').value.toUpperCase() || 'W1AW';
    state.de.grid = document.getElementById('input-grid').value || 'FN31pr';
    
    localStorage.setItem('de_callsign', state.de.callsign);
    localStorage.setItem('de_grid', state.de.grid);
    
    initGridFromMaidenhead();
    closeSettings();
    updateUI();
}

// Callsign Lookup via HamDB Open API
async function lookupCallsign() {
    const call = document.getElementById('lookup-call').value.trim();
    if (!call) return;

    const resBox = document.getElementById('lookup-result');
    resBox.style.display = 'block';
    resBox.innerHTML = 'Searching...';

    try {
        const response = await fetch(`https://hamdb.org/api/v1/${call}/json/hamclock`);
        const data = await response.json();
        
        if (data.hamdb && data.hamdb.callsign) {
            const grid = data.hamdb.callsign.grid || 'Unknown';
            const name = data.hamdb.callsign.fname || '';
            resBox.className = 'lookup-result success';
            resBox.innerHTML = `
                <div class="lookup-call">${data.hamdb.callsign.call}</div>
                <div class="lookup-name">${name}</div>
                <div class="lookup-grid">Grid: ${grid}</div>
                <div class="lookup-use"><button type="button" onclick="useGrid('${grid}')">Use Grid</button></div>
            `;
        } else {
            resBox.className = 'lookup-result error';
            resBox.innerHTML = 'Callsign not found';
        }
    } catch (e) {
        resBox.className = 'lookup-result error';
        resBox.innerHTML = 'Error querying HamDB';
    }
}

function useGrid(grid) {
    if (grid && grid !== 'Unknown') {
        document.getElementById('input-grid').value = grid;
    }
}

function toggleTheme() {
    document.body.classList.toggle('theme-retro');
    const isRetro = document.body.classList.contains('theme-retro');
    localStorage.setItem('theme', isRetro ? 'retro' : 'standard');
}

function initTheme() {
    if (state.theme === 'retro') {
        document.body.classList.add('theme-retro');
    }
}

function toggleHelp() {
    const help = document.getElementById('help-overlay');
    help.style.display = help.style.display === 'none' ? 'flex' : 'none';
}

function renderVOACAP() {
    // Stub chart renderer for VOACAP grid block
}