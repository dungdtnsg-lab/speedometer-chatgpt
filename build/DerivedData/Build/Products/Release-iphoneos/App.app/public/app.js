// State Variables
let tracking = false;
let watchId = null;
let currentUnit = 'kmh'; // 'kmh' | 'mph' | 'knot'
let gaugeMaxSpeed = 260; // 260 (car) or 80 (bike)
let currentSpeedKmh = 0;
let displayedNeedleSpeed = 0;
let maxSpeedKmh = 0;
let speedsList = [];
let totalDistanceMeters = 0;
let lastCoord = null;
let lastGpsTimestamp = null;
let sessionStartTime = null;
let wakeLock = null;
let gpsWatchdogInterval = null;
let isOledActive = false;

// Speed Limit & Audio Alert
let speedLimitKmh = 60; // Default 60 km/h
const SPEED_LIMITS = [40, 50, 60, 80, 100, 120];
let audioAlertEnabled = true;
let lastAlertBeepTime = 0;

// Audio & Background Keep-Alive
let audioContext = null;
let silentAudioElement = null;

// Map & Multi-Color Speed Tracking
let googleMap = null;
let currentMapLayer = null;
let mapLayerIndex = 0; // 0: Roadmap, 1: Hybrid, 2: Satellite, 3: Terrain
let isHeadingFollowActive = false;
let userMarker = null;
let startMarker = null;
let accuracyCircle = null;
let mapSegments = [];
let fullGpsLogs = []; // Array of { time, lat, lon, alt, speed, heading, accuracy }

// Speed History for Speed Chart
let speedHistory = [];

// Satellites Data (Multi-Constellation)
let satellitesData = [];
let radarAngle = 0; // For rotating radar sweep animation

// Google Maps Tile URLs
const GOOGLE_MAP_LAYERS = [
  { name: 'Google Đường phố', url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', maxZoom: 20 },
  { name: 'Google Bản đồ Lai', url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', maxZoom: 20 },
  { name: 'Google Vệ tinh', url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 },
  { name: 'Google Địa hình', url: 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', maxZoom: 20 }
];

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initGauge();
  initMap();
  initRadarCanvas();
  initTabs();
  initSubviews();
  initUnits();
  initVehicleModes();
  initControls();
  initSpeedLimit();
  initOledMode();
  initHaptics();
  initExportHandlers();
  registerServiceWorker();
  initBackgroundKeepAliveHandlers();
  startGaugeAndRadarAnimationLoop();
  generateMultiConstellationSatellites(10);
});

// iOS Haptic Feedback
function triggerHaptic(type = 'light') {
  if (navigator && navigator.vibrate) {
    try {
      navigator.vibrate(type === 'medium' ? 25 : 12);
    } catch (e) {}
  }
}

function initHaptics() {
  document.querySelectorAll('.haptic-btn, button').forEach(btn => {
    btn.addEventListener('touchstart', () => triggerHaptic('light'), { passive: true });
    btn.addEventListener('click', () => triggerHaptic('light'), { passive: true });
  });
}

// Clock & Duration
function initClock() {
  const dateEl = document.getElementById('gauge-datetime');
  setInterval(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    dateEl.textContent = `${d}/${m}/${y} ${h}:${min}:${s}`;

    if (sessionStartTime && tracking) {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      const eh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const em = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const es = String(elapsed % 60).padStart(2, '0');
      document.getElementById('stat-duration').textContent = `${eh}:${em}:${es}`;
    }
  }, 1000);
}

function formatStartTimeString(date) {
  const months = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];
  const d = date.getDate();
  const m = months[date.getMonth()];
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${d} ${m}, ${y} ${h}:${min}:${s}`;
}

function getCardinalDirection(deg) {
  if (deg === null || isNaN(deg)) return 'N';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const index = Math.round((deg % 360) / 45);
  return directions[index];
}

// Speed Limit & Audio Alerts
function initSpeedLimit() {
  const btnLimit = document.getElementById('btn-speed-limit');
  const limitNum = document.getElementById('limit-val');
  const btnAlert = document.getElementById('btn-audio-alert');

  btnLimit.addEventListener('click', () => {
    const currIdx = SPEED_LIMITS.indexOf(speedLimitKmh);
    speedLimitKmh = SPEED_LIMITS[(currIdx + 1) % SPEED_LIMITS.length];
    limitNum.textContent = speedLimitKmh;
    triggerHaptic('medium');
  });

  btnAlert.addEventListener('click', () => {
    audioAlertEnabled = !audioAlertEnabled;
    btnAlert.classList.toggle('active', audioAlertEnabled);
    triggerHaptic('light');
  });
}

function playSpeedAlertBeep() {
  if (!audioAlertEnabled) return;
  const now = Date.now();
  if (now - lastAlertBeepTime < 1500) return; // 1.5s interval
  lastAlertBeepTime = now;

  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') audioContext.resume();

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1250, audioContext.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start();
    osc.stop(audioContext.currentTime + 0.22);
  } catch (e) {}
}

// Background Keep-Alive
function initBackgroundKeepAliveHandlers() {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      if (tracking) {
        await requestWakeLock();
        if (!lastGpsTimestamp || (Date.now() - lastGpsTimestamp > 7000)) {
          restartGpsWatcher();
        }
      }
    }
  });

  window.addEventListener('pageshow', async () => {
    if (tracking) {
      await requestWakeLock();
      startBackgroundAudioKeeper();
    }
  });
}

function startBackgroundAudioKeeper() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') audioContext.resume();

    const buffer = audioContext.createBuffer(1, 22050, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(audioContext.destination);
    source.start(0);

    if (!silentAudioElement) {
      silentAudioElement = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
      silentAudioElement.loop = true;
    }
    silentAudioElement.play().catch(() => {});
  } catch (e) {}
}

function stopBackgroundAudioKeeper() {
  if (silentAudioElement) silentAudioElement.pause();
  if (audioContext && audioContext.state !== 'closed') audioContext.suspend().catch(() => {});
}

// Screen Wake Lock
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      document.getElementById('btn-screen-wake').textContent = 'Giữ sáng: BẬT';
      wakeLock.addEventListener('release', () => {
        if (tracking && document.visibilityState === 'visible' && !isOledActive) {
          requestWakeLock();
        }
      });
    } catch (e) {
      document.getElementById('btn-screen-wake').textContent = 'Giữ sáng: TẮT';
    }
  }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
    document.getElementById('btn-screen-wake').textContent = 'Giữ sáng: TẮT';
  }
}

// GPS Watchdog
function startGpsWatchdog() {
  stopGpsWatchdog();
  gpsWatchdogInterval = setInterval(() => {
    if (tracking) {
      if (lastGpsTimestamp && (Date.now() - lastGpsTimestamp > 8000)) {
        restartGpsWatcher();
      }
    }
  }, 5000);
}

function stopGpsWatchdog() {
  if (gpsWatchdogInterval) {
    clearInterval(gpsWatchdogInterval);
    gpsWatchdogInterval = null;
  }
}

function restartGpsWatcher() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  watchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 6000 }
  );
  lastGpsTimestamp = Date.now();
}

// Tabs & Subviews
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.dataset.target;
      const targetEl = document.getElementById(target);
      if (targetEl) targetEl.classList.add('active');

      if (target === 'tab-track' && googleMap) {
        setTimeout(() => {
          googleMap.invalidateSize();
          if (lastCoord) googleMap.setView([lastCoord.lat, lastCoord.lon], googleMap.getZoom() || 16);
        }, 80);
      }

      if (target === 'tab-chart') drawSpeedChart();
    });
  });
}

function initSubviews() {
  const btnStats = document.getElementById('btn-view-stats');
  const btnMap = document.getElementById('btn-view-map');
  const viewStats = document.getElementById('track-stats-view');
  const viewMap = document.getElementById('track-map-view');

  btnStats.addEventListener('click', () => {
    btnStats.classList.add('active');
    btnMap.classList.remove('active');
    viewStats.classList.add('active');
    viewMap.classList.remove('active');
  });

  btnMap.addEventListener('click', () => {
    btnMap.classList.add('active');
    btnStats.classList.remove('active');
    viewMap.classList.add('active');
    viewStats.classList.remove('active');

    if (googleMap) {
      setTimeout(() => {
        googleMap.invalidateSize();
        if (lastCoord) googleMap.setView([lastCoord.lat, lastCoord.lon], googleMap.getZoom() || 16);
      }, 80);
    }
  });
}

// Units
function initUnits() {
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentUnit = btn.dataset.unit;
      document.getElementById('speed-unit-label').textContent = currentUnit.toUpperCase();
      updateSpeedDisplays();
      updateDetailedStats();
    });
  });
}

// Vehicle Modes
function initVehicleModes() {
  const bikeBtn = document.getElementById('mode-bike');
  const carBtn = document.getElementById('mode-car');

  bikeBtn.addEventListener('click', () => {
    bikeBtn.classList.add('active');
    carBtn.classList.remove('active');
    gaugeMaxSpeed = 80;
    drawGauge(displayedNeedleSpeed);
  });

  carBtn.addEventListener('click', () => {
    carBtn.classList.add('active');
    bikeBtn.classList.remove('active');
    gaugeMaxSpeed = 260;
    drawGauge(displayedNeedleSpeed);
  });
}

// Controls
function initControls() {
  const toggleBtn = document.getElementById('btn-gps-toggle');
  toggleBtn.addEventListener('click', () => {
    if (!tracking) {
      startTracking();
      toggleBtn.textContent = 'DỪNG GPS THEO DÕI';
      toggleBtn.style.background = '#ef4444';
    } else {
      stopTracking();
      toggleBtn.textContent = 'BẬT GPS THEO DÕI';
      toggleBtn.style.background = '#f97316';
    }
  });

  document.getElementById('btn-hud').addEventListener('click', () => {
    document.body.classList.toggle('hud-mode');
  });

  document.getElementById('btn-reset').addEventListener('click', resetSession);

  // Map Controls
  document.getElementById('btn-map-recenter').addEventListener('click', () => {
    if (lastCoord && googleMap) {
      googleMap.setView([lastCoord.lat, lastCoord.lon], 16);
    }
  });

  document.getElementById('btn-map-layer').addEventListener('click', () => {
    mapLayerIndex = (mapLayerIndex + 1) % GOOGLE_MAP_LAYERS.length;
    setGoogleMapLayer(mapLayerIndex);
  });

  const btnHeading = document.getElementById('btn-map-heading-follow');
  btnHeading.addEventListener('click', () => {
    isHeadingFollowActive = !isHeadingFollowActive;
    btnHeading.classList.toggle('active', isHeadingFollowActive);
    triggerHaptic('medium');
  });

  document.getElementById('btn-screen-wake').addEventListener('click', () => {
    if (wakeLock) releaseWakeLock();
    else requestWakeLock();
  });
}

function initOledMode() {
  const btnOled = document.getElementById('btn-oled-saver');
  const overlay = document.getElementById('oled-blackout-overlay');

  if (btnOled && overlay) {
    btnOled.addEventListener('click', () => {
      isOledActive = true;
      overlay.classList.add('active');
      requestWakeLock();
      triggerHaptic('medium');
    });

    let lastTap = 0;
    const dismissHandler = () => {
      const now = Date.now();
      if (now - lastTap < 400) {
        isOledActive = false;
        overlay.classList.remove('active');
        triggerHaptic('medium');
      }
      lastTap = now;
    };

    overlay.addEventListener('click', dismissHandler);
    overlay.addEventListener('touchend', dismissHandler);
  }
}

function resetSession() {
  if (confirm('Đặt lại toàn bộ dữ liệu hành trình?')) {
    currentSpeedKmh = 0;
    displayedNeedleSpeed = 0;
    maxSpeedKmh = 0;
    speedsList = [];
    speedHistory = [];
    totalDistanceMeters = 0;
    lastCoord = null;
    fullGpsLogs = [];
    sessionStartTime = Date.now();
    document.getElementById('stat-start-time').textContent = formatStartTimeString(new Date(sessionStartTime));

    mapSegments.forEach(seg => googleMap.removeLayer(seg));
    mapSegments = [];
    if (startMarker) {
      googleMap.removeLayer(startMarker);
      startMarker = null;
    }

    updateSpeedDisplays();
    updateDetailedStats();
    updateExportLogSummary();
    drawSpeedChart();
  }
}

// Google Maps Setup
function initMap() {
  if (typeof L === 'undefined') return;

  googleMap = L.map('google-map', {
    zoomControl: false,
    attributionControl: false
  }).setView([10.749717, 106.728654], 16);

  setGoogleMapLayer(0);
}

function setGoogleMapLayer(index) {
  if (!googleMap) return;
  if (currentMapLayer) googleMap.removeLayer(currentMapLayer);

  const layerInfo = GOOGLE_MAP_LAYERS[index];
  currentMapLayer = L.tileLayer(layerInfo.url, {
    maxZoom: layerInfo.maxZoom,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }).addTo(googleMap);

  document.getElementById('current-layer-name').textContent = layerInfo.name;
}

function getSpeedColor(speedKmh) {
  if (speedKmh < 20) return '#22c55e'; // Xanh lá (<20)
  if (speedKmh < 40) return '#06b6d4'; // Cyan (20-40)
  if (speedKmh < 60) return '#eab308'; // Vàng (40-60)
  if (speedKmh < 80) return '#f97316'; // Cam (60-80)
  return '#ef4444';                    // Đỏ (>80)
}

function addSpeedTrackSegment(prevCoord, newCoord, speedKmh) {
  if (!googleMap || typeof L === 'undefined') return;

  const latLngs = [[prevCoord.lat, prevCoord.lon], [newCoord.lat, newCoord.lon]];
  const segmentColor = getSpeedColor(speedKmh);

  const poly = L.polyline(latLngs, {
    color: segmentColor,
    weight: 5.5,
    opacity: 0.92,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(googleMap);

  mapSegments.push(poly);
}

function updateMapLocation(lat, lon, accuracy, heading, speedKmh) {
  if (!googleMap || typeof L === 'undefined') return;

  const latLng = [lat, lon];

  // Set Start Point Marker if first point
  if (!startMarker && mapSegments.length === 0) {
    const startIcon = L.divIcon({
      className: 'start-map-marker',
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2.5px solid #ffffff;box-shadow:0 0 8px #22c55e;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    startMarker = L.marker(latLng, { icon: startIcon }).addTo(googleMap);
  }

  // Current Position Navigation Puck with Heading Arrow
  const arrowDeg = heading || 0;
  const navHtml = `<div style="transform: rotate(${arrowDeg}deg); width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:18px solid #38bdf8;filter:drop-shadow(0 0 5px #0284c7);"></div>
  </div>`;

  if (!userMarker) {
    const customIcon = L.divIcon({
      className: 'user-nav-puck',
      html: navHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    userMarker = L.marker(latLng, { icon: customIcon }).addTo(googleMap);
    accuracyCircle = L.circle(latLng, {
      radius: accuracy,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      weight: 1
    }).addTo(googleMap);

    googleMap.setView(latLng, 16);
  } else {
    userMarker.setLatLng(latLng);
    userMarker.setIcon(L.divIcon({
      className: 'user-nav-puck',
      html: navHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    }));

    if (accuracyCircle) {
      accuracyCircle.setLatLng(latLng);
      accuracyCircle.setRadius(accuracy);
    }

    if (isHeadingFollowActive) {
      googleMap.panTo(latLng);
    }
  }
}

// Geolocation GPS Tracking
function startTracking() {
  if (!('geolocation' in navigator)) {
    alert('Thiết bị không hỗ trợ định vị GPS.');
    return;
  }

  tracking = true;
  if (!sessionStartTime) {
    sessionStartTime = Date.now();
    document.getElementById('stat-start-time').textContent = formatStartTimeString(new Date(sessionStartTime));
  }

  requestWakeLock();
  startBackgroundAudioKeeper();
  startGpsWatchdog();

  document.getElementById('signal-banner-text').textContent = '🟢 [GNSS Signal: Optimal • Background Active]';
  document.getElementById('signal-banner-text').className = 'signal-banner good';

  watchId = navigator.geolocation.watchPosition(
    onGpsSuccess,
    onGpsError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
  );
  lastGpsTimestamp = Date.now();
}

function stopTracking() {
  tracking = false;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  releaseWakeLock();
  stopBackgroundAudioKeeper();
  stopGpsWatchdog();

  currentSpeedKmh = 0;
  updateGpsDots(0);
  document.getElementById('signal-banner-text').textContent = '🔴 [GPS Stopped]';
  document.getElementById('signal-banner-text').className = 'signal-banner normal';
}

function onGpsSuccess(pos) {
  lastGpsTimestamp = Date.now();
  const coords = pos.coords;
  const speedMs = (coords.speed !== null && coords.speed > 0) ? coords.speed : 0;
  const rawSpeedKmh = speedMs * 3.6;

  // Smoothing filter
  currentSpeedKmh = currentSpeedKmh * 0.2 + rawSpeedKmh * 0.8;
  if (currentSpeedKmh < 0.2) currentSpeedKmh = 0;

  if (currentSpeedKmh > maxSpeedKmh) maxSpeedKmh = currentSpeedKmh;
  speedsList.push(currentSpeedKmh);

  // Speed Limit Warning Check
  if (currentSpeedKmh > speedLimitKmh) {
    playSpeedAlertBeep();
    document.getElementById('speed-value').style.color = '#ef4444';
  } else {
    document.getElementById('speed-value').style.color = '#f8fafc';
  }

  // History log
  speedHistory.push({ time: Date.now(), speed: currentSpeedKmh });
  if (speedHistory.length > 50) speedHistory.shift();

  // Full Trip Log
  fullGpsLogs.push({
    time: new Date().toISOString(),
    lat: coords.latitude,
    lon: coords.longitude,
    alt: coords.altitude || 0,
    speed: currentSpeedKmh,
    heading: coords.heading || 0,
    accuracy: coords.accuracy || 5
  });
  updateExportLogSummary();

  // Multi-Color Polyline segment & Distance
  if (lastCoord) {
    const dist = calculateDistance(lastCoord.lat, lastCoord.lon, coords.latitude, coords.longitude);
    if (dist > 0.001) {
      totalDistanceMeters += dist * 1000;
      addSpeedTrackSegment(lastCoord, { lat: coords.latitude, lon: coords.longitude }, currentSpeedKmh);
    }
  }

  lastCoord = { lat: coords.latitude, lon: coords.longitude };

  // GPS indicator dots
  const acc = coords.accuracy || 10;
  let activeDots = 5;
  if (acc > 30) activeDots = 1;
  else if (acc > 20) activeDots = 2;
  else if (acc > 12) activeDots = 3;
  else if (acc > 6) activeDots = 4;
  updateGpsDots(activeDots);

  updateSpeedDisplays();
  updateDetailedStats(coords);
  updateMapLocation(coords.latitude, coords.longitude, acc, coords.heading || 0, currentSpeedKmh);

  generateMultiConstellationSatellites(acc);
  drawSpeedChart();
}

function onGpsError(err) {
  document.getElementById('signal-banner-text').textContent = `⚠️ [GPS Warning: ${err.message}]`;
  document.getElementById('signal-banner-text').className = 'signal-banner normal';
}

function updateGpsDots(count) {
  const dots = document.querySelectorAll('#gps-dots-container .dot');
  dots.forEach((dot, idx) => {
    if (idx < count) dot.classList.add('active');
    else dot.classList.remove('active');
  });
}

function convertSpeed(kmh) {
  if (currentUnit === 'mph') return kmh * 0.621371;
  if (currentUnit === 'knot') return kmh * 0.539957;
  return kmh;
}

function updateSpeedDisplays() {
  const converted = convertSpeed(currentSpeedKmh);
  document.getElementById('speed-value').textContent = converted.toFixed(1);
  const chartBadge = document.getElementById('chart-speed-badge');
  if (chartBadge) chartBadge.textContent = `${converted.toFixed(1)} ${currentUnit}`;
}

function updateDetailedStats(coords = null) {
  const unitSuffix = currentUnit.toUpperCase();
  
  const distKm = totalDistanceMeters / 1000;
  document.getElementById('stat-distance').textContent = `${distKm.toFixed(3)} KM`;

  const convMax = convertSpeed(maxSpeedKmh);
  document.getElementById('stat-max-speed').textContent = `${convMax.toFixed(2)} ${unitSuffix}`;

  const avgKmh = speedsList.length > 0 ? speedsList.reduce((a, b) => a + b, 0) / speedsList.length : 0;
  const convAvg = convertSpeed(avgKmh);
  document.getElementById('stat-avg-speed').textContent = `${convAvg.toFixed(2)} ${unitSuffix}`;

  if (coords) {
    const alt = coords.altitude ? coords.altitude.toFixed(2) : '0.00';
    document.getElementById('stat-altitude').textContent = `${alt} M`;

    const head = coords.heading ? coords.heading.toFixed(2) : '0.00';
    const card = getCardinalDirection(coords.heading);
    document.getElementById('stat-heading').textContent = `${head}° ${card}`;

    const latStr = coords.latitude.toFixed(6);
    const lonStr = coords.longitude.toFixed(6);
    document.getElementById('stat-location').textContent = `${latStr}°  ${lonStr}°`;
    document.getElementById('sat-acc').textContent = `±${coords.accuracy ? coords.accuracy.toFixed(1) : '--'} m`;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Gauge & Rotating Radar Animation Loop (ProMotion 60/120 FPS)
function startGaugeAndRadarAnimationLoop() {
  function loop() {
    if (!isOledActive) {
      // Gauge needle smooth interpolation
      displayedNeedleSpeed += (currentSpeedKmh - displayedNeedleSpeed) * 0.15;
      if (Math.abs(currentSpeedKmh - displayedNeedleSpeed) < 0.05) {
        displayedNeedleSpeed = currentSpeedKmh;
      }
      drawGauge(displayedNeedleSpeed);

      // Radar rotating sweep
      radarAngle = (radarAngle + 0.03) % (2 * Math.PI);
      drawRadar(satellitesData);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// Speedometer Canvas Rendering
function initGauge() {
  drawGauge(0);
}

function drawGauge(speedKmh) {
  const canvas = document.getElementById('speedGaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = w / 2 - 18;

  ctx.clearRect(0, 0, w, h);

  const startAngle = 0.75 * Math.PI; // 135 deg
  const endAngle = 2.25 * Math.PI;   // 405 deg
  const totalAngle = endAngle - startAngle;

  // Background Bezel Dial Arc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#141c2c';
  ctx.stroke();

  // Inner Glow Ring
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 16, startAngle, endAngle);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
  ctx.stroke();

  // Speed Ticks
  const maxScale = gaugeMaxSpeed;
  const step = maxScale === 80 ? 10 : 20;

  for (let s = 0; s <= maxScale; s += (step / 2)) {
    const frac = s / maxScale;
    const angle = startAngle + frac * totalAngle;
    const isMajor = s % step === 0;

    const innerR = radius - (isMajor ? 14 : 7);
    const outerR = radius;

    const x1 = cx + innerR * Math.cos(angle);
    const y1 = cy + innerR * Math.sin(angle);
    const x2 = cx + outerR * Math.cos(angle);
    const y2 = cy + outerR * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isMajor ? 2.5 : 1;
    ctx.strokeStyle = isMajor ? (s >= maxScale * 0.75 ? '#ef4444' : '#f8fafc') : '#475569';
    ctx.stroke();

    if (isMajor) {
      const textR = radius - 26;
      const tx = cx + textR * Math.cos(angle);
      const ty = cy + textR * Math.sin(angle);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, tx, ty);
    }
  }

  // Active Colored Arc (Green -> Yellow -> Red)
  const speedFrac = Math.min(speedKmh / maxScale, 1.0);
  const activeEndAngle = startAngle + speedFrac * totalAngle;
  if (speedFrac > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, activeEndAngle);
    ctx.lineWidth = 14;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#22c55e');
    grad.addColorStop(0.5, '#eab308');
    grad.addColorStop(1, '#ef4444');
    ctx.strokeStyle = grad;
    ctx.stroke();
  }

  // Neon Red Needle
  const needleAngle = startAngle + speedFrac * totalAngle;
  const needleLen = radius - 15;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy + needleLen * Math.sin(needleAngle);

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Center Pivot
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

// Multi-Constellation Satellites Radar Skyplot
function initRadarCanvas() {
  drawRadar(satellitesData);
}

function generateMultiConstellationSatellites(accuracy = 5) {
  // GPS (1-32), Galileo (101-136), BeiDou (201-240), GLONASS (65-96)
  const constellationList = [
    // GPS (US)
    { prn: 'G05', sys: 'gps', el: 22, az: 335, cn0: 38 },
    { prn: 'G12', sys: 'gps', el: 68, az: 20, cn0: 42 },
    { prn: 'G18', sys: 'gps', el: 12, az: 180, cn0: 28 },
    { prn: 'G19', sys: 'gps', el: 72, az: 35, cn0: 44 },
    { prn: 'G24', sys: 'gps', el: 45, az: 260, cn0: 36 },
    { prn: 'G25', sys: 'gps', el: 58, az: 70, cn0: 40 },
    { prn: 'G28', sys: 'gps', el: 15, az: 110, cn0: 31 },
    { prn: 'G29', sys: 'gps', el: 32, az: 95, cn0: 34 },
    // BeiDou (China)
    { prn: 'B201', sys: 'beidou', el: 60, az: 290, cn0: 41 },
    { prn: 'B203', sys: 'beidou', el: 28, az: 160, cn0: 30 },
    { prn: 'B206', sys: 'beidou', el: 35, az: 245, cn0: 33 },
    { prn: 'B208', sys: 'beidou', el: 48, az: 105, cn0: 38 },
    { prn: 'B210', sys: 'beidou', el: 75, az: 140, cn0: 45 },
    { prn: 'B223', sys: 'beidou', el: 30, az: 100, cn0: 32 },
    { prn: 'B224', sys: 'beidou', el: 48, az: 300, cn0: 39 },
    { prn: 'B225', sys: 'beidou', el: 50, az: 88, cn0: 37 },
    { prn: 'B226', sys: 'beidou', el: 25, az: 275, cn0: 27 },
    { prn: 'B228', sys: 'beidou', el: 22, az: 175, cn0: 31 },
    { prn: 'B234', sys: 'beidou', el: 42, az: 40, cn0: 36 },
    // Galileo (EU)
    { prn: 'E02', sys: 'galileo', el: 54, az: 130, cn0: 43 },
    { prn: 'E08', sys: 'galileo', el: 36, az: 210, cn0: 35 },
    { prn: 'E14', sys: 'galileo', el: 64, az: 315, cn0: 40 },
    // GLONASS (Russia)
    { prn: 'R69', sys: 'glonass', el: 18, az: 220, cn0: 29 },
    { prn: 'R80', sys: 'glonass', el: 62, az: 50, cn0: 39 },
    { prn: 'R83', sys: 'glonass', el: 38, az: 115, cn0: 35 }
  ];

  satellitesData = constellationList.map(s => ({
    ...s,
    usedInFix: s.cn0 >= 30 && accuracy <= 15
  }));

  renderSignalBars(satellitesData);
}

function drawRadar(satellites) {
  const canvas = document.getElementById('satelliteRadarCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = w / 2 - 18;

  ctx.clearRect(0, 0, w, h);

  // Gradient Cosmic Background
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
  grad.addColorStop(0, '#00183d');
  grad.addColorStop(0.65, '#00081a');
  grad.addColorStop(1, '#05070d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Radar Rotating Sweep Line
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, radarAngle, radarAngle + 0.35);
  ctx.closePath();
  const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  sweepGrad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
  sweepGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
  ctx.fillStyle = sweepGrad;
  ctx.fill();
  ctx.restore();

  // Concentric Elevation Rings (30°, 60°, 90°)
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 1;
  [0.33, 0.66, 1.0].forEach(f => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * f, 0, 2 * Math.PI);
    ctx.stroke();
  });

  // Cross axes
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();

  // Cardinal Labels
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ef4444';
  ctx.fillText('N', cx, cy - radius + 10);
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('S', cx, cy + radius - 10);
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('E', cx + radius - 10, cy);
  ctx.fillText('W', cx - radius + 10, cy);

  let inUseCount = 0;
  satellites.forEach(s => {
    if (s.usedInFix) inUseCount++;

    const r = radius * ((90 - s.el) / 90);
    const angleRad = (s.az - 90) * (Math.PI / 180);

    const x = cx + r * Math.cos(angleRad);
    const y = cy + r * Math.sin(angleRad);

    // Color by Constellation
    let dotColor = '#facc15'; // GPS (Yellow)
    if (s.sys === 'galileo') dotColor = '#38bdf8'; // Galileo (Blue)
    else if (s.sys === 'beidou') dotColor = '#f87171'; // BeiDou (Red)
    else if (s.sys === 'glonass') dotColor = '#c084fc'; // GLONASS (Purple)

    if (!s.usedInFix) dotColor = '#64748b'; // Grey if not in use

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = dotColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '8px Arial';
    ctx.fillText(s.prn, x, y + 10);
  });

  const vEl = document.getElementById('sat-in-view');
  const uEl = document.getElementById('sat-in-use');
  const qEl = document.getElementById('quick-sat-count');
  if (vEl) vEl.textContent = satellites.length;
  if (uEl) uEl.textContent = inUseCount;
  if (qEl) qEl.textContent = `${inUseCount}/${satellites.length}🛰️`;
}

function renderSignalBars(satellites) {
  const container = document.getElementById('sat-bars-container');
  if (!container) return;
  container.innerHTML = '';

  satellites.slice(0, 20).forEach(s => {
    const col = document.createElement('div');
    col.className = 'sat-bar-col';

    const bar = document.createElement('div');
    bar.className = 'sat-bar-fill';
    const heightPx = Math.min(Math.max((s.cn0 / 50) * 36, 4), 36);
    bar.style.height = `${heightPx}px`;

    let barColor = '#22c55e';
    if (s.cn0 < 28) barColor = '#64748b';
    else if (s.cn0 < 35) barColor = '#f59e0b';

    bar.style.background = barColor;

    const label = document.createElement('span');
    label.className = 'sat-bar-label';
    label.textContent = s.prn;

    col.appendChild(bar);
    col.appendChild(label);
    container.appendChild(col);
  });
}

// Speed Chart
function drawSpeedChart() {
  const canvas = document.getElementById('speedHistoryCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#283548';
  ctx.lineWidth = 1;
  for (let y = 20; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  if (speedHistory.length < 2) {
    ctx.fillStyle = '#64748b';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Đang chờ dữ liệu vận tốc...', w / 2, h / 2);
    return;
  }

  ctx.beginPath();
  const maxH = gaugeMaxSpeed === 80 ? 80 : 140;
  speedHistory.forEach((pt, i) => {
    const x = (i / (speedHistory.length - 1)) * (w - 30) + 15;
    const y = h - 20 - (Math.min(pt.speed, maxH) / maxH) * (h - 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo((w - 30) + 15, h - 20);
  ctx.lineTo(15, h - 20);
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, 0, 0, h);
  fillGrad.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
  fillGrad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
  ctx.fillStyle = fillGrad;
  ctx.fill();
}

// Export Travel Logs (GPX, KML, CSV)
function initExportHandlers() {
  document.getElementById('btn-export-gpx').addEventListener('click', exportGPX);
  document.getElementById('btn-export-kml').addEventListener('click', exportKML);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
}

function updateExportLogSummary() {
  const countEl = document.getElementById('log-point-count');
  const statusEl = document.getElementById('log-status');
  if (countEl) countEl.textContent = `${fullGpsLogs.length} điểm GPS`;
  if (statusEl) statusEl.textContent = tracking ? 'Đang ghi nhận...' : 'Đã dừng';
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  triggerHaptic('medium');
}

function exportGPX() {
  if (fullGpsLogs.length === 0) {
    alert('Chưa có dữ liệu GPS để xuất. Hãy bật GPS và di chuyển!');
    return;
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPS Speedometer Pro iOS" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>GPS Speedometer Track ${new Date().toLocaleDateString('vi-VN')}</name>
    <trkseg>\n`;

  fullGpsLogs.forEach(pt => {
    gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">
        <ele>${pt.alt.toFixed(2)}</ele>
        <time>${pt.time}</time>
        <speed>${(pt.speed / 3.6).toFixed(2)}</speed>
      </trkpt>\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  downloadFile(gpx, `trip_track_${Date.now()}.gpx`, 'application/gpx+xml');
}

function exportKML() {
  if (fullGpsLogs.length === 0) {
    alert('Chưa có dữ liệu GPS để xuất.');
    return;
  }

  const coordsStr = fullGpsLogs.map(p => `${p.lon},${p.lat},${p.alt}`).join('\n        ');
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>GPS Speedometer Track</name>
    <Placemark>
      <name>Lộ trình di chuyển</name>
      <LineString>
        <extrude>1</extrude>
        <tessellate>1</tessellate>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>
        ${coordsStr}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  downloadFile(kml, `trip_track_${Date.now()}.kml`, 'application/vnd.google-earth.kml+xml');
}

function exportCSV() {
  if (fullGpsLogs.length === 0) {
    alert('Chưa có dữ liệu GPS để xuất.');
    return;
  }

  let csv = 'Time,Latitude,Longitude,Altitude_m,Speed_kmh,Heading_deg,Accuracy_m\n';
  fullGpsLogs.forEach(p => {
    csv += `"${p.time}",${p.lat},${p.lon},${p.alt.toFixed(2)},${p.speed.toFixed(2)},${p.heading.toFixed(2)},${p.accuracy.toFixed(1)}\n`;
  });

  downloadFile(csv, `trip_telemetry_${Date.now()}.csv`, 'text/csv;charset=utf-8;');
}

// Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
}
