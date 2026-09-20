import os
import xml.etree.ElementTree as ET
import requests

# 1. Grab the API key from GitHub Secrets
API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    print("Error: QRZ_API_KEY secret not found.")
    exit(1)

URL = "https://qrz.com"

# 2. Authenticate and get a temporary Session Key (KEY)
payload = {"KEY": API_KEY, "ACTION": "STATUS"}
response = requests.post(URL, data=payload)

if response.status_code != 200:
    print(f"Failed to connect to QRZ: {response.status_code}")
    exit(1)

# QRZ returns XML responses
try:
    root = ET.fromstring(response.text)
    # Search for the temporary session key
    session_key = root.find(".//KEY").text if root.find(".//KEY") is not None else None
    
    if not session_key:
        print("Could not retrieve session key. Check your QRZ API Key.")
        print("QRZ Response:", response.text)
        exit(1)
        
    # 3. Fetch the log data (Using FETCH to get ADIF data)
    # Note: QRZ XML logbook API primarily outputs ADIF data wrapped inside an XML payload
    fetch_payload = {"KEY": session_key, "ACTION": "FETCH"}
    fetch_response = requests.post(URL, data=fetch_payload)
    
    fetch_root = ET.fromstring(fetch_response.text)
    adif_data = fetch_root.find(".//ADIF").text if fetch_root.find(".//ADIF") is not None else ""
    
    if adif_data:
        # Save the raw ADIF string into a file your website can read
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(adif_data.strip())
        print("Logbook successfully updated and saved to logbook.txt!")
    else:
        print("No logbook data returned or error in fetching.")
        print("QRZ Response:", fetch_response.text)

except ET.ParseError:
    print("Failed to parse QRZ XML response.")
