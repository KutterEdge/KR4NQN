import os
import requests
import urllib.parse

# 1. Grab the API key from GitHub Secrets
API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    with open("logbook.txt", "w") as f:
        f.write("ERROR: QRZ_API_KEY secret is not configured in GitHub.")
    exit(1)

URL = "https://qrz.com"
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/1.0"}

print("Fetching logbook data from QRZ...")

# 2. Use your API key directly to FETCH data
fetch_payload = {
    "KEY": API_KEY, 
    "ACTION": "FETCH",
    "OPTION": "ALL"
}

try:
    response = requests.post(URL, data=fetch_payload, headers=HEADERS)
    
    if response.status_code != 200:
        with open("logbook.txt", "w") as f:
            f.write(f"HTTP Error from QRZ: {response.status_code}")
        exit(1)

    # 3. Parse the URL-encoded response string
    parsed_response = urllib.parse.parse_qs(response.text)
    
    # Extract values safely (parse_qs wraps values in lists)
    result = parsed_response.get("RESULT", [""])[0]
    adif_data = parsed_response.get("ADIF", [""])[0]
    reason = parsed_response.get("REASON", [""])[0]

    if result == "OK" and adif_data:
        # Save the clean ADIF data to logbook.txt
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(adif_data.strip())
        print(f"Success! Logbook updated with {len(adif_data)} characters.")
        
    elif result == "FAIL":
        with open("logbook.txt", "w") as f:
            f.write(f"QRZ API Error: {reason}")
        print(f"QRZ Error: {reason}")
        
    else:
        # Fallback debug in case the format varies
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"Unexpected Response Format.\nRaw Output:\n{response.text}")
        print("Unexpected response structure.")

except Exception as e:
    with open("logbook.txt", "w") as f:
        f.write(f"Python script execution failed: {str(e)}")
    print(f"Execution error: {e}")
