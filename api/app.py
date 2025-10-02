# --- Prerequisites ---
# To run this file, you need Python and the Flask framework installed:
# pip install Flask flask-cors pandas matplotlib seaborn requests


from flask import Flask, request, jsonify
from flask_cors import CORS # Required to allow the JS frontend to call this endpoint
import requests
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
sns.set_theme(style="darkgrid")
import urllib
import urllib.parse as urlp
import io
import warnings
import base64 
import os
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib"
warnings.filterwarnings("ignore")

app = Flask(__name__)
# Enable CORS for all routes so the browser running index.html can talk to this server
CORS(app) 

# --- Helper functions for NASA Data Rods API ---

def get_time_series(start_date: str, end_date: str, latitude: float, longitude: float, variable: str) -> str:
    """
    Calls the data rods service to get a time series from the NASA Data Rods service.
    """
    base_url = "https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi"
    query_parameters = {
        "variable": variable,
        "type": "asc2",
        "location": f"GEOM:POINT({longitude}, {latitude})",
        "startDate": start_date,
        "endDate": end_date,
    }
    # Ensure all parameters are correctly URL encoded
    full_url = base_url+"?"+ \
        "&".join(["{}={}".format(key,urlp.quote(str(query_parameters[key]))) for key in query_parameters])
    print(full_url)
    iteration = 0
    done = False
    while not done and iteration < 5:
        r=requests.get(full_url)
        if r.status_code == 200:
            done = True
        else:
            iteration +=1
    
    if not done:
        # Raise an exception that the Flask error handler can catch
        raise Exception(f"Error code {r.status_code} from url {full_url} : {r.text}")
    
    return r.text

def parse_time_series(ts_str: str) -> tuple[dict, pd.DataFrame]:
    """
    Parses the ASCII response from data rods into parameters and a pandas DataFrame.
    """
    lines = ts_str.split("\n")
    parameters = {}
    # Lines 2-11 usually contain metadata
    for line in lines[2:11]:
        # Handle lines that might not be simple key=value pairs
        if "=" in line:
            key,value = line.split("=")
            parameters[key.strip()] = value.strip()
    
    # Read the data section starting from header=10
    # pd.read_table returns a tuple if names are provided, so we need to handle that.
    df = pd.read_table(io.StringIO(ts_str),sep="\t",
                        names=["time","data"],
                        header=10,parse_dates=["time"])
                        
    # Ensure the 'data' column is numeric, coercing errors (like -9999) to NaN
    df['data'] = pd.to_numeric(df['data'], errors='coerce')
    
    return parameters, df

# This function contains the core logic for data fetching and plotting.
def run_data_processing(
    start_date: str, 
    end_date: str, 
    latitude: float, 
    longitude: float, 
    weather_data: dict, # Currently unused, as we are generating real data now
    discomfort_threshold: float, # Currently unused
    discomfort_option: str # Currently unused
) -> dict:
    """
    Fetches NASA data rods time series based on inputs, calculates daily weather
    parameters, and generates a plot. It returns the Base64 encoded plot data
    and the real weather parameters to the frontend.
    """
    
    # --- STEP 1: Format dates for NASA API and log inputs ---
    # The NASA API requires dates in YYYY-MM-DDT00 format.
    nasa_start_date = start_date + "T00"
    nasa_end_date = end_date + "T00"
    
    print(f"Processing Request:")
    print(f"   Start Date: {nasa_start_date}, End Date: {nasa_end_date}")
    print(f"   Location: Lat={latitude}, Lon={longitude}")
    
    # --- STEP 2: Fetch Data from NASA Data Rods (Hourly NLDAS-2 data) ---

    # 2a. Fetch Precipitation Data (Rainf - mm/hr)
    _, df_precip = parse_time_series(
        get_time_series(
            start_date=nasa_start_date, 
            end_date=nasa_end_date,
            latitude=latitude,
            longitude=longitude,
            variable="NLDAS2:NLDAS_FORA0125_H_v2.0:Rainf"
        )
    )

    # 2b. Fetch Soil Moisture Data (SoilM_0_100cm - mm/hr) - Plot only
    _, df_soil = parse_time_series(
        get_time_series(
            start_date=nasa_start_date, 
            end_date=nasa_end_date,
            latitude=latitude,
            longitude=longitude,
            variable="NLDAS2:NLDAS_NOAH0125_H_v2.0:SoilM_0_100cm"
        )
    )
    
    # 2c. Fetch Air Temperature Data (Tair_f_inst - Kelvin) - Likelihood max/min
    _, df_temp = parse_time_series(
        get_time_series(
            start_date=nasa_start_date, 
            end_date=nasa_end_date,
            latitude=latitude,
            longitude=longitude,
            variable="NLDAS2:NLDAS_FORA0125_H_v2.0:Tair"
        )
    )
    
    # 2d. Fetch Wind Speed Data (Wind_f_inst - m/s) - Likelihood max
    _, df_wind = parse_time_series(
        get_time_series(
            start_date=nasa_start_date, 
            end_date=nasa_end_date,
            latitude=latitude,
            longitude=longitude,
            variable="NLDAS2:NLDAS_FORA0125_H_v2.0:Wind_E"
        )
    )

    # 2e. Combine and prepare DataFrame
    # Note: Using df_precip's time column as the base
    df = pd.DataFrame({
        'time': pd.to_datetime(df_precip['time'], unit='s'), 
        'Rainf': df_precip['data'], 
        'SoilM_0_100cm': df_soil['data'],
        'Tair': df_temp['data'] - 273.15, # Convert Kelvin to Celsius
        'Wind': df_wind['data'] * 3.6 # Convert m/s to km/h
    })
    
    # --- Calculate Daily Aggregates for Likelihoods ---
    daily_aggregates = df.set_index('time').resample('1D').agg({
        'Tair': ['max', 'min'], # Daily Max/Min Temp (C)
        'Wind': 'max', # Daily Max Wind (km/h)
        'Rainf': 'sum' # Daily Total Precipitation (mm)
    }).dropna() # Drop days with incomplete data
    
    if daily_aggregates.empty:
        raise Exception("No complete daily data available for the selected period. Ensure the start/end date range is not too small or far in the future/past.")

    # Use the first row's data for the prediction, as the UI is focused on a single prediction point.
    first_day_data = daily_aggregates.iloc[0]
    
    real_weather_params = {
        # Tair max (C)
        "tempMax": round(first_day_data[('Tair', 'max')], 1),
        # Tair min (C)
        "tempMin": round(first_day_data[('Tair', 'min')], 1),
        # Wind max (km/h)
        "windMax": round(first_day_data[('Wind', 'max')], 1),
        # Rainf sum (mm)
        "precipitationSum": round(first_day_data[('Rainf', 'sum')], 1),
        # Placeholder for humidity (set to a neutral average, as real calculation is complex)
        "avgHumidity": 70.0 
    }
    
    print(f"Real Weather Parameters (Day 1): {real_weather_params}")

    # --- Plot Generation (using the full period) ---
    daily_precip = df[['time', 'Rainf']].groupby(pd.Grouper(key='time', freq='1D')).sum().reset_index()
    daily_soil = df[['time', 'SoilM_0_100cm']].groupby(pd.Grouper(key='time', freq='1D')).mean().reset_index()

    fig, (ax1, ax2) = plt.subplots(2, figsize=(21, 8), sharex=True)

    ax1.plot(daily_precip["time"], daily_precip["Rainf"], color="blue")
    ax1.set_ylim(-2, daily_precip["Rainf"].max() * 1.1 if daily_precip["Rainf"].max() > 0 else 10) # Dynamic Y-limit
    ax1.legend(["Rainf"])
    ax1.set_ylabel("Daily Precipitation (mm)")

    ax2.fill_between(daily_soil["time"], daily_soil["SoilM_0_100cm"].min() * 0.9, daily_soil["SoilM_0_100cm"], color="green", alpha=0.25) # Use min for better visualization
    ax2.set_ylim(daily_soil["SoilM_0_100cm"].min() * 0.95, daily_soil["SoilM_0_100cm"].max() * 1.05) # Dynamic Y-limit
    ax2.legend(["SoilM_0_100cm"])
    ax2.set_ylabel("Mean Top 0-100cm Soil Moisture Content (mm)")
    ax2.set_xlabel("Date")
    
    fig.suptitle(f"NLDAS-2 Daily Total Rainf and Daily Mean SoilM_0_100cm ({latitude}, {longitude}) from {nasa_start_date[:10]} - {nasa_end_date[:10]}", size=15)
    
    # 2f. Save Plot to in-memory buffer and encode it
    buf = io.BytesIO()
    plt.savefig(buf, format='png')
    plt.close(fig) # Close the figure to free up memory
    
    # Encode the image bytes to base64
    plot_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    print("Plot generated and Base64 encoded.")
    
    # --- STEP 3: Return success status, plot data, and real weather parameters ---
    # Return the Base64 string and the weather parameters in the response
    return {
        "status": "success", 
        "message": "NASA data fetched, likelihood parameters calculated, and plot encoded.",
        "plotBase64": plot_base64,
        "realWeatherParams": real_weather_params # NEW: Return the real data
    }
    
# Updated route to match the URL assumed in the JavaScript file: /api/app.py
@app.route('/api/app', methods=['POST'])
def handle_script_call():
    """
    Handles the POST request from the JavaScript frontend and extracts all parameters.
    """
    # 1. Get the JSON payload sent by the JavaScript fetch
    data = request.get_json()

    # 2. Extract ALL required parameters (using JavaScript's camelCase keys)
    start_date = data.get('startDate') 
    end_date = data.get('endDate') 
    latitude = data.get('latitude')
    longitude = data.get('longitude')
    weather_data = data.get('weatherData')
    discomfort_threshold = data.get('discomfortThreshold')
    discomfort_option = data.get('discomfortOption')
    
    # Simple validation for the core required fields
    if not all([start_date, end_date, latitude, longitude]):
        missing_fields = []
        if not start_date: missing_fields.append('startDate')
        if not end_date: missing_fields.append('endDate')
        if latitude is None: missing_fields.append('latitude')
        if longitude is None: missing_fields.append('longitude')
        
        # Return an HTTP 400 Bad Request error if inputs are missing
        return jsonify({"error": f"Missing one or more required parameters: {', '.join(missing_fields)}"}), 400

    # 3. Call the core Python function with the extracted arguments
    try:
        # Ensure lat/lon and threshold are correctly cast to float
        results = run_data_processing(
            start_date=start_date,
            end_date=end_date,
            latitude=float(latitude),
            longitude=float(longitude),
            weather_data=weather_data,
            discomfort_threshold=float(discomfort_threshold),
            discomfort_option=discomfort_option
        )
    except Exception as e:
        # Handle errors during the Python execution
        print(f"ERROR: {e}")
        return jsonify({"error": f"Internal server error during script execution: {str(e)}"}), 500

    # 4. Return the results back to the JavaScript frontend (including the plot Base64 data and real params)
    return jsonify(results)

if __name__ == '__main__':
    # Running the app with debug=True is good for development
    app.run()
