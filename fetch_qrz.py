import os
import requests
import urllib.parse

# 1. Grab the API key from GitHub Secrets
API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    with open("logbook.txt", "w") as f:
        f.write("ERROR: QRZ_API_KEY secret is not configured in GitHub.")
    exit(1)

URL = "https://logbook.qrz.com/api"
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/1.0"}

print("Extracting records from QRZ via FETCH call...")

# 2. Pass the authorization key and pull all records
fetch_payload = {
    "KEY": API_KEY, 
    "ACTION": "FETCH",
    "OPTION": "ALL"
}

try:
    response = requests.post(URL, data=fetch_payload, headers=HEADERS)
    
    if response.status_code != 200:
        with open("logbook.txt", "w") as f:
            f.write(f"HTTP Connection Error: {response.status_code}")
        exit(1)

    # 3. Parse the key-value string pairs separated by ampersands
    parsed_response = urllib.parse.parse_qs(response.text)
    
    # Extract structural return tokens safely
    result = parsed_response.get("RESULT", [""])[0]
    log_data = parsed_response.get("DATA", [""])[0]  # QRZ nests the file payload inside DATA=
    reason = parsed_response.get("REASON", [""])[0]

    if result == "OK" and log_data:
        # Save the isolated raw ADIF records straight to the local file
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(log_data.strip())
        print(f"Success! Saved logbook details to file ({len(log_data)} characters parsed).")
        
    elif result == "FAIL" or result == "AUTH":
        with open("logbook.txt", "w") as f:
            f.write(f"QRZ API Error: {reason}")
        print(f"Server rejected request: {reason}")
        
    else:
        # Fallback dump to help diagnose formatting variations
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"Unexpected data envelope format.\nRaw Data:\n{response.text}")
        print("Data parsing complete via fallback route.")

except Exception as e:
    with open("logbook.txt", "w") as f:
        f.write(f"Python script execution fault: {str(e)}")
    print(f"Execution tracking anomaly: {e}")
