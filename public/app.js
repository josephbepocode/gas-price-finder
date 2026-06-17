// State
let allData = {};       // { fuelType: { city: price, ... }, ... }
let trendData = [];     // last N weeks for trend view
let currentGrade = 'Regular Unleaded Gasoline';
let currentCity = 'all';
let compareMode = false;
let latestDate = '';

const CSV_URL = 'https://www.ontario.ca/v1/files/fuel-prices/fueltypesall.csv';
const CORS_PROXY = 'https://corsproxy.io/?url=';
const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const CITIES = [
  'Ottawa', 'Toronto West', 'Toronto East', 'Windsor', 'London',
  'Peterborough', "St. Catharine's", 'Sudbury', 'Sault Saint Marie',
  'Thunder Bay', 'North Bay', 'Timmins', 'Kenora', 'Parry Sound'
];

const FUEL_TYPES = [
  'Regular Unleaded Gasoline',
  'Mid-Grade Gasoline',
  'Premium Gasoline',
  'Diesel'
];

const FUEL_LABELS = {
  'Regular Unleaded Gasoline': 'Regular',
  'Mid-Grade Gasoline': 'Mid-Grade',
  'Premium Gasoline': 'Premium',
  'Diesel': 'Diesel'
};

// DOM refs
const loadBtn        = document.getElementById('load-btn');
const statusBar      = document.getElementById('status-bar');
const summaryEl      = document.getElementById('summary');
const resultsSection = document.getElementById('results-section');
const emptyState     = document.getElementById('empty-state');
const loadingEl      = document.getElementById('loading');
const errorState     = document.getElementById('error-state');
const stationList    = document.getElementById('station-list');
const compareTable   = document.getElementById('comparison-table');
const comparisonBody = document.getElementById('comparison-body');
const compareBtn     = document.getElementById('compare-btn');
const sortSelect     = document.getElementById('sort-select');
const citySelect     = document.getElementById('city-select');
const trendSection   = document.getElementById('trend-section');
const trendChart     = document.getElementById('trend-chart');

document.querySelectorAll('.grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentGrade = btn.dataset.grade;
    if (Object.keys(allData).length > 0) render();
  });
});

loadBtn.addEventListener('click', loadPrices);
compareBtn.addEventListener('click', toggleCompare);
sortSelect.addEventListener('change', () => { if (Object.keys(allData).length > 0) render(); });
citySelect.addEventListener('change', () => {
  currentCity = citySelect.value;
  if (Object.keys(allData).length > 0) render();
});

async function loadPrices() {
  showLoading();
  try {
    const url = isLocalDev ? '/api/prices' : CORS_PROXY + encodeURIComponent(CSV_URL);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch data (${res.status})`);
    const csv = await res.text();
    parseCSV(csv);
    render();
  } catch (err) {
    showError('Failed to Load Prices', err.message);
  }
}
window.loadPrices = loadPrices;

function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) throw new Error('No data in CSV');

  const rows = lines.slice(1).map(line => {
    const parts = line.split(',');
    return {
      date: parts[0],
      prices: CITIES.map((_, i) => parseFloat(parts[i + 1]) || 0),
      fuelType: parts[17]
    };
  });

  // Get the latest date
  const dates = [...new Set(rows.map(r => r.date))].sort();
  latestDate = dates[dates.length - 1];

  // Build latest data: { fuelType: { city: price } }
  allData = {};
  FUEL_TYPES.forEach(ft => {
    allData[ft] = {};
    const row = rows.find(r => r.date === latestDate && r.fuelType === ft);
    if (row) {
      CITIES.forEach((city, i) => {
        allData[ft][city] = row.prices[i] > 0 ? row.prices[i] : null;
      });
    }
  });

  // Build trend data: last 12 weeks for each fuel type
  const recentDates = dates.slice(-12);
  trendData = recentDates.map(date => {
    const entry = { date };
    FUEL_TYPES.forEach(ft => {
      const row = rows.find(r => r.date === date && r.fuelType === ft);
      entry[ft] = {};
      if (row) {
        CITIES.forEach((city, i) => {
          entry[ft][city] = row.prices[i] > 0 ? row.prices[i] : null;
        });
      }
    });
    return entry;
  });
}

function render() {
  hideAll();

  const dateStr = formatDate(latestDate);
  statusBar.textContent = `Prices as of ${dateStr}`;
  statusBar.classList.remove('hidden');
  summaryEl.classList.remove('hidden');
  resultsSection.classList.remove('hidden');

  const prices = allData[currentGrade] || {};

  if (currentCity === 'all') {
    renderAllCities(prices);
  } else {
    renderSingleCity();
  }
}

function renderAllCities(prices) {
  const cityPrices = CITIES
    .map(city => ({ city, price: prices[city] }))
    .filter(c => c.price !== null);

  const sorted = sortCities(cityPrices);
  updateSummary(sorted);

  if (compareMode) {
    stationList.classList.add('hidden');
    compareTable.classList.remove('hidden');
    renderCompareTable();
  } else {
    compareTable.classList.add('hidden');
    stationList.classList.remove('hidden');
    renderCityList(sorted);
  }

  document.getElementById('results-title').textContent =
    `${FUEL_LABELS[currentGrade]} — ${cityPrices.length} Cities`;

  trendSection.classList.add('hidden');
}

function renderSingleCity() {
  const cityPrices = FUEL_TYPES
    .map(ft => ({ grade: ft, label: FUEL_LABELS[ft], price: (allData[ft] || {})[currentCity] }))
    .filter(g => g.price !== null);

  if (cityPrices.length === 0) {
    document.getElementById('cheapest-price').textContent = 'N/A';
    document.getElementById('cheapest-name').textContent = 'No data';
    document.getElementById('avg-price').textContent = 'N/A';
    document.getElementById('expensive-price').textContent = 'N/A';
    document.getElementById('expensive-name').textContent = 'No data';
  } else {
    const sorted = [...cityPrices].sort((a, b) => a.price - b.price);
    const avg = sorted.reduce((s, c) => s + c.price, 0) / sorted.length;
    document.getElementById('cheapest-price').textContent = fmt(sorted[0].price);
    document.getElementById('cheapest-name').textContent = sorted[0].label;
    document.getElementById('avg-price').textContent = fmt(avg);
    document.getElementById('expensive-price').textContent = fmt(sorted[sorted.length - 1].price);
    document.getElementById('expensive-name').textContent = sorted[sorted.length - 1].label;
  }

  compareTable.classList.add('hidden');
  stationList.classList.remove('hidden');

  stationList.innerHTML = cityPrices.map((g, i) => {
    const min = Math.min(...cityPrices.map(c => c.price));
    const max = Math.max(...cityPrices.map(c => c.price));
    const color = priceColor(g.price, min, max);
    const rank = i + 1;
    const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

    return `
      <div class="station-card">
        <div class="rank-badge ${badgeClass}">${rank}</div>
        <div class="station-info">
          <div class="station-name">${esc(g.label)}</div>
          <div class="station-address">${esc(currentCity)}</div>
        </div>
        <div class="station-price ${color}">${fmt(g.price)}</div>
      </div>
    `;
  }).join('');

  document.getElementById('results-title').textContent =
    `${esc(currentCity)} — All Fuel Grades`;

  renderTrend();
}

function sortCities(cityPrices) {
  const sortBy = sortSelect.value;
  return [...cityPrices].sort((a, b) => {
    if (sortBy === 'price') return a.price - b.price;
    return a.city.localeCompare(b.city);
  });
}

function updateSummary(sorted) {
  if (sorted.length === 0) {
    document.getElementById('cheapest-price').textContent = 'N/A';
    document.getElementById('cheapest-name').textContent = 'No data';
    document.getElementById('avg-price').textContent = 'N/A';
    document.getElementById('expensive-price').textContent = 'N/A';
    document.getElementById('expensive-name').textContent = 'No data';
    return;
  }

  const avg = sorted.reduce((s, c) => s + c.price, 0) / sorted.length;

  document.getElementById('cheapest-price').textContent = fmt(sorted[0].price);
  document.getElementById('cheapest-name').textContent = sorted[0].city;
  document.getElementById('avg-price').textContent = fmt(avg);
  document.getElementById('expensive-price').textContent = fmt(sorted[sorted.length - 1].price);
  document.getElementById('expensive-name').textContent = sorted[sorted.length - 1].city;
}

function renderCityList(sorted) {
  const prices = sorted.map(c => c.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  stationList.innerHTML = sorted.map((item, i) => {
    const color = priceColor(item.price, min, max);
    const rank = i + 1;
    const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const region = isNorthern(item.city) ? 'Northern Ontario' : 'Southern Ontario';

    return `
      <div class="station-card">
        <div class="rank-badge ${badgeClass}">${rank}</div>
        <div class="station-info">
          <div class="station-name">${esc(item.city)}</div>
          <div class="station-address">${esc(region)}</div>
        </div>
        <div class="station-price ${color}">${fmt(item.price)}</div>
      </div>
    `;
  }).join('');
}

function renderCompareTable() {
  const mins = {};
  FUEL_TYPES.forEach(ft => {
    const prices = CITIES.map(c => (allData[ft] || {})[c]).filter(p => p !== null && p > 0);
    mins[ft] = prices.length ? Math.min(...prices) : null;
  });

  comparisonBody.innerHTML = CITIES.map(city => {
    const cells = FUEL_TYPES.map(ft => {
      const price = (allData[ft] || {})[city];
      if (!price) return '<td class="no-price">--</td>';
      const isCheapest = mins[ft] !== null && price === mins[ft];
      return `<td class="price-cell ${isCheapest ? 'cheapest-cell' : ''}">${fmt(price)}</td>`;
    }).join('');

    return `
      <tr>
        <td><div style="font-weight:600">${esc(city)}</div></td>
        ${cells}
      </tr>
    `;
  }).join('');
}

function renderTrend() {
  if (trendData.length === 0) {
    trendSection.classList.add('hidden');
    return;
  }

  trendSection.classList.remove('hidden');
  document.getElementById('trend-title').textContent =
    `${esc(currentCity)} — ${FUEL_LABELS[currentGrade]} Price Trend`;

  const trendPrices = trendData.map(w => ({
    date: w.date,
    price: (w[currentGrade] || {})[currentCity] || null
  }));

  const validPrices = trendPrices.filter(t => t.price !== null).map(t => t.price);
  const maxPrice = validPrices.length ? Math.max(...validPrices) : 1;
  const minPrice = validPrices.length ? Math.min(...validPrices) : 0;
  const range = maxPrice - minPrice || 1;

  trendChart.innerHTML = `
    <table class="trend-table">
      <thead>
        <tr><th>Week</th><th>Price</th><th></th></tr>
      </thead>
      <tbody>
        ${trendPrices.map(t => {
          if (t.price === null) {
            return `<tr><td>${formatDate(t.date)}</td><td class="no-price">--</td><td></td></tr>`;
          }
          const pct = ((t.price - minPrice) / range) * 80 + 20;
          return `
            <tr>
              <td>${formatDate(t.date)}</td>
              <td style="font-weight:600">${fmt(t.price)}</td>
              <td class="trend-bar-cell"><div class="trend-bar" style="width:${pct}%"></div></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function toggleCompare() {
  compareMode = !compareMode;
  compareBtn.classList.toggle('active', compareMode);
  compareBtn.textContent = compareMode ? 'Show Single Grade' : 'Compare All Grades';
  if (Object.keys(allData).length > 0) render();
}

function fmt(cents) {
  return cents.toFixed(1) + '¢';
}

function priceColor(price, min, max) {
  if (price <= min) return 'price-green';
  if (price >= max) return 'price-red';
  return 'price-yellow';
}

function isNorthern(city) {
  return ['Sudbury', 'Sault Saint Marie', 'Thunder Bay', 'North Bay', 'Timmins', 'Kenora', 'Parry Sound'].includes(city);
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function showLoading() {
  hideAll();
  loadingEl.classList.remove('hidden');
  loadBtn.disabled = true;
}

function showError(title, msg) {
  hideAll();
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-msg').textContent = msg;
  errorState.classList.remove('hidden');
  loadBtn.disabled = false;
}

function hideAll() {
  emptyState.classList.add('hidden');
  loadingEl.classList.add('hidden');
  errorState.classList.add('hidden');
  summaryEl.classList.add('hidden');
  resultsSection.classList.add('hidden');
  statusBar.classList.add('hidden');
  trendSection.classList.add('hidden');
  loadBtn.disabled = false;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
