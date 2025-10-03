document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const predictBtn = document.getElementById("predict-btn");
    const geminiInsightsBtn = document.getElementById("gemini-insights-btn");
    const latitudeInput = document.getElementById("latitude");
    const longitudeInput = document.getElementById("longitude");
    // const startDateInput = document.getElementById("start-date"); // Removed, as it's not used
    const endDateInput = document.getElementById("end-date");
    const discomfortThresholdInput = document.getElementById(
        "discomfort-threshold"
    );
    const discomfortThresholdValue = document.getElementById("threshold-value");
    const loading = document.getElementById("loading");
    const results = document.getElementById("results");
    const resultsContent = document.getElementById("results-content");
    // FIX: Changed ID from 'gemini-insights' to 'gemini-insights-div' (assuming this is the correct ID based on common practice)
    const geminiInsightsDiv = document.getElementById("gemini-insights-div");
    const geminiText = document.getElementById("gemini-text");
    const downloadBtn = document.getElementById("download-btn");
    const plotChart = document.getElementById("plotChart");

    let map,
        marker = null;
    let lastLikelihoods = {};
    let lastData = null;
    let chartInstance = null;

    // --- Utility Functions ---
    const showMessage = (text, type = "error") => {
        const messageBox = document.getElementById("message-box");
        const messageText = document.getElementById("message-text");
        if (!messageBox || !messageText) return;
        messageText.textContent = text;
        messageBox.className =
            type === "error"
                ? "message-box block bg-red-600 text-white px-6 py-3 rounded-full shadow-lg text-sm"
                : "message-box block bg-green-500 text-white px-6 py-3 rounded-full shadow-lg text-sm";
        messageBox.classList.remove("hidden");
        setTimeout(() => messageBox.classList.add("hidden"), 4000);
    };

    const showLoading = () => {
        loading?.classList.remove("hidden");
        results?.classList.add("hidden");
        if (predictBtn) {
            predictBtn.disabled = true;
            predictBtn.classList.add("opacity-50", "cursor-not-allowed");
        }
    };

    const hideLoading = () => {
        loading?.classList.add("hidden");
        if (predictBtn) {
            predictBtn.disabled = false;
            predictBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    };

    discomfortThresholdInput?.addEventListener("input", () => {
        if (discomfortThresholdValue)
            discomfortThresholdValue.textContent = discomfortThresholdInput.value;
    });

    // --- Likelihood Calculator ---
    function calculateLikelihoods(params) {
        const MIN_PERCENT = 5;
        const { tempMax, tempMin, windMax, precipitationSum, avgHumidity } = params;
        const veryHot = Math.max(
            MIN_PERCENT,
            Math.round(Math.min(100, (tempMax / 40) * 100))
        );
        const veryCold = Math.max(
            MIN_PERCENT,
            Math.round(Math.min(100, ((10 - tempMin) / 20) * 100))
        );
        const veryWindy = Math.max(
            MIN_PERCENT,
            Math.round(Math.min(100, (windMax / 30) * 100))
        );
        const veryWet = Math.max(
            MIN_PERCENT,
            Math.round(Math.min(100, (precipitationSum / 50) * 100))
        );
        const tempHumidityUncomfortable =
            tempMax - 0.55 * (1 - avgHumidity / 100) * (tempMax - 14.5);
        const veryUncomfortable = Math.max(
            MIN_PERCENT,
            Math.round(Math.min(100, (tempHumidityUncomfortable / 35) * 100))
        );
        return { veryHot, veryCold, veryWindy, veryWet, veryUncomfortable };
    }

    const getProgressBarColorClass = (probability) => {
        if (probability >= 75) return "bg-gradient-to-r from-red-500 to-pink-500";
        if (probability >= 50)
            return "bg-gradient-to-r from-yellow-400 to-orange-400";
        if (probability >= 25) return "bg-gradient-to-r from-green-400 to-lime-400";
        return "bg-gradient-to-r from-blue-400 to-sky-400";
    };

    const showResults = (data) => {
        if (!resultsContent) return;
        resultsContent.innerHTML = "";

        const conditions = [
            {
                name: "Very Hot",
                key: "veryHot",
                icon: "🥵",
                color: "from-red-500 to-orange-500",
            },
            {
                name: "Very Cold",
                key: "veryCold",
                icon: "🥶",
                color: "from-blue-500 to-cyan-500",
            },
            {
                name: "Very Windy",
                key: "veryWindy",
                icon: "💨",
                color: "from-gray-500 to-slate-500",
            },
            {
                name: "Very Wet",
                key: "veryWet",
                icon: "💧",
                color: "from-blue-700 to-indigo-700",
            },
            {
                name: "Very Uncomfortable",
                key: "veryUncomfortable",
                icon: "😩",
                color: "from-purple-500 to-fuchsia-500",
            },
        ];

        conditions.forEach((c) => {
            const probability = data[c.key] || 0;
            const progressColor = getProgressBarColorClass(probability);
            const item = `
                <div class="bg-gradient-to-br ${c.color} p-4 rounded-xl shadow-xl border border-gray-600 hover:scale-105 transition-transform duration-300">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-2xl">${c.icon}</span>
                        <h3 class="text-lg font-semibold text-white">${c.name}</h3>
                    </div>
                    <div class="w-full bg-black bg-opacity-30 rounded-full h-2.5">
                        <div class="h-2.5 rounded-full ${progressColor}" style="width: ${probability}%"></div>
                    </div>
                    <p class="mt-2 text-sm text-gray-200 text-right">${probability}% likelihood</p>
                </div>`;
            resultsContent.innerHTML += item;
        });

        results?.classList.remove("hidden");
        geminiInsightsBtn?.classList.remove("hidden");
    };
    // --- Chart ---
    const showChart = (dates, temp, wind, precip) => {
        // FIX: Ensuring plotChart is an element before calling getContext, although the logic below does this better
        const ctx = plotChart?.getContext("2d"); 
        if (!ctx) return; // Add null check
        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: dates,
                datasets: [
                    {
                        label: "Temperature (°C)",
                        data: temp,
                        borderColor: "red",
                        backgroundColor: "rgba(255,0,0,0.2)",
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: "Wind Speed (km/h)",
                        data: wind,
                        borderColor: "blue",
                        backgroundColor: "rgba(0,0,255,0.2)",
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: "Precipitation (mm)",
                        data: precip,
                        borderColor: "green",
                        backgroundColor: "rgba(0,255,0,0.2)",
                        fill: false,
                        tension: 0.3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: "top", labels: { color: "#e2e8f0" } },
                },
                scales: {
                    x: { ticks: { color: "#e2e8f0" }, grid: { color: "#2d3748" } },
                    y: { ticks: { color: "#e2e8f0" }, grid: { color: "#2d3748" } },
                },
            },
        });
    };

    const downloadData = (dates, temp, wind, precip) => {
        const csv = ["Date,Temperature,WindSpeed,Precipitation"]
            .concat(dates.map((d, i) => `${d},${temp[i]},${wind[i]},${precip[i]}`))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "weather_data.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    downloadBtn?.addEventListener("click", () => {
        if (!lastData) {
            showMessage("No data to download.", "error");
            return;
        }
        downloadData(lastData.dates, lastData.temp, lastData.wind, lastData.precip);
    });

    // --- Map ---
    const initializeMapAndUI = (lat = 0, lon = 0) => {
        if (!map) {
            map = L.map("map").setView([lat, lon], lat && lon ? 13 : 2);
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "&copy; OpenStreetMap contributors",
            }).addTo(map);
            map.on("click", (e) => {
                const { lat, lng } = e.latlng;
                latitudeInput.value = lat.toFixed(4);
                longitudeInput.value = lng.toFixed(4);
                if (marker) map.removeLayer(marker);
                marker = L.marker([lat, lng]).addTo(map);
            });
        }
        if (lat || lon) {
            latitudeInput.value = lat.toFixed(4);
            longitudeInput.value = lon.toFixed(4);
            if (marker) map.removeLayer(marker);
            marker = L.marker([lat, lon]).addTo(map);
        }
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => initializeMapAndUI(pos.coords.latitude, pos.coords.longitude),
            () => initializeMapAndUI(0, 0)
        );
    } else {
        initializeMapAndUI(0, 0);
    }

    // --- Predict Button ---
    predictBtn?.addEventListener("click", async () => {
        const lat = parseFloat(latitudeInput.value);
        const lon = parseFloat(longitudeInput.value);
        // FIX: The hardcoded start date as requested
        const startDate = "2020-02-02"; 
        const endDate = endDateInput.value;
        const discomfortThreshold = parseFloat(discomfortThresholdInput.value || 0);

        if (isNaN(lat) || isNaN(lon) || !startDate || !endDate) {
            showMessage(
                "Select location and enter both start and end date.",
                "error"
            );
            return;
        }

        showLoading();

        try {
            const response = await fetch("/api/app", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: lat,
                    longitude: lon,
                    startDate,
                    endDate,
                    discomfortThreshold,
                }),
            });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();
            if (!data || !data.realWeatherParams)
                throw new Error("Empty backend response");

            // --- Calculate likelihoods and display ---
            lastLikelihoods = calculateLikelihoods(data.realWeatherParams);
            showResults(lastLikelihoods);

            // --- Update chart and table ---
            lastData = {
                dates: data.dates || [startDate],
                temp: data.temp || [data.realWeatherParams.tempMax],
                wind: data.wind || [data.realWeatherParams.windMax],
                precip: data.precip || [data.realWeatherParams.precipitationSum],
            };

            // Use existing canvas
            const plotCanvas = document.getElementById("plotChart");
            const ctx = plotCanvas?.getContext("2d"); // Added optional chaining for safety

            // Only proceed if context is available
            if (ctx) { 
                // Destroy old chart instance if exists
                if (chartInstance) chartInstance.destroy();
                console.log("Drawing chart with:", lastData);
                // Create new chart
                chartInstance = new Chart(ctx, {
                    type: "line",
                    data: {
                        labels: lastData.dates,
                        datasets: [
                            {
                                label: "Temperature (°C)",
                                data: lastData.temp,
                                borderColor: "red",
                                fill: false,
                            },
                            {
                                label: "Wind Speed (m/s)",
                                data: lastData.wind,
                                borderColor: "blue",
                                fill: false,
                            },
                            {
                                label: "Precipitation (mm)",
                                data: lastData.precip,
                                borderColor: "green",
                                fill: false,
                            },
                        ],
                    },
                    options: { responsive: true, maintainAspectRatio: false },
                });
            }
        } catch (err) {
            console.error(err);
            showMessage("Failed to fetch data. Using fallback values.", "error");

            const fallback = {
                tempMax: 16.9,
                tempMin: 6.1,
                windMax: 10.7,
                precipitationSum: 24.5,
                avgHumidity: 62.1,
            };
            lastLikelihoods = calculateLikelihoods(fallback);
            showResults(lastLikelihoods);
            lastData = {
                dates: [startDate],
                temp: [fallback.tempMax],
                wind: [fallback.windMax],
                precip: [fallback.precipitationSum],
            };
        } finally {
            hideLoading();
        }
    });

    // --- Gemini Insights ---
    geminiInsightsBtn?.addEventListener("click", async () => {
        if (!lastLikelihoods || Object.keys(lastLikelihoods).length === 0) {
            showMessage("Get weather likelihoods first.", "error");
            return;
        }

        const lat = latitudeInput.value;
        const lon = longitudeInput.value;
        // FIX: The hardcoded start date as requested
        const startDate = "2020-02-02"; 
        const endDate = endDateInput.value;
        const discomfortThreshold = parseFloat(discomfortThresholdInput.value || 0);

        try {
            const locationName = `${lat}, ${lon}`;
            // FIX: Added optional chaining for safety on geminiText and geminiInsightsDiv 
            // since they were part of the previous 'null' errors, assuming you fix the HTML
           if (geminiText) {
    geminiText.textContent = "Generating insights...";
}

// And for the next line, you can keep the optional chaining 
// because you are *calling a method* (`.remove`), not assigning a value:
geminiInsightsDiv?.classList.remove("hidden");

            const res = await fetch("/api/gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    likelihoods: lastLikelihoods,
                    location: locationName,
                    startDate,
                    endDate,
                    discomfortThreshold,
                }),
            });

            if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
            const result = await res.json();
            
            if (geminiText) { // Check if element exists before setting text
                geminiText.textContent =
                    result.text || "Couldn't generate insights at this time.";
            }
            geminiInsightsDiv?.scrollIntoView({ behavior: "smooth" });
        } catch (err) {
            console.error(err);
            // Check if element exists before setting error text
            if (geminiText) { 
                geminiText.textContent = "Error fetching Gemini insights.";
            }
        }
    });
});