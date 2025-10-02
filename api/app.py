# app.py (Vercel serverless version)
import os
import io
import base64
import warnings
import requests
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from flask import Flask, request, jsonify
from flask_cors import CORS
import urllib.parse as urlp

sns.set_theme(style="darkgrid")
warnings.filterwarnings("ignore")

app = Flask(__name__)
CORS(app)

# --- NASA Data Helper Functions ---

def get_time_series(start_date, end_date, latitude, longitude, variable):
    base_url = "https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi"
    query_parameters = {
        "variable": variable,
        "type": "asc2",
        "location": f"GEOM:POINT({longitude},{latitude})",
        "startDate": start_date,
        "endDate": end_date,
    }
    full_url = base_url + "?" + "&".join([f"{k}={urlp.quote(str(v))}" for k,v in query_parameters.items()])
    iteration = 0
    while iteration < 5:
        r = requests.get(full_url)
        if r.status_code == 200:
            return r.text
        iteration += 1
    raise Exception(f"Failed to fetch {variable} from NASA Data Rods after 5 attempts.")

def parse_time_series(ts_str):
    lines = ts_str.split("\n")
    df = pd.read_table(io.StringIO(ts_str), sep="\t", names=["time","data"], header=10, parse_dates=["time"])
    df['data'] = pd.to_numeric(df['data'], errors='coerce')
    return df

# --- Core Data Processing ---
def run_data_processing(start_date, end_date, latitude, longitude):
    nasa_start_date = start_date + "T00"
    nasa_end_date = end_date + "T00"

    # Precipitation
    df_precip = parse_time_series(get_time_series(nasa_start_date, nasa_end_date, latitude, longitude,
                                                  "NLDAS2:NLDAS_FORA0125_H_v2.0:Rainf"))
    # Soil moisture
    df_soil = parse_time_series(get_time_series(nasa_start_date, nasa_end_date, latitude, longitude,
                                                "NLDAS2:NLDAS_NOAH0125_H_v2.0:SoilM_0_100cm"))
    # Temperature
    df_temp = parse_time_series(get_time_series(nasa_start_date, nasa_end_date, latitude, longitude,
                                                "NLDAS2:NLDAS_FORA0125_H_v2.0:Tair"))
    # Wind
    df_wind = parse_time_series(get_time_series(nasa_start_date, nasa_end_date, latitude, longitude,
                                                "NLDAS2:NLDAS_FORA0125_H_v2.0:Wind_E"))

    df = pd.DataFrame({
        'time': pd.to_datetime(df_precip['time'], unit='s'),
        'Rainf': df_precip['data'],
        'SoilM_0_100cm': df_soil['data'],
        'Tair': df_temp['data'] - 273.15,
        'Wind': df_wind['data'] * 3.6
    })

    daily_agg = df.set_index('time').resample('1D').agg({'Tair':['max','min'], 'Wind':'max','Rainf':'sum'}).dropna()
    if daily_agg.empty:
        raise Exception("No complete daily data available.")

    first_day = daily_agg.iloc[0]
    real_weather_params = {
        "tempMax": round(first_day[('Tair','max')],1),
        "tempMin": round(first_day[('Tair','min')],1),
        "windMax": round(first_day[('Wind','max')],1),
        "precipitationSum": round(first_day[('Rainf','sum')],1),
        "avgHumidity": 70.0
    }

    # Plot
    daily_precip = df[['time','Rainf']].groupby(pd.Grouper(key='time', freq='1D')).sum().reset_index()
    daily_soil = df[['time','SoilM_0_100cm']].groupby(pd.Grouper(key='time', freq='1D')).mean().reset_index()

    fig, (ax1, ax2) = plt.subplots(2, figsize=(21,8), sharex=True)
    ax1.plot(daily_precip["time"], daily_precip["Rainf"], color="blue")
    ax1.set_ylim(-2, max(daily_precip["Rainf"].max()*1.1, 10))
    ax1.set_ylabel("Daily Precipitation (mm)")
    ax2.fill_between(daily_soil["time"], daily_soil["SoilM_0_100cm"].min()*0.9, daily_soil["SoilM_0_100cm"], color="green", alpha=0.25)
    ax2.set_ylim(daily_soil["SoilM_0_100cm"].min()*0.95, daily_soil["SoilM_0_100cm"].max()*1.05)
    ax2.set_ylabel("Mean Soil Moisture 0-100cm (mm)")
    ax2.set_xlabel("Date")
    fig.suptitle(f"NLDAS-2 Data ({latitude}, {longitude}) {start_date} - {end_date}", size=15)
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    plt.close(fig)
    plot_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    return {"plotBase64": plot_base64, "realWeatherParams": real_weather_params}

# --- Vercel API Route ---
@app.route("/", methods=["POST"])
def main():
    try:
        data = request.get_json()
        start_date = data.get('startDate')
        end_date = data.get('endDate')
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))

        result = run_data_processing(start_date, end_date, latitude, longitude)
        return jsonify({"status":"success", **result})

    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500

# --- Gemini API Proxy Route ---
@app.route("/gemini", methods=["POST"])
def gemini_proxy():
    try:
        from flask import abort
        data = request.get_json()
        user_query = data.get("query")
        system_prompt = data.get("systemPrompt")
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            abort(500, "GEMINI_API_KEY not set in environment")

        payload = {
            "contents": [{"parts": [{"text": user_query}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]}
        }
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
        response = requests.post(api_url, json=payload)
        response.raise_for_status()
        result = response.json()
        text = result.get("candidates",[{}])[0].get("content",[{}])[0].get("parts",[{}])[0].get("text","")
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
