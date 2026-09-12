// ------------------------------------------------------
// KR4NQN VHF Propagation Map (PSKReporter)
// Heatmap + Auto-refresh + Band Filter
// ------------------------------------------------------

let vhfMap;
let heatLayer;
let currentBand = "50"; // default band

function initVHFMap() {
  // Remove old map if it exists
  if (vhfMap) {
    vhfMap.remove();
  }

  vhfMap = L.map('vhfmap').setView([34.24, -86.57], 5);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(vhfMap);

  loadPSKReporterData();
}

function loadPSKReporterData() {
  const url = `https://pskreporter.info/cgi-bin/pskmap.pl?format=json&band=${currentBand}`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data || !data.reports) return;

      const heatPoints = [];

      data.reports.forEach(rep => {
        const lat = rep.rlat;
        const lon = rep.rlon;
        if (!lat || !lon) return;

        const snr = rep.snr || 0;

        // Heatmap intensity based on SNR
        const intensity = snr <= 0 ? 0.1 : snr / 30;

        heatPoints.push([lat, lon, intensity]);

        // Optional: also show circle markers
        const color =
          snr >= 25 ? '#ff0000' :
          snr >= 15 ? '#ff9900' :
                      '#00aaff';

        L.circleMarker([lat, lon], {
          radius: 5,
          color,
          fillColor: color,
          fillOpacity: 0.7
        })
        .bindPopup(
          `<b>PSKReporter Spot</b><br>
           Band: ${rep.band}<br>
           Mode: ${rep.mode}<br>
           SNR: ${snr} dB`
        )
        .addTo(vhfMap);
      });

      // Add heatmap layer
      if (heatLayer) {
        vhfMap.removeLayer(heatLayer);
      }

      heatLayer = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 10,
        max: 1.0
      }).addTo(vhfMap);
    })
    .catch(err => console.log("PSKReporter error:", err));
}

// ------------------------------------------------------
// Band Filter Buttons
// ------------------------------------------------------

function setBand(band) {
  currentBand = band;
  initVHFMap();
}

// ------------------------------------------------------
// Auto-refresh every 1 minute
// ------------------------------------------------------

setInterval(() => {
  initVHFMap();
}, 60000);

// ------------------------------------------------------
// Initialize on page load
// ------------------------------------------------------

document.addEventListener('DOMContentLoaded', initVHFMap);
