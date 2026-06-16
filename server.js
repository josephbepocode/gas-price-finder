const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('docs'));
app.use(express.json());

// Proxy GasBuddy GraphQL to avoid CORS
app.post('/api/stations', async (req, res) => {
  const { lat, lng, radius = 5 } = req.body;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const query = `
    query StationSearch($cursor: String, $limit: Int, $search: GasStationSearchInput!) {
      stations(cursor: $cursor, limit: $limit, search: $search) {
        count
        results {
          id
          name
          address {
            line1
            city
            state
            zip
            lat
            lng
          }
          prices {
            cash {
              nickname
              postedTime
              price
              formattedPrice
            }
            credit {
              nickname
              postedTime
              price
              formattedPrice
            }
          }
          distance
        }
      }
    }
  `;

  try {
    const response = await fetch('https://www.gasbuddy.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://www.gasbuddy.com',
        'Referer': 'https://www.gasbuddy.com/gas-prices',
      },
      body: JSON.stringify({
        operationName: 'StationSearch',
        query,
        variables: {
          limit: 30,
          search: {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            radius: parseFloat(radius),
          },
        },
      }),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'GasBuddy request failed', status: response.status });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('GasBuddy fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch gas prices', details: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gas Price Finder running at http://localhost:${PORT}`);
});
