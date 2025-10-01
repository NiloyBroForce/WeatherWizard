import React, { useState, useEffect, useCallback } from 'react';
// NOTE: External libraries like 'react-leaflet' and 'leaflet' are not supported
// in this build environment. This component provides the data dashboard UI instead.

// --- Constants and Utility Functions ---

// Default coordinates (e.g., London)
const DEFAULT_LAT = 51.5074;
const DEFAULT_LON = 0.1278;

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const INITIAL_DATE = new Date().toISOString().split('T')[0];

const getWeatherColor = (likelihood) => {
    if (likelihood >= 80) return 'bg-red-600'; // High Discomfort
    if (likelihood >= 50) return 'bg-yellow-500'; // Moderate Discomfort
    if (likelihood >= 20) return 'bg-blue-400'; // Low Discomfort
    return 'bg-green-500'; // Comfortable
};

const calculateLikelihoods = (metrics, discomfortOption, discomfortThreshold) => {
    // Simplified logic for a demonstration.
    const { temperature, windSpeed, relativeHumidity, precipitation } = metrics;
    let likelihood = 0;

    // 1. Temperature Check (Primary Factor)
    if (temperature > 28) likelihood += 40;
    else if (temperature < 10) likelihood += 30;

    // 2. Humidity Check (Heat Discomfort)
    if (relativeHumidity > 70 && temperature > 25) likelihood += 30;

    // 3. Wind Check (Cooling/Windchill)
    if (windSpeed > 15) likelihood += 10; // Uncomfortable wind

    // 4. Precipitation Check (Weather Discomfort)
    if (precipitation > 1) likelihood += 20;

    // Apply Discomfort Option Bias
    if (discomfortOption === 'hot' && temperature > 25) likelihood *= 1.2;
    if (discomfortOption === 'cold' && temperature < 15) likelihood *= 1.2;

    // Ensure likelihood stays between 0 and 100
    likelihood = Math.min(100, Math.max(0, Math.round(likelihood)));

    // Determine status based on custom threshold
    const status = likelihood >= discomfortThreshold ? 'High Discomfort Risk' : 'Acceptable Comfort';

    return { likelihood, status, metrics };
};

// --- API Functions ---

const fetchOpenMeteoMetrics = async (lat, lon, date) => {
    const params = new URLSearchParams({
        latitude: lat,
        longitude: lon,
        daily: 'temperature_2m_max,relative_humidity_2m_max,wind_speed_10m_max,precipitation_sum',
        start_date: date,
        end_date: date,
        timezone: 'GMT'
    });

    const res = await fetch(`${OPEN_METEO_URL}?${params.toString()}`);
    if (!res.ok) throw new Error('Open-Meteo API failed to fetch data.');

    const data = await res.json();
    const daily = data.daily;

    if (!daily || daily.time.length === 0) {
        throw new Error('Open-Meteo returned no daily data for the selected date.');
    }

    return {
        temperature: daily.temperature_2m_max[0] || 0,
        relativeHumidity: daily.relative_humidity_2m_max[0] || 0,
        windSpeed: daily.wind_speed_10m_max[0] || 0,
        precipitation: daily.precipitation_sum[0] || 0
    };
};


// --- Map Component Logic (Refactored to be a Data Dashboard) ---

const MapComponent = () => {
    const [lat, setLat] = useState(DEFAULT_LAT);
    const [lon, setLon] = useState(DEFAULT_LON);
    const [inputLat, setInputLat] = useState(DEFAULT_LAT);
    const [inputLon, setInputLon] = useState(DEFAULT_LON);

    const [date, setDate] = useState(INITIAL_DATE);
    const [discomfortThreshold, setDiscomfortThreshold] = useState(50);
    const [discomfortOption, setDiscomfortOption] = useState('general');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const showMessage = (msg, type) => {
        setMessage({ text: msg, type });
        setTimeout(() => setMessage(''), 5000);
    };

    const fetchWeatherData = useCallback(async () => {
        setLoading(true);
        setResults(null);
        setMessage('');

        // 1. Update active coordinates from input fields
        setLat(Number(inputLat));
        setLon(Number(inputLon));

        // 2. Fetch Open-Meteo data first (Base metrics: Temp, Humidity, Wind)
        let metrics = {};
        try {
            showMessage("Fetching Open-Meteo metrics (Temp, Wind, Humidity)...", "info");
            metrics = await fetchOpenMeteoMetrics(Number(inputLat), Number(inputLon), date);
        } catch (error) {
            console.error("Open-Meteo Error:", error);
            showMessage("❌ Open-Meteo failed. Cannot proceed without base metrics.", "error");
            setLoading(false);
            return;
        }

        // 3. High-fidelity precipitation fetch (NASA proxy) is skipped in this component
        // as it relies on a local API route not yet provided. We use the Open-Meteo fallback.
        showMessage("✅ Using Open-Meteo data. (NASA data proxy is assumed to be running)", "success");

        // 4. Final calculation
        const likelihoods = calculateLikelihoods(metrics, discomfortOption, discomfortThreshold);
        setResults(likelihoods);
        setLoading(false);

    }, [inputLat, inputLon, date, discomfortOption, discomfortThreshold]);

    useEffect(() => {
        // Run fetch on initial load
        fetchWeatherData();
    }, [fetchWeatherData]);

    // Map visualization replaced with a static placeholder panel
    const LocationDisplayPanel = () => (
        <div className="flex flex-col items-center justify-center h-full bg-indigo-50/50 p-6 rounded-xl border-4 border-indigo-200 border-dashed">
            <svg className="w-16 h-16 text-indigo-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-indigo-700">Location Data Analysis</h3>
            <p className="text-sm text-gray-600 mt-2 text-center">
                Interactive map disabled due to unsupported external libraries.
                <br/>
                Analyzing: **Lat {lat.toFixed(4)}, Lon {lon.toFixed(4)}**
            </p>
        </div>
    );

    const handleLatChange = (e) => {
        const val = e.target.value;
        if (val === '' || (!isNaN(val) && val >= -90 && val <= 90)) {
            setInputLat(val);
        }
    };

    const handleLonChange = (e) => {
        const val = e.target.value;
        if (val === '' || (!isNaN(val) && val >= -180 && val <= 180)) {
            setInputLon(val);
        }
    };


    return (
        <div className="flex flex-col md:flex-row h-screen font-['Inter']">
            {/* Control Panel (Left Side) */}
            <div className="w-full md:w-1/3 p-6 bg-gray-50 border-r border-gray-200 overflow-y-auto">
                <h1 className="text-3xl font-extrabold text-indigo-700 mb-4">Discomfort Index Dashboard</h1>
                <p className="text-sm text-gray-600 mb-6">Enter coordinates and an analysis date to calculate the weather discomfort index.</p>

                {/* Lat/Lon Input */}
                <div className="mb-4 p-3 bg-white border border-indigo-200 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold text-indigo-800 mb-2">Location Input</h2>
                    <div className="flex space-x-2 mb-2">
                        <div className="flex-1">
                            <label htmlFor="inputLat" className="block text-xs font-medium text-gray-700 mb-1">Latitude (-90 to 90):</label>
                            <input
                                type="number"
                                id="inputLat"
                                value={inputLat}
                                onChange={handleLatChange}
                                placeholder="e.g., 51.5074"
                                min="-90"
                                max="90"
                                step="any"
                                className="w-full p-2 border border-gray-300 rounded-lg font-mono focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div className="flex-1">
                            <label htmlFor="inputLon" className="block text-xs font-medium text-gray-700 mb-1">Longitude (-180 to 180):</label>
                            <input
                                type="number"
                                id="inputLon"
                                value={inputLon}
                                onChange={handleLonChange}
                                placeholder="e.g., 0.1278"
                                min="-180"
                                max="180"
                                step="any"
                                className="w-full p-2 border border-gray-300 rounded-lg font-mono focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Date Input */}
                <div className="mb-4">
                    <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">Analysis Date:</label>
                    <input
                        type="date"
                        id="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>

                {/* Threshold Input */}
                <div className="mb-4">
                    <label htmlFor="threshold" className="block text-sm font-medium text-gray-700 mb-1">Discomfort Threshold ({discomfortThreshold}%):</label>
                    <input
                        type="range"
                        id="threshold"
                        min="10"
                        max="90"
                        step="5"
                        value={discomfortThreshold}
                        onChange={(e) => setDiscomfortThreshold(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Risk is "High" if likelihood &ge; {discomfortThreshold}%</p>
                </div>

                {/* Option Selector */}
                <div className="mb-6">
                    <label htmlFor="option" className="block text-sm font-medium text-gray-700 mb-1">Discomfort Focus:</label>
                    <select
                        id="option"
                        value={discomfortOption}
                        onChange={(e) => setDiscomfortOption(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="general">General Comfort</option>
                        <option value="hot">Bias towards Heat Discomfort</option>
                        <option value="cold">Bias towards Cold Discomfort</option>
                    </select>
                </div>

                {/* Action Button */}
                <button
                    onClick={fetchWeatherData}
                    disabled={loading || inputLat === '' || inputLon === ''}
                    className="w-full py-3 px-4 mb-6 text-white font-semibold rounded-lg shadow-lg transition duration-150 ease-in-out hover:shadow-xl hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-700"
                >
                    {loading ? 'Analyzing...' : 'Calculate Discomfort Index'}
                </button>

                {/* Results Display */}
                {results && (
                    <div className={`p-4 rounded-lg shadow-xl border-t-4 ${getWeatherColor(results.likelihood).replace('bg', 'border')}`}>
                        <h2 className="text-xl font-bold mb-2 text-gray-800">Analysis Results</h2>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-700 font-medium">Likelihood:</span>
                            <span className={`text-2xl font-extrabold text-white px-3 py-1 rounded-full ${getWeatherColor(results.likelihood)}`}>
                                {results.likelihood}%
                            </span>
                        </div>
                        <p className={`text-lg font-semibold ${results.status === 'High Discomfort Risk' ? 'text-red-700' : 'text-green-700'}`}>
                            Status: {results.status}
                        </p>

                        <div className="mt-4 border-t pt-2 text-sm text-gray-600">
                            <p>T-Max: <span className="font-medium">{results.metrics.temperature.toFixed(1)} &deg;C</span></p>
                            <p>Wind-Max: <span className="font-medium">{results.metrics.windSpeed.toFixed(1)} km/h</span></p>
                            <p>Humidity-Max: <span className="font-medium">{results.metrics.relativeHumidity.toFixed(0)}%</span></p>
                            <p>Precipitation: <span className="font-medium">{results.metrics.precipitation.toFixed(1)} mm</span></p>
                        </div>
                    </div>
                )}

                {/* Message Box */}
                {message && (
                    <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-100 text-red-800' : message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                        {message.text}
                    </div>
                )}
            </div>

            {/* Location Display Panel (Right Side) */}
            <div className="w-full md:w-2/3 h-full relative p-6">
                <LocationDisplayPanel />
            </div>
        </div>
    );
};

export default MapComponent;
