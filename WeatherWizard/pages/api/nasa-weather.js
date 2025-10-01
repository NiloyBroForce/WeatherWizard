import fetch from 'node-fetch';

// This is the API route that runs on the Vercel serverless function (the backend proxy).
// It converts the client's request (e.g., /nasa-weather?lat=X&lon=Y&date=Z)
// into a proper NASA POWER API request.

// Base URL for the NASA POWER API (using daily precipitation)
const NASA_POWER_BASE_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const NASA_POWER_PARAMS = 'PRECTOT'; // Total Precipitation (mm)

export default async function handler(req, res) {
  // Ensure we are handling a GET request
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Only GET requests are supported.' });
  }

  // 1. Extract parameters from the client request
  const { lat, lon, date } = req.query;

  if (!lat || !lon || !date) {
    return res.status(400).json({ error: 'Missing required parameters: lat, lon, or date.' });
  }

  // NASA POWER API requires date in YYYYMMDD format (e.g., 2023-10-25 -> 20231025)
  const yyyymmdd = date.replace(/-/g, ''); 

  // 2. Construct the full NASA API URL
  const nasaUrl = `${NASA_POWER_BASE_URL}?parameters=${NASA_POWER_PARAMS}&community=RE&longitude=${lon}&latitude=${lat}&start=${yyyymmdd}&end=${yyyymmdd}&format=JSON`;

  console.log(`Proxying request to NASA: ${nasaUrl}`);

  try {
    // 3. Make the request to the actual NASA API
    const nasaResponse = await fetch(nasaUrl);

    if (!nasaResponse.ok) {
      // If NASA API returns an error status (e.g., 400, 500)
      console.error(`NASA API returned status ${nasaResponse.status}`);
      return res.status(nasaResponse.status).json({ 
        error: `Failed to fetch data from NASA POWER API. Status: ${nasaResponse.status}` 
      });
    }

    const nasaData = await nasaResponse.json();

    // 4. Process and extract the precipitation value
    // NASA data structure is complex, we need to drill down
    const precipitationValue = nasaData?.properties?.parameter?.PRECTOT?.[yyyymmdd];

    if (precipitationValue === undefined || precipitationValue === -999.0) {
        // -999.0 is often the NODATA value in NASA POWER
        console.warn(`No valid precipitation data found for ${yyyymmdd}.`);
        return res.status(200).json({ 
            results: [{ 
                lat: parseFloat(lat), 
                lon: parseFloat(lon), 
                value: 0, // Default to 0 if data is missing or nodata
                isFallback: true
            }]
        });
    }

    // 5. Return the simplified, successful JSON response to the client
    return res.status(200).json({
      results: [{
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        value: precipitationValue,
        isFallback: false
      }]
    });

  } catch (error) {
    console.error('Proxy Error:', error.message);
    // Return a generic server error if fetch fails (e.g., network issue)
    return res.status(500).json({ error: 'Internal server error while connecting to NASA.' });
  }
}
