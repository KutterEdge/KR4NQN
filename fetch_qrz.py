import os
import requests

# 1. Grab the API key from GitHub Secrets
API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    with open("logbook.txt", "w") as f:
        f.write("ERROR: QRZ_API_KEY secret is not configured in GitHub.")
    print("Error: QRZ_API_KEY secret not found.")
    exit(1)

URL = "https://logbook.qrz.com/api"
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/1.0"}

# 2. Get the status directly
payload = {"KEY": API_KEY, "ACTION": "STATUS"}

try:
    response = requests.post(URL, data=payload, headers=HEADERS)
    
    # CRITICAL TEST: Force it to write the exact server response to logbook.txt
    with open("logbook.txt", "w", encoding="utf-8") as f:
        f.write(f"--- STEP 1: INITIAL QRZ AUTH RESPONSE ---\n")
        f.write(f"HTTP Status Code: {response.status_code}\n\n")
        f.write(response.text)
        
    print(f"Wrote server output to logbook.txt (Length: {len(response.text)})")

except Exception as e:
    with open("logbook.txt", "w") as f:
        f.write(f"Python script execution failed with error: {str(e)}")
    print(f"Execution error: {e}")
