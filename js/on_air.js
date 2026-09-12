/* =====================================================
   ON THE AIR MODULE - NAMESPACED JAVASCRIPT
   All code wrapped in OnTheAir object
===================================================== */

const OnTheAir = {
    currentTab: 'pota',
    proxyBase: 'https://5xjranch.com/php/',

    // Initialize the module
    init() {
        console.log('🎯 Initializing On the Air module...');
        
        // Build the HTML structure
        this.buildHTML();
        
        // Attach event listeners
        this.attachEvents();
        
        // Load initial data (POTA)
        this.loadData('pota');
    },

    // Build the HTML structure inside #onTheAirContainer
    buildHTML() {
        const container = document.getElementById('onTheAirContainer');
        if (!container) {
            console.error('❌ #onTheAirContainer not found!');
            return;
        }

        container.innerHTML = `
            <div class="ota-header">
                <h2>On the Air <span class="ota-count" id="otaStationCount">0</span></h2>
                <button class="ota-refresh-btn" id="otaRefreshBtn">🔄 Refresh</button>
            </div>

            <div class="ota-tabs">
                <button class="ota-tab active" data-tab="pota">POTA</button>
                <button class="ota-tab" data-tab="sota">SOTA</button>
                <button class="ota-tab" data-tab="dxc">DXC</button>
                <button class="ota-tab" data-tab="wwff">WWFF</button>
                <button class="ota-tab" data-tab="psk">PSK</button>
            </div>

            <div class="ota-table-container" id="otaDataContainer">
                <div class="ota-loading">
                    <div class="ota-spinner"></div>
                    Loading data...
                </div>
            </div>

            <div class="ota-status" id="otaStatusBar">
                Ready - Click a tab to load data
            </div>
        `;
    },

    // Attach event listeners
    attachEvents() {
        // Tab switching
        document.querySelectorAll('#onTheAirContainer .ota-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });

        // Refresh button
        const refreshBtn = document.getElementById('otaRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }
    },

    // Switch tabs
    switchTab(tab) {
        this.currentTab = tab;

        // Update tab styling
        document.querySelectorAll('#onTheAirContainer .ota-tab').forEach(t => {
            t.classList.remove('active');
            if (t.getAttribute('data-tab') === tab) {
                t.classList.add('active');
            }
        });

        // Load data for selected tab
        this.loadData(tab);
    },

    // Load data based on tab
    async loadData(tab) {
        const container = document.getElementById('otaDataContainer');
        if (!container) return;

        container.innerHTML = '<div class="ota-loading"><div class="ota-spinner"></div>Loading data...</div>';
        this.updateStatus(`Loading ${tab.toUpperCase()} data...`);

        try {
            switch(tab) {
                case 'pota':
                    await this.loadPOTA();
                    break;
                case 'sota':
                    await this.loadSOTA();
                    break;
                case 'dxc':
                    await this.loadDXCluster();
                    break;
                case 'wwff':
                    await this.loadWWFF();
                    break;
                case 'psk':
                    await this.loadPSK();
                    break;
            }
        } catch (error) {
            console.error('Error loading data:', error);
            container.innerHTML = `<div class="ota-error">❌ Error loading data: ${error.message}<br><small>Check console for details.</small></div>`;
            this.updateStatus('Error loading data');
        }
    },

    // Load POTA data
    async loadPOTA() {
        try {
            const response = await fetch('https://api.pota.app/spot/activator');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            const html = `
                <table>
                    <thead>
                        <tr>
                            <th>Callsign</th>
                            <th>Freq</th>
                            <th>Mode</th>
                            <th>Park</th>
                            <th>Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.slice(0, 50).map(spot => `
                            <tr>
                                <td class="ota-callsign">${spot.activator}</td>
                                <td class="ota-freq">${spot.frequency}</td>
                                <td class="ota-mode">${spot.mode}</td>
                                <td><a href="https://pota.app/#/park/${spot.reference}" class="ota-park-link" target="_blank">${spot.reference}</a></td>
                                <td>${spot.name || spot.locationDesc || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = data.length;
            this.updateStatus(`Loaded ${data.length} POTA spots`);
        } catch (error) {
            throw new Error(`POTA API error: ${error.message}`);
        }
    },

    // Load SOTA data
    async loadSOTA() {
        try {
            const response = await fetch('https://api2.sota.org.uk/api/spots/50/all');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            const html = `
                <table>
                    <thead>
                        <tr>
                            <th>Callsign</th>
                            <th>Freq</th>
                            <th>Mode</th>
                            <th>Summit</th>
                            <th>Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(spot => `
                            <tr>
                                <td class="ota-callsign">${spot.activatorCallsign}</td>
                                <td class="ota-freq">${spot.frequency}</td>
                                <td class="ota-mode">${spot.mode || 'N/A'}</td>
                                <td><a href="https://summits.sota.org.uk/summit/${spot.summitCode}" class="ota-park-link" target="_blank">${spot.summitCode}</a></td>
                                <td>${spot.summitDetails || ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = data.length;
            this.updateStatus(`Loaded ${data.length} SOTA spots`);
        } catch (error) {
            throw new Error(`SOTA API error: ${error.message}`);
        }
    },

    // Load DX Cluster data
    async loadDXCluster() {
        try {
            const response = await fetch(`${this.proxyBase}dxc_proxy.php?limit=50`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            const data = result.data;

            if (!data || data.length === 0) {
                throw new Error('No spots available');
            }

            const cacheInfo = result.source === 'cache' 
                ? ` (cached ${result.cache_age}s ago)` 
                : ' (live data)';

            const html = `
                <div class="ota-success">
                    ✅ <strong>Live DX Cluster Data</strong> - From HamQTH DX Cluster${cacheInfo}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>DE (Spotter)</th>
                            <th>DX (Station)</th>
                            <th>Freq (kHz)</th>
                            <th>Country</th>
                            <th>Comment</th>
                            <th>Time (UTC)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(spot => `
                            <tr>
                                <td class="ota-spotter">${spot.de}</td>
                                <td class="ota-callsign">${spot.dx}</td>
                                <td class="ota-freq">${spot.freq}</td>
                                <td class="ota-mode">${spot.band}</td>
                                <td class="ota-comment">${spot.comment}</td>
                                <td class="ota-time">${spot.time}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = data.length;
            this.updateStatus(`Loaded ${data.length} DX Cluster spots${cacheInfo}`);

        } catch (error) {
            console.error('DXC error:', error);
            
            const html = `
                <div class="ota-warning">
                    ⚠️ <strong>DX Cluster - Connection Issue</strong><br>
                    Unable to load live data: ${error.message}
                </div>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = '0';
            this.updateStatus('DXC - Connection error');
        }
    },

    // Load WWFF data
    async loadWWFF() {
        try {
            const response = await fetch(`${this.proxyBase}wwff_proxy.php?action=spots`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            const data = result.data;

            if (!data || data.length === 0) {
                throw new Error('No spots available');
            }

            const cacheInfo = result.source === 'cache' 
                ? ` (cached ${result.cache_age}s ago)` 
                : ' (live data)';

            const html = `
                <div class="ota-success">
                    ✅ <strong>Live WWFF Data</strong> - World Wide Flora & Fauna activations${cacheInfo}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Callsign</th>
                            <th>Freq (kHz)</th>
                            <th>Mode</th>
                            <th>Reference</th>
                            <th>Name</th>
                            <th>Spotter</th>
                            <th>Time (UTC)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.slice(0, 50).map(spot => {
                            const spotDate = new Date(spot.spot_time * 1000);
                            const timeStr = spotDate.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'UTC',
                                hour12: false
                            }) + 'z';
                            
                            return `
                                <tr>
                                    <td class="ota-callsign">${spot.activator}</td>
                                    <td class="ota-freq">${spot.frequency_khz}</td>
                                    <td class="ota-mode">${spot.mode}</td>
                                    <td><a href="https://wwff.co/directory/?showRef=${spot.reference}" class="ota-park-link" target="_blank">${spot.reference}</a></td>
                                    <td>${spot.reference_name}</td>
                                    <td class="ota-spotter">${spot.spotter}</td>
                                    <td class="ota-time">${timeStr}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = data.length;
            this.updateStatus(`Loaded ${data.length} WWFF spots${cacheInfo}`);

        } catch (error) {
            console.error('WWFF error:', error);
            
            const html = `
                <div class="ota-warning">
                    ⚠️ <strong>WWFF Data - Connection Issue</strong><br>
                    Unable to load data: ${error.message}
                </div>
            `;
            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = '0';
            this.updateStatus('WWFF - Connection error');
        }
    },

    // Load PSK Reporter data
    async loadPSK() {
        try {
            const mode = 'FT8';
            
            const response = await fetch(`${this.proxyBase}psk_proxy.php?mode=${mode}&limit=100`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Unknown error');
            }

            const spots = result.data;

            if (!spots || spots.length === 0) {
                throw new Error('No reports available');
            }

            const cacheInfo = result.source === 'cache' 
                ? ` (cached ${result.cache_age}s ago)` 
                : ' (live data)';

            const html = `
                <div class="ota-success">
                    ✅ <strong>Live PSK Reporter Data</strong> - Showing recent ${mode} propagation reports${cacheInfo}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Sender</th>
                            <th>Grid</th>
                            <th>Freq (MHz)</th>
                            <th>SNR</th>
                            <th>Receiver</th>
                            <th>RX Grid</th>
                            <th>Time (UTC)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${spots.map(spot => {
                            const timeStr = new Date(spot.timestamp * 1000).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'UTC',
                                hour12: false
                            }) + 'z';
                            
                            return `
                                <tr>
                                    <td class="ota-callsign">${spot.sender}</td>
                                    <td class="ota-spotter">${spot.sender_grid}</td>
                                    <td class="ota-freq">${spot.freq_mhz}</td>
                                    <td class="ota-snr">${spot.snr > 0 ? '+' : ''}${spot.snr} dB</td>
                                    <td class="ota-receiver">${spot.receiver}</td>
                                    <td class="ota-spotter">${spot.receiver_grid}</td>
                                    <td class="ota-time">${timeStr}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = spots.length;
            this.updateStatus(`Loaded ${spots.length} PSK Reporter ${mode} spots${cacheInfo}`);

        } catch (error) {
            console.error('PSK Reporter error:', error);
            
            const html = `
                <div class="ota-warning">
                    ⚠️ <strong>PSK Reporter - Connection Issue</strong><br>
                    Unable to load data: ${error.message}
                </div>
            `;
            document.getElementById('otaDataContainer').innerHTML = html;
            document.getElementById('otaStationCount').textContent = '0';
            this.updateStatus('PSK Reporter - Connection error');
        }
    },

    // Update status bar
    updateStatus(message) {
        const statusBar = document.getElementById('otaStatusBar');
        if (statusBar) {
            statusBar.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
        }
    },

    // Refresh current tab data
    refreshData() {
        this.loadData(this.currentTab);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    OnTheAir.init();
});