import os
import json
import re
import requests
import urllib.parse

API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    with open("logbook.json", "w", encoding="utf-8") as f:
        json.dump({"error": "QRZ_API_KEY secret is not configured."}, f)
    with open("logbook.txt", "w", encoding="utf-8") as f:
        f.write("ERROR: QRZ_API_KEY secret is not configured in GitHub.")
    exit(1)

URL = "https://logbook.qrz.com/api"
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/2.0"}

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
        with open("logbook.json", "w", encoding="utf-8") as f:
            json.dump({"error": f"HTTP Connection Error: {response.status_code}"}, f)
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"HTTP Connection Error: {response.status_code}")
        exit(1)

    # 3. Parse the key-value string pairs separated by ampersands
    parsed_response = urllib.parse.parse_qs(response.text)
    
    # Extract structural return tokens safely
    result = parsed_response.get("RESULT", [""])[0]
    log_data = parsed_response.get("DATA", [""])[0]  # QRZ nests the file payload inside DATA=
    reason = parsed_response.get("REASON", [""])[0]

    if result == "OK" and log_data:
        # Save the isolated raw ADIF records straight to the local file for debugging/fallback
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(log_data.strip())

        # 2. Simple, robust Python parsing to produce JSON for the frontend
        records = log_data.split("<eor>")
        if len(records) <= 1:
            records = log_data.split("<EOR>")
            
        qso_list = []
        
        for record in records:
            if not record.strip():
                continue
                
            # Helper function to grab fields via regex (safe start position calculation)
            def get_tag(tag_name):
                match = re.search(rf"<{tag_name}:(\d+)(:[a-zA-Z])?>", record, re.IGNORECASE)
                if match:
                    length = int(match.group(1))
                    start = match.end()
                    val = record[start:start+length].strip()
                    return val if val else "—"
                return "—"

            callsign = get_tag("call")
            if callsign == "—":
                continue  # Skip metadata rows
                
            # Format Date nicely (YYYYMMDD to YYYY-MM-DD)
            raw_date = get_tag("qso_date")
            date_str = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if len(raw_date) == 8 else "—"
            
            # Format Time nicely (HHMM to HH:MM)
            raw_time = get_tag("time_on")
            time_str = f"{raw_time[:2]}:{raw_time[2:4]}" if len(raw_time) >= 4 else ""

            freq_val = get_tag("freq")
            band_val = get_tag("band")

            qso_list.append({
                "datetime": f"{date_str} {time_str}".strip(),
                "callsign": callsign.upper(),
                "band": band_val.upper() if band_val != "—" else (freq_val or "—"),
                "freq": f'{freq_val} MHz' if freq_val != "—" and freq_val else "—",
                "mode": get_tag("mode").upper(),
                "rst_sent": get_tag("rst_sent"),
                "rst_rcvd": get_tag("rst_rcvd")
            })

        # 3. Sort newest contacts first and save directly as logbook.json
        qso_list.sort(key=lambda x: x["datetime"], reverse=True)
        
        with open("logbook.json", "w", encoding="utf-8") as f:
            json.dump(qso_list, f, indent=2)
            
        print(f"Successfully processed and generated logbook.json with {len(qso_list)} entries.")
        
    elif result == "FAIL" or result == "AUTH":
        with open("logbook.json", "w", encoding="utf-8") as f:
            json.dump({"error": f"QRZ API Error: {reason}"}, f)
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"QRZ API Error: {reason}")
        print(f"Server rejected request: {reason}")
        
    else:
        # Fallback dump to help diagnose formatting variations
        with open("logbook.json", "w", encoding="utf-8") as f:
            json.dump({"error": "Unexpected data envelope format."}, f)
        with open("logbook.txt", "w", encoding="utf-8") as f:
            f.write(f"Unexpected data envelope format.\nRaw Data:\n{response.text}")
        print("Data parsing complete via fallback route.")

except Exception as e:
    with open("logbook.json", "w", encoding="utf-8") as f:
        json.dump({"error": f"Script failed: {str(e)}"}, f)
    with open("logbook.txt", "w", encoding="utf-8") as f:
        f.write(f"Python script execution fault: {str(e)}")
    print(f"Execution tracking anomaly: {e}")
