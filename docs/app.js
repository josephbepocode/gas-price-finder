// State
let allStations = [];
let currentGrade = 'regular';
let currentLat = null;
let currentLng = null;
let compareMode = false;

const GRADE_MAP = {
  regular:  { label: 'Regular',   nickname: ['regular', 'unleaded', 'regular unleaded'] },
  midgrade: { label: 'Mid-Grade', nickname: ['midgrade', 'plus', 'mid-grade', 'mid grade'] },
  premium:  { label: 'Premium',   nickname: ['premium', 'super', 'super premium'] },
  diesel:   { label: 'Diesel',    nickname: ['diesel'] },
};

// Use local proxy in dev, CORS proxy on GitHub Pages
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const GASBUDDY_URL = 'https://www.gasbuddy.com/graphql';
const CORS_PROXY = 'https://corsproxy.io/?url=';

const GRAPHQL_QUERY = `
  query StationSearch($cursor: String, $limit: Int, $search: GasStationSearchInput!) {
    stations(cursor: $cursor, limit: $limit, search: $search) {
      count
      results {
        id
        name
        address { line1 city state zip lat lng }
        prices {
          cash   { nickname postedTime price formattedPrice }
          credit { nickname postedTime price formattedPrice }
        }
        distance
      }
    }
  }
`;

// DOM refs
const locateBtn      = document.getElementById('locate-btn');
const statusBar      = document.getElementById('status-bar');
const summary        = document.getElementById('summary');
const resultsSection = document.getElementById('results-section');
const emptyState     = document.getElementById('empty-state');
const loadingEl      = document.getElementById('loading');
const errorState     = document.getElementById('error-state');
const stationList    = document.getElementById('station-list');
const compareTable   = document.getElementById('comparison-table');
const comparisonBody = document.getElementById('comparison-body');
const compareBtn     = document.getElementById('compare-btn');
const sortSelect     = document.getElementById('sort-select');
const radiusSelect   = document.getElementById('radius');

document.querySelectorAll('.grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGrade = btn.dataset.grade;
    if (allStations.length > 0) render();
  });
});

locateBtn.addEventListener('click', locate);
compareBtn.addEventListener('click', toggleCompare);
sortSelect.addEventListener('change', () => { if (allStations.length > 0) render(); });
radiusSelect.addEventListener('change', () => { if (currentLat) fetchStations(currentLat, currentLng); });

function locate() {
  if (!navigator.geolocation) {
    showError('Geolocation Not Supported', 'Your browser does not support geolocation.');
    return;
  }
  showLoading();
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentLat = pos.coords.latitude;
      currentLng = pos.coords.longitude;
      fetchStations(currentLat, currentLng);
    },
    err => {
      const msgs = {
        1: 'Location permission was denied. Please allow location access and try again.',
        2: 'Your location could not be determined.',
        3: 'Location request timed out.',
      };
      showError('Location Error', msgs[err.code] || 'Unknown location error.');
    },
    { timeout: 10000 }
  );
}

async function fetchStations(lat, lng) {
  showLoading();
  const radius = radiusSelect.value;

  try {
    let json;

    if (isLocalDev) {
      // Local Node proxy
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radius }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      json = await res.json();
    } else {
      // Direct call via CORS proxy for GitHub Pages
      const body = JSON.stringify({
        operationName: 'StationSearch',
        query: GRAPHQL_QUERY,
        variables: {
          limit: 30,
          search: { lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius) },
        },
      });

      const res = await fetch(CORS_PROXY + encodeURIComponent(GASBUDDY_URL), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        body,
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      json = await res.json();
    }

    const stations = json?.data?.stations?.results ?? [];
    if (stations.length === 0) {
      showError('No Stations Found', `No gas stations found within ${radius} miles. Try increasing the search radius.`);
      return;
    }

    allStations = stations;
    render();
  } catch (err) {
    showError('Failed to Load Prices', err.message);
  }
}

function retryFetch() {
  if (currentLat) fetchStations(currentLat, currentLng);
  else locate();
}
window.retryFetch = retryFetch;

function render() {
  hideAll();
  statusBar.textContent = `Showing stations within ${radiusSelect.value} miles`;
  statusBar.classList.remove('hidden');
  summary.classList.remove('hidden');
  resultsSection.classList.remove('hidden');

  const sorted = getSorted(allStations, currentGrade, sortSelect.value);
  updateSummary(sorted, currentGrade);

  if (compareMode) {
    stationList.classList.add('hidden');
    compareTable.classList.remove('hidden');
    renderCompareTable(sorted);
  } else {
    compareTable.classList.add('hidden');
    stationList.classList.remove('hidden');
    renderStationList(sorted, currentGrade);
  }

  document.getElementById('results-title').textContent =
    `${GRADE_MAP[currentGrade].label} Gas — ${allStations.length} Stations`;
}

function getSorted(stations, grade, sortBy) {
  return [...stations].sort((a, b) => {
    if (sortBy === 'price') {
      const pa = getPrice(a, grade);
      const pb = getPrice(b, grade);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return pa - pb;
    }
    if (sortBy === 'distance') return (a.distance ?? 99) - (b.distance ?? 99);
    if (sortBy === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
    return 0;
  });
}

function getPrice(station, grade) {
  const prices = station.prices;
  if (!prices) return null;
  const all = [...(prices.credit ?? []), ...(prices.cash ?? [])];
  const nicknames = GRADE_MAP[grade].nickname;
  const match = all.find(p =>
    p.nickname && nicknames.some(n => p.nickname.toLowerCase().includes(n))
  );
  return match?.price ?? null;
}

function updateSummary(sorted, grade) {
  const withPrices = sorted.filter(s => getPrice(s, grade) !== null);
  if (withPrices.length === 0) {
    document.getElementById('cheapest-price').textContent = 'N/A';
    document.getElementById('cheapest-name').textContent = 'No prices reported';
    document.getElementById('avg-price').textContent = 'N/A';
    document.getElementById('expensive-price').textContent = 'N/A';
    document.getElementById('expensive-name').textContent = 'No prices reported';
    return;
  }

  const prices = withPrices.map(s => getPrice(s, grade));
  const cheapest = withPrices[0];
  const expensive = withPrices[withPrices.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  document.getElementById('cheapest-price').textContent = `$${getPrice(cheapest, grade).toFixed(2)}`;
  document.getElementById('cheapest-name').textContent = cheapest.name ?? 'Unknown';
  document.getElementById('avg-price').textContent = `$${avg.toFixed(2)}`;
  document.getElementById('expensive-price').textContent = `$${getPrice(expensive, grade).toFixed(2)}`;
  document.getElementById('expensive-name').textContent = expensive.name ?? 'Unknown';
}

function priceColor(price, min, max) {
  if (price === null) return '';
  if (price <= min) return 'price-green';
  if (price >= max) return 'price-red';
  return 'price-yellow';
}

function renderStationList(sorted, grade) {
  const withPrices = sorted.filter(s => getPrice(s, grade) !== null);
  const prices = withPrices.map(s => getPrice(s, grade));
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  stationList.innerHTML = sorted.map((station, i) => {
    const price = getPrice(station, grade);
    const color = priceColor(price, min, max);
    const rank = i + 1;
    const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const addr = station.address;
    const address = addr ? `${addr.line1 ?? ''}, ${addr.city ?? ''}, ${addr.state ?? ''}`.replace(/^,\s*|,\s*$/, '') : '';
    const dist = station.distance != null ? `${station.distance.toFixed(1)} mi away` : '';
    const updated = getPostedTime(station, grade);

    return `
      <div class="station-card">
        <div class="rank-badge ${badgeClass}">${rank}</div>
        <div class="station-info">
          <div class="station-name">${esc(station.name ?? 'Unknown Station')}</div>
          <div class="station-address">${esc(address)}</div>
        </div>
        <div class="station-distance">${esc(dist)}</div>
        <div>
          ${price !== null
            ? `<div class="station-price ${color}">$${price.toFixed(2)}</div>
               <div class="price-updated">${updated ? `Updated ${updated}` : ''}</div>`
            : `<div class="price-unavailable">No price reported</div>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderCompareTable(sorted) {
  const grades = ['regular', 'midgrade', 'premium', 'diesel'];
  const mins = {};
  grades.forEach(g => {
    const prices = sorted.map(s => getPrice(s, g)).filter(p => p !== null);
    mins[g] = prices.length ? Math.min(...prices) : null;
  });

  comparisonBody.innerHTML = sorted.map(station => {
    const addr = station.address;
    const city = addr ? `${addr.city ?? ''}, ${addr.state ?? ''}` : '';
    const dist = station.distance != null ? `${station.distance.toFixed(1)} mi` : '--';

    const cells = grades.map(g => {
      const price = getPrice(station, g);
      if (price === null) return `<td class="no-price">--</td>`;
      const isCheapest = mins[g] !== null && price === mins[g];
      return `<td class="price-cell ${isCheapest ? 'cheapest-cell' : ''}">$${price.toFixed(2)}</td>`;
    }).join('');

    return `
      <tr>
        <td>
          <div style="font-weight:600">${esc(station.name ?? 'Unknown')}</div>
          <div style="font-size:.75rem;color:var(--gray-400)">${esc(city)}</div>
        </td>
        ${cells}
        <td>${esc(dist)}</td>
      </tr>
    `;
  }).join('');
}

function getPostedTime(station, grade) {
  const prices = station.prices;
  if (!prices) return null;
  const all = [...(prices.credit ?? []), ...(prices.cash ?? [])];
  const nicknames = GRADE_MAP[grade].nickname;
  const match = all.find(p =>
    p.nickname && nicknames.some(n => p.nickname.toLowerCase().includes(n))
  );
  if (!match?.postedTime) return null;
  try {
    const d = new Date(match.postedTime);
    const diff = Math.floor((Date.now() - d) / 60000);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  } catch { return null; }
}

function toggleCompare() {
  compareMode = !compareMode;
  compareBtn.classList.toggle('active', compareMode);
  compareBtn.textContent = compareMode ? 'Show Single Grade' : 'Compare All Grades';
  if (allStations.length > 0) render();
}

function showLoading() {
  hideAll();
  loadingEl.classList.remove('hidden');
  locateBtn.disabled = true;
}

function showError(title, msg) {
  hideAll();
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-msg').textContent = msg;
  errorState.classList.remove('hidden');
  locateBtn.disabled = false;
}

function hideAll() {
  emptyState.classList.add('hidden');
  loadingEl.classList.add('hidden');
  errorState.classList.add('hidden');
  summary.classList.add('hidden');
  resultsSection.classList.add('hidden');
  statusBar.classList.add('hidden');
  locateBtn.disabled = false;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
