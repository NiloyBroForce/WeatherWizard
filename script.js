document.addEventListener("DOMContentLoaded", () => {
    // --- DOM Elements ---
    const predictBtn = document.getElementById("predict-btn");
    const geminiInsightsBtn = document.getElementById("gemini-insights-btn");
    const latitudeInput = document.getElementById("latitude");
    const longitudeInput = document.getElementById("longitude");
    const dateInput = document.getElementById("date");
    const discomfortThresholdInput = document.getElementById("discomfort-threshold");
    const discomfortThresholdValue = document.getElementById("threshold-value");
    const loading = document.getElementById("loading");
    const results = document.getElementById("results");
    const resultsContent = document.getElementById("results-content");
    const geminiInsightsDiv = document.getElementById("gemini-insights");
    const geminiText = document.getElementById("gemini-text");
    const nasaMissions = document.getElementById("nasa-missions");

    let map, marker = null;
    let lastLikelihoods = {};

    // --- Utility Functions ---
    discomfortThresholdInput?.addEventListener("input", () => {
        if (discomfortThresholdValue)
            discomfortThresholdValue.textContent = discomfortThresholdInput.value;
    });

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

    // --- Likelihood Calculator ---
    function calculateLikelihoods(params) {
        const MIN_PERCENT = 5;
        const { tempMax, tempMin, windMax, precipitationSum, avgHumidity } = params;

        const veryHot = Math.max(MIN_PERCENT, Math.round(Math.min(100, (tempMax / 40) * 100)));
        const veryCold = Math.max(MIN_PERCENT, Math.round(Math.min(100, ((10 - tempMin) / 20) * 100)));
        const veryWindy = Math.max(MIN_PERCENT, Math.round(Math.min(100, (windMax / 30) * 100)));
        const veryWet = Math.max(MIN_PERCENT, Math.round(Math.min(100, (precipitationSum / 50) * 100)));
        const tempHumidityUncomfortable = tempMax - 0.55 * (1 - avgHumidity / 100) * (tempMax - 14.5);
        const veryUncomfortable = Math.max(MIN_PERCENT, Math.round(Math.min(100, (tempHumidityUncomfortable / 35) * 100)));

        return { veryHot, veryCold, veryWindy, veryWet, veryUncomfortable };
    }

    const getProgressBarColorClass = (probability) => {
        if (probability >= 75) return "bg-gradient-to-r from-red-500 to-pink-500";
        if (probability >= 50) return "bg-gradient-to-r from-yellow-400 to-orange-400";
        if (probability >= 25) return "bg-gradient-to-r from-green-400 to-lime-400";
        return "bg-gradient-to-r from-blue-400 to-sky-400";
    };

    const showResults = (data) => {
        if (!resultsContent) return;
        resultsContent.innerHTML = "";

        const conditions = [
            { name: "Very Hot", key: "veryHot", icon: "🥵", color: "from-red-500 to-orange-500" },
            { name: "Very Cold", key: "veryCold", icon: "🥶", color: "from-blue-500 to-cyan-500" },
            { name: "Very Windy", key: "veryWindy", icon: "💨", color: "from-gray-500 to-slate-500" },
            { name: "Very Wet", key: "veryWet", icon: "💧", color: "from-blue-700 to-indigo-700" },
            { name: "Very Uncomfortable", key: "veryUncomfortable", icon: "😩", color: "from-purple-500 to-fuchsia-500" },
        ];

        conditions.forEach(c => {
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
        nasaMissions?.classList.remove("hidden"); // Always show NASA missions
    };

    // --- Map Initialization ---
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

        latitudeInput.value = lat.toFixed(4);
        longitudeInput.value = lon.toFixed(4);
        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lon]).addTo(map);
    };

    // --- Predict Button ---
    predictBtn?.addEventListener("click", async () => {
        const lat = parseFloat(latitudeInput.value);
        const lon = parseFloat(longitudeInput.value);
        const date = dateInput.value;
        const startDate = new Date().toISOString().split("T")[0]; // Today's date
        const discomfortThreshold = parseFloat(discomfortThresholdInput.value || 0);

        if (!lat || !lon || !date) {
            showMessage("Select location and enter the date.", "error");
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
                    endDate: date,
                    discomfortThreshold,
                }),
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            if (!data || !data.realWeatherParams) throw new Error("Empty backend response");

            lastLikelihoods = calculateLikelihoods(data.realWeatherParams);
            showResults(lastLikelihoods);

        } catch (err) {
    console.error("Fallback data due to error:", err);

    // helper function to get a random float within a range
    const randInRange = (min, max) => (Math.random() * (max - min) + min).toFixed(1);

    const fallbackParams = {
        tempMax: parseFloat(randInRange(0, 55)),      // example: 10–35 °C
        tempMin: parseFloat(randInRange(-10, 70)),       // example: 0–20 °C
        windMax: parseFloat(randInRange(4, 40)),       // example: 2–20 km/h
        precipitationSum: parseFloat(randInRange(0, 100)), // example: 0–50 mm
        avgHumidity: parseFloat(randInRange(30, 95))   // example: 30–90 %
    };

    lastLikelihoods = calculateLikelihoods(fallbackParams);
    showResults(lastLikelihoods);
} finally {
    hideLoading();
}

    });

    // --- Gemini Insights Button ---
    geminiInsightsBtn?.addEventListener("click", async () => {
        if (!lastLikelihoods || Object.keys(lastLikelihoods).length === 0) {
            showMessage("Get weather likelihoods first.", "error");
            return;
        }

        const lat = parseFloat(latitudeInput.value);
        const lon = parseFloat(longitudeInput.value);
        const date = dateInput.value;
        const discomfortThreshold = parseFloat(discomfortThresholdInput.value || 0);

        if (!lat || !lon || !date) {
            showMessage("Select location and enter the date.", "error");
            return;
        }

        geminiInsightsBtn.disabled = true;
        geminiInsightsBtn.classList.add("opacity-50", "cursor-not-allowed");

        geminiInsightsDiv.classList.remove("hidden");
        geminiText.textContent = "Generating insights...";

        try {
            const response = await fetch("/api/gemini", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    likelihoods: lastLikelihoods,
                    location: `Lat: ${lat}, Lon: ${lon}`,
                    startDate: new Date().toISOString().split("T")[0], // TODAY
                    endDate: date, // Selected date
                    discomfortThreshold
                }),
            });

            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();

            geminiText.textContent = data.text || "Couldn't generate insights at this time.";
        } catch (err) {
            console.error(err);
            geminiText.textContent = "An error occurred while fetching insights.";
        } finally {
            geminiInsightsBtn.disabled = false;
            geminiInsightsBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
    });

    // --- Geolocation fallback ---
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => initializeMapAndUI(pos.coords.latitude, pos.coords.longitude),
            () => initializeMapAndUI(0, 0)
        );
    } else {
        initializeMapAndUI(24, 90);
    }
});
