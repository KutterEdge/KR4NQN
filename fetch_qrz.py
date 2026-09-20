import os
import json
import re
import requests
import urllib.parse

API_KEY = os.environ.get("QRZ_API_KEY")
if not API_KEY:
    with open("logbook.json", "w") as f:
        json.dump({"error": "QRZ_API_KEY secret is not configured."}, f)
    exit(1)

URL = "https://qrz.com"
HEADERS = {"User-Agent": "GitHubPagesLogbookWidget/2.0"}

try:
    # 1. Fetch data from QRZ
    fetch_payload = {"KEY": API_KEY, "ACTION": "FETCH", "OPTION": "ALL"}
    response = requests.post(URL, data=fetch_payload, headers=HEADERS)
    
    parsed_response = urllib.parse.parse_qs(response.text)
    result = parsed_response.get("RESULT", [""])[0]
    log_data = parsed_response.get("DATA", [""])[0]
    reason = parsed_response.get("REASON", [""])[0]

    if result == "OK" and log_data:
        # 2. Simple, bulletproof Python parsing
        records = log_data.split("<eor>")
        if len(records) <= 1:
            records = log_data.split("<EOR>")
            
        qso_list = []
        
        for record in records:
            if not record.strip():
                continue
                
            # Helper function to grab fields via regex
            def get_tag(tag_name):
                match = re.search(rf"<{tag_name}:(\d+)>([^<]*)", record, re.IGNORECASE)
                if match:
                    length = int(match.group(1))
                    val = match.group(2)[:length].strip()
                    return val
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

            qso_list.append({
                "datetime": f"{date_str} {time_str}".strip(),
                "callsign": callsign.upper(),
                "band": get_tag("band").upper(),
                "freq": f'{get_tag("freq")} MHz' if get_tag("freq") != "—" else "—",
                "mode": get_tag("mode").upper(),
                "rst_sent": get_tag("rst_sent"),
                "rst_rcvd": get_tag("rst_rcvd")
            })

        # 3. Sort newest contacts first and save directly as logbook.json
        qso_list.sort(key=lambda x: x["datetime"], reverse=True)
        
        with open("logbook.json", "w", encoding="utf-8") as f:
            json.dump(qso_list, f, indent=2)
            
        print(f"Successfully processed and generated logbook.json with {len(qso_list)} entries.")
        
    else:
        with open("logbook.json", "w") as f:
            json.dump({"error": f"QRZ rejected request: {reason or result}"}, f)

except Exception as e:
    with open("logbook.json", "w") as f:
        json.dump({"error": f"Script failed: {str(e)}"}, f)
