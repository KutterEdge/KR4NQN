import os
import xml.etree.ElementTree as ET
import requests

# 1. Grab the API key from GitHub Secrets
API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    print("Error: QRZ_API_KEY secret not found.")
    exit(1)

URL = "https://logbook.qrz.com/api"
# QRZ requires a recognizable user agent string
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/1.0"}

print("Authenticating with QRZ...")
# 2. Authenticate and get a temporary Session Key
payload = {"KEY": API_KEY, "ACTION": "STATUS"}
response = requests.post(URL, data=payload, headers=HEADERS)

if response.status_code != 200:
    print(f"Failed to connect to QRZ: {response.status_code}")
    exit(1)

try:
    root = ET.fromstring(response.text)
    
    # Check if QRZ rejected the API key
    result_node = root.find(".//RESULT")
    if result_node is not None and result_node.text != "OK":
        error_msg = root.find(".//REASON").text if root.find(".//REASON") is not None else "Unknown auth error"
        with open("logbook.txt", "w") as f:
            f.write(f"QRZ API Error: {result_node.text} - {error_msg}")
        print(f"QRZ rejected request: {result_node.text} - {error_msg}")
        exit(0)

    session_key = root.find(".//KEY").text if root.find(".//KEY") is not None else None
    
    if not session_key:
        print("Could not retrieve session key.")
        exit(1)
        
    print("Session key acquired. Fetching entire logbook records...")
    
    # 3. Explicitly ask for ALL logs using the proper parameters
    fetch_payload = {
        "KEY": session_key, 
        "ACTION": "FETCH",
        "OPTION": "ALL"  # Explicitly tells QRZ to extract your actual logs
    }
    
    fetch_response = requests.post(URL, data=fetch_payload, headers=HEADERS)
    fetch_root = ET.fromstring(fetch_response.text)
    
    # Extract the raw ADIF string
    adif_node = fetch_root.find(".//ADIF")
    adif_data = adif_node.text if adif_node is not None else ""
    
    if adif_data and adif_data.strip():
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(adif_data.strip())
        print(f"Logbook successfully updated! Saved {len(adif_data)} characters of data.")
    else:
        # If it's still blank, write the raw XML response into the file to debug it
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"Debug Info: No logs returned.\nRaw Response:\n{fetch_response.text}")
        print("No logbook data returned. Wrote raw XML to logbook.txt for inspection.")

except ET.ParseError:
    print("Failed to parse QRZ XML response.")
