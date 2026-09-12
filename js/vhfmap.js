// -------------------------------
// KR4NQN VHF Propagation Map
// -------------------------------

function initVHFMap() {
  const centerLat = 34.24;
  const centerLng = -86.57;
  const zoom = 5;

  // Create the map
  const map = L.map('vhfmap').setView([centerLat, centerLng], zoom);

  // Base map layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // -------------------------------
  // Demo VHF spots (replace later)
  // -------------------------------
  const demoSpots = [
    { lat: 34.5, lon: -86.8, snr: 20, desc: '144 MHz opening' },
    { lat: 33.9, lon: -85.9, snr: 10, desc: 'Weak tropo' },
    { lat: 35.2, lon: -87.1, snr: 30, desc: 'Strong path' }
  ];

  fetch('/vhfspots.json')
  .then(r => r.json())
  .then(spots => {
    spots.forEach(s => {
      const color =
        s.snr >= 25 ? '#ff0000' :
        s.snr >= 15 ? '#ff9900' :
                      '#00aaff';

      L.circleMarker([s.lat, s.lon], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.7
      })
        .bindPopup(
          `<b>${s.desc || 'VHF spot'}</b><br>SNR: ${s.snr} dB`
        )
        .addTo(map);
    });
  });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initVHFMap);
