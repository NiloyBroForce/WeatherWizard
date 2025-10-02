document.addEventListener("DOMContentLoaded", () => {
	// --- DOM Elements ---
	const predictBtn = document.getElementById("predict-btn");
	const geminiInsightsBtn = document.getElementById("gemini-insights-btn");
	const latitudeInput = document.getElementById("latitude");
	const longitudeInput = document.getElementById("longitude");
	const startDateInput = document.getElementById("start-date");
	const endDateInput = document.getElementById("end-date");
	const discomfortThresholdInput = document.getElementById(
		"discomfort-threshold"
	);
	const discomfortThresholdValue = document.getElementById("threshold-value");
	const loading = document.getElementById("loading");
	const results = document.getElementById("results");
	const resultsContent = document.getElementById("results-content");
	const geminiInsightsDiv = document.getElementById("gemini-insights");
	const geminiText = document.getElementById("gemini-text");
	const nasaMissionsDiv = document.getElementById("nasa-missions");
	const messageBox = document.getElementById("message-box");
	const messageText = document.getElementById("message-text");
	const plotContainer = document.getElementById("nasa-plot");

	let map;
	let marker = null;
	let lastLikelihoods = {};

	// --- Utility Functions ---
	discomfortThresholdInput?.addEventListener("input", () => {
		if (discomfortThresholdValue)
			discomfortThresholdValue.textContent = discomfortThresholdInput.value;
	});

	const showMessage = (text, type = "error") => {
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
		const MIN_PERCENT = 5; // avoid 0%
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

		// Combine temperature and humidity for discomfort
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

	const reverseGeocode = async (lat, lon) => {
		try {
			const res = await fetch(
				`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
			);
			const data = await res.json();
			const city =
				data?.address?.city ||
				data?.address?.town ||
				data?.address?.village ||
				"";
			const country = data?.address?.country || "";
			return city && country
				? `${city}, ${country}`
				: country || `Lat: ${lat}, Lon: ${lon}`;
		} catch {
			return `Lat: ${lat}, Lon: ${lon}`;
		}
	};

	// --- Gemini Insights ---
const getGeminiInsights = async (
    likelihoods,
    location,
    startDate,
    endDate,
    discomfortThreshold
) => {
    geminiInsightsBtn.disabled = true;
    geminiInsightsBtn.classList.add("opacity-50", "cursor-not-allowed");
    geminiText.textContent = "Generating insights...";
    geminiInsightsDiv.classList.remove("hidden");
    nasaMissionsDiv.classList.remove("hidden");

    const dateRange =
        startDate === endDate ? startDate : `${startDate} to ${endDate}`;

    try {
        // Call your backend endpoint instead of Gemini directly
        const response = await fetch("/api/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                likelihoods,
                location,
                startDate,
                endDate,
                discomfortThreshold
            })
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        geminiText.textContent =
            data.text || "Couldn't generate insights at this time.";
    } catch (err) {
        console.error(err);
        geminiText.textContent = "An error occurred while fetching insights.";
    } finally {
        geminiInsightsBtn.disabled = false;
        geminiInsightsBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
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
				if (latitudeInput) latitudeInput.value = lat.toFixed(4);
				if (longitudeInput) longitudeInput.value = lng.toFixed(4);
				if (marker) map.removeLayer(marker);
				marker = L.marker([lat, lng]).addTo(map);
			});
		}

		if ((lat || lon) && latitudeInput && longitudeInput) {
			latitudeInput.value = lat.toFixed(4);
			longitudeInput.value = lon.toFixed(4);
			if (marker) map.removeLayer(marker);
			marker = L.marker([lat, lon]).addTo(map);
		}
	};

	// --- Predict Button ---
	predictBtn?.addEventListener("click", async () => {
		const lat = latitudeInput?.value;
		const lon = longitudeInput?.value;
		const startDate = startDateInput?.value;
		const endDate = endDateInput?.value;
		const discomfortThreshold = parseFloat(
			discomfortThresholdInput?.value || 0
		);

		if (!lat || !lon || !startDate || !endDate) {
			showMessage(
				"Select location and enter both start and end date.",
				"error"
			);
			return;
		}

		showLoading();

		try {
			fetch("/api/app.py", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    latitude: parseFloat(lat),
    longitude: parseFloat(lon),
    startDate,
    endDate,
    discomfortThreshold,
  }),
			});

			if (!response.ok) throw new Error(`Server error: ${response.status}`);
			const data = await response.json();

			if (!data || !data.realWeatherParams)
				throw new Error("Empty backend response");

			lastLikelihoods = calculateLikelihoods(data.realWeatherParams);
			if (data.plotBase64) lastLikelihoods.plotBase64 = data.plotBase64;

			showResults(lastLikelihoods);

			if (lastLikelihoods.plotBase64 && plotContainer)
				plotContainer.innerHTML = `<img src="data:image/png;base64,${lastLikelihoods.plotBase64}" alt="NASA Plot" class="rounded-lg shadow-lg">`;
		} catch {
			console.warn("Using fallback data");
			const fallbackParams = {
				tempMax: 16.9,
				tempMin: 6.1,
				windMax: 10.7,
				precipitationSum: 24.5,
				avgHumidity: 62.1,
			};
			lastLikelihoods = calculateLikelihoods(fallbackParams);
			lastLikelihoods.plotBase64 = generateFallbackChartBase64(
				...Object.values(fallbackParams)
			);

			showResults(lastLikelihoods);

			if (lastLikelihoods.plotBase64 && plotContainer)
				plotContainer.innerHTML = `<img src="data:image/png;base64,${lastLikelihoods.plotBase64}" alt="Fallback Plot" class="rounded-lg shadow-lg">`;
		} finally {
			hideLoading();
		}
	});

	// --- Fallback chart generator ---
	function generateFallbackChartBase64(
		tempMax,
		tempMin,
		windMax,
		precipitationSum,
		avgHumidity
	) {
		return "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgUBAJfU9BIAAAAASUVORK5CYII=";
	}

	// --- Gemini Insights Button ---
	geminiInsightsBtn.addEventListener("click", async () => {
		if (Object.keys(lastLikelihoods).length === 0) {
			showMessage("Get weather likelihoods first.", "error");
			return;
		}
		const lat = latitudeInput.value;
		const lon = longitudeInput.value;
		const startDate = startDateInput.value;
		const endDate = endDateInput.value;
		const discomfortThreshold = parseFloat(discomfortThresholdInput.value);

		const locationName = await reverseGeocode(lat, lon);
		getGeminiInsights(
			lastLikelihoods,
			locationName,
			startDate,
			endDate,
			discomfortThreshold
		);
	});

	// --- Geolocation fallback ---
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(
			(pos) => initializeMapAndUI(pos.coords.latitude, pos.coords.longitude),
			() => initializeMapAndUI(0, 0)
		);
	} else {
		initializeMapAndUI(0, 0);
	}
});
