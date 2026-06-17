const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('docs'));

// Proxy Ontario fuel price CSV to avoid CORS
app.get('/api/prices', async (req, res) => {
  try {
    const response = await fetch('https://www.ontario.ca/v1/files/fuel-prices/fueltypesall.csv', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Ontario data fetch failed' });
    }

    const csv = await response.text();
    res.type('text/csv').send(csv);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch fuel prices' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Ontario Gas Prices running at http://localhost:${PORT}`);
});
