import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/gemini", methods=["POST"])
def gemini_route():
    GEMINI_API_KEY = os.environ.get("Gemini_Key")
    if not GEMINI_API_KEY:
        return jsonify({"text": "Gemini API key not set"}), 500

    payload = request.get_json()
    systemPrompt = "You are a friendly AI assistant providing weather insights."
    userQuery = f"Weather data: {payload.get('likelihoods', {})}"

    apiUrl = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={GEMINI_API_KEY}"

    try:
        response = requests.post(apiUrl, json={
            "systemInstruction": {"parts": [{"text": systemPrompt}]},
            "contents": [{"parts": [{"text": userQuery}]}]
        })

        if not response.ok:
            return jsonify({"text": "Failed to fetch Gemini insights"}), 500

        data = response.json()
        text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"text": f"Error: {str(e)}"}), 500
