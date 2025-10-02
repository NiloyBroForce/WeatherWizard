import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/gemini.py", methods=["POST"])
def gemini_route():
    GEMINI_API_KEY = os.environ.get("Gemini_Key")
    payload = request.get_json()

    systemPrompt = "You are a friendly AI..."
    userQuery = f"Weather data: {payload['likelihoods']}"

    apiUrl = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={GEMINI_API_KEY}"
    response = requests.post(apiUrl, json={
        "systemInstruction": {"parts": [{"text": systemPrompt}]},
        "contents": [{"parts": [{"text": userQuery}]}]
    })

    data = response.json()
    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return jsonify({"text": text})
