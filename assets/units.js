/**
 * HamClock Online - Units & Measurement Conversion Module
 * File: assets/js/units.js
 */

const Units = {
    // Distance Conversions
    miToKm: (miles) => miles * 1.609344,
    kmToMi: (km) => km * 0.621371,
    miToNmi: (miles) => miles * 0.868976,
    
    // Format distance based on user preference ('mi', 'km', 'nmi')
    formatDistance: (miles, unit = 'mi') => {
        switch (unit.toLowerCase()) {
            case 'km':
                return `${Math.round(Units.miToKm(miles)).toLocaleString()} km`;
            case 'nmi':
                return `${Math.round(Units.miToNmi(miles)).toLocaleString()} nmi`;
            case 'mi':
            default:
                return `${Math.round(miles).toLocaleString()} mi`;
        }
    },

    // Speed Conversions (Wind / Solar Wind)
    kmSToMph: (kmPerSec) => kmPerSec * 2236.94,
    kmSToKmH: (kmPerSec) => kmPerSec * 3600,

    // Temperature Conversions
    cToF: (celsius) => (celsius * 9) / 5 + 32,
    fToC: (fahrenheit) => ((fahrenheit - 32) * 5) / 9,

    // Maidenhead Grid Square & Coordinate Calculations
    gridToLatLng: (grid) => {
        if (!grid || typeof grid !== 'string') return { lat: 0, lng: 0 };
        const cleanGrid = grid.trim().toUpperCase();
        if (cleanGrid.length < 4) return { lat: 0, lng: 0 };

        const lon = (cleanGrid.charCodeAt(0) - 65) * 20 - 180 + (cleanGrid.charCodeAt(2) - 48) * 2 + 1;
        const lat = (cleanGrid.charCodeAt(1) - 65) * 10 - 90 + (cleanGrid.charCodeAt(3) - 48) * 1 + 0.5;
        return { lat, lng: lon };
    },

    latLngToGrid: (lat, lng, precision = 4) => {
        lng += 180;
        lat += 90;

        const field1 = String.fromCharCode(65 + Math.floor(lng / 20));
        const field2 = String.fromCharCode(65 + Math.floor(lat / 10));
        const square1 = Math.floor((lng % 20) / 2);
        const square2 = Math.floor((lat % 10) / 1);

        let grid = `${field1}${field2}${square1}${square2}`;

        if (precision >= 6) {
            const remLng = (lng % 20) % 2;
            const remLat = (lat % 10) % 1;
            const subsquare1 = String.fromCharCode(97 + Math.floor(remLng * 12));
            const subsquare2 = String.fromCharCode(97 + Math.floor(remLat * 24));
            grid += `${subsquare1}${subsquare2}`;
        }

        return grid;
    },

    // Great Circle Distance & Azimuth (Bearing)
    calculatePath: (lat1, lon1, lat2, lon2) => {
        const rad = Math.PI / 180;
        const phi1 = lat1 * rad;
        const phi2 = lat2 * rad;
        const deltaPhi = (lat2 - lat1) * rad;
        const deltaLambda = (lon2 - lon1) * rad;

        // Haversine formula for distance
        const a = Math.sin(deltaPhi / 2) ** 2 +
                  Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distMiles = 3958.8 * c;

        // Initial Bearing (Short Path)
        const y = Math.sin(deltaLambda) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) -
                  Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
        const shortPathBrng = Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360);
        const longPathBrng = (shortPathBrng + 180) % 360;

        return {
            distMiles,
            distKm: Units.miToKm(distMiles),
            shortPathBearing: shortPathBrng,
            longPathBearing: longPathBrng
        };
    }
};

// Export to window for global browser scope
if (typeof window !== 'undefined') {
    window.Units = Units;
}