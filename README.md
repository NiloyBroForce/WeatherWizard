WeatherWizard: Personalized Adverse Weather Predictor
A Next-Generation Tool for Customizing Your Comfort Threshold and Forecasting Adverse Conditions
Introduction
Welcome to WeatherWizard, a highly personalized web application designed to move beyond traditional weather reports. This tool empowers users to define their own comfort levels and receive precise likelihood predictions for adverse conditions at any chosen location and time. By integrating cutting-edge forecasting data with advanced AI insights, WeatherWizard helps users plan outdoor activities and travel with confidence.
Team Rain Rain Go Away
Team Leader: Rafin Islam Niloy
UI/UX Designer & App Developer: Muhammad Nahid
Researcher: Nazmul Hassan Labid
Core Features and Personalization
WeatherWizard offers deep customization to tailor predictions to your specific needs:

Interactive Location Selection: Users can easily select any location on Earth by clicking on the map, supported by clear zoom and pan functionality.

Custom Likelihood Prediction: The application instantly calculates the probability of five key conditions for the specified date: “Very Hot,” “Very Cold,” “Very Windy,” “Very Wet,” and “Very Uncomfortable.”

Personalized Discomfort Threshold: Users can set a specific temperature threshold (in °C) to define what feels "uncomfortable" to them, directly influencing the final "Very Uncomfortable" score.

Combined Likelihood Scoring: The "Very Uncomfortable" likelihood is a joint score, calculating the maximum probability based on two factors: the user's selected discomfort category (e.g., "Very Wet") and the general temperature/humidity-based discomfort threshold.

Gemini AI Insights: After prediction, users can access the “Weather Insights ✨” feature, which uses the Gemini API to analyze the likelihood scores and generate a plain-language summary with practical travel and activity advice.

NASA Mission Context: Provides external links to relevant NASA Earth Science Missions (SMAP, GPM, GRACE) to provide context on the scientific tools used to gather climate and observation data.
Technology Stack
WeatherWizard is built as a single-page, real-time application using modern web technologies:

Frontend: HTML5, pure JavaScript (ES6+), and Tailwind CSS for a responsive, colorful, and gradient-heavy UI.

Mapping: Leaflet.js for interactive, clickable mapping functionality.

Data Source: Integration with modern forecasting APIs for reliable, up-to-16-day future weather predictions.

Intelligence Layer: Google Gemini API for generating custom, context-aware user insights and travel advice.

Aesthetics: Vibrant blue, purple, and green gradients are used throughout the UI to create an engaging and modern user experience.
