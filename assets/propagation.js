/**
 * HamClock Online - HF Propagation Engine
 * File: assets/js/propagation.js
 */

const Propagation = {
    // Frequency bands in MHz
    BANDS: [
        { name: '80m', freq: 3.5 },
        { name: '40m', freq: 7.0 },
        { name: '30m', freq: 10.1 },
        { name: '20m', freq: 14.0 },
        { name: '17m', freq: 18.1 },
        { name: '15m', freq: 21.0 },
        { name: '12m', freq: 24.9 },
        { name: '10m', freq: 28.0 }
    ],

    /**
     * Estimates Maximum Usable Frequency (MUF) based on solar conditions
     * @param {number} sfi - Solar Flux Index (typically 65 - 250+)
     * @param {number} kIndex - Geomagnetic K-Index (0 - 9)
     * @param {boolean} isDaylight - Whether path midpoint is in daylight
     * @returns {number} Estimated MUF in MHz
     */
    estimateMUF: (sfi, kIndex, isDaylight = true) => {
        // Base critical frequency (foF2) estimate derived from SFI
        let baseFreq = isDaylight 
            ? 7.0 + (sfi - 70) * 0.12 
            : 3.5 + (sfi - 70) * 0.04;

        // Apply geomagnetic disturbance penalty based on K-index
        const kPenalty = Math.max(0, (kIndex - 2) * 1.5);
        baseFreq = Math.max(2.0, baseFreq - kPenalty);

        // Standard F2 layer M-factor for 3000km path ~ 3.0
        const muf = baseFreq * 3.0;
        return Math.round(muf * 10) / 10;
    },

    /**
     * Evaluates band status across HF spectrum
     * @param {number} sfi - Solar Flux Index
     * @param {number} kIndex - K-index
     * @param {boolean} isDaylight - Daylight condition at path mid-point
     * @returns {Array} Array of band objects with status ratings
     */
    getBandConditions: (sfi, kIndex, isDaylight = true) => {
        const muf = Propagation.estimateMUF(sfi, kIndex, isDaylight);

        return Propagation.BANDS.map(band => {
            let status = 'Poor';
            let color = '#ff4444'; // Red

            if (band.freq <= muf) {
                if (band.freq >= muf * 0.85) {
                    status = 'Good';
                    color = '#00c853'; // Green
                } else if (band.freq >= muf * 0.5) {
                    status = 'Fair';
                    color = '#ffbb33'; // Yellow
                } else {
                    // Lower frequencies suffer high D-region absorption during daylight
                    if (isDaylight && band.freq <= 7.0) {
                        status = 'Poor';
                        color = '#ff4444';
                    } else {
                        status = 'Fair';
                        color = '#ffbb33';
                    }
                }
            } else {
                status = 'Closed';
                color = '#555555'; // Grey
            }

            return {
                band: band.name,
                freqMHz: band.freq,
                status,
                color
            };
        });
    },

    /**
     * Determines if a lat/lng point is currently in daylight
     */
    isPointInDaylight: (lat, lng, date = new Date()) => {
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));
        
        const hourAngle = (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) * 15 - 180 + lng;
        
        const rad = Math.PI / 180;
        const elevation = Math.asin(
            Math.sin(lat * rad) * Math.sin(declination * rad) +
            Math.cos(lat * rad) * Math.cos(declination * rad) * Math.cos(hourAngle * rad)
        );

        return elevation > 0;
    },

    /**
     * Renders VOACAP-style band matrix into target HTML element
     */
    renderVOACAPGrid: (containerId, sfi = 150, kIndex = 2, deLat = 40, deLng = -75) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        const isDay = Propagation.isPointInDaylight(deLat, deLng);
        const bands = Propagation.getBandConditions(sfi, kIndex, isDay);

        let html = '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 4px;">';
        bands.forEach(b => {
            html += `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid ${b.color}; border-radius: 4px; padding: 4px; text-align: center;">
                    <div style="font-size: 11px; font-weight: bold; color: #aaa;">${b.band}</div>
                    <div style="font-size: 12px; font-weight: bold; color: ${b.color};">${b.status}</div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    }
};

// Export to window for global browser scope
if (typeof window !== 'undefined') {
    window.Propagation = Propagation;
}