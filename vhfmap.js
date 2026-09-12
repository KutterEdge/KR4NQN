// -------------------------------
// KR4NQN VHF Propagation Map (PSKReporter)
// -------------------------------

function initVHFMap() {
  const centerLat = 34.24;
  const centerLng = -86.57;
  const zoom = 5;

  const map = L.map('vhfmap').setView([centerLat, centerLng], zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Load PSKReporter VHF spots
  fetch('/psk.php')
    .then(r => r.json())
    .then(data => {
      if (!data.reports) return;

      data.reports.forEach(rep => {
        const lat = rep.rlat;
        const lon = rep.rlon;

        if (!lat || !lon) return;

        const snr = rep.snr || 0;

        const color =
          snr >= 25 ? '#ff0000' :
          snr >= 15 ? '#ff9900' :
                      '#00aaff';

        L.circleMarker([lat, lon], {
          radius: 6,
          color,
          fillColor: color,
          fillOpacity: 0.7
        })
          .bindPopup(
            `<b>PSKReporter Spot</b><br>
             SNR: ${snr} dB<br>
             Band: ${rep.band}<br>
             Mode: ${rep.mode}<br>
             ${lat.toFixed(2)}, ${lon.toFixed(2)}`
          )
          .addTo(map);
      });
    })
    .catch(err => {
      console.log("PSKReporter error:", err);
    });
}

document.addEventListener('DOMContentLoaded', initVHFMap);
