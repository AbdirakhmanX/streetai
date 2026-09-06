import json
import os

# Point directly to your streetsense-annotator export JSON
annotator_json = r"C:\Users\abdir\streetsense-annotator\exports\Map_webData\Map_webData.json"

if not os.path.exists(annotator_json):
    print(f"Error: Could not find {annotator_json}. Please check the path.")
    exit(1)

with open(annotator_json, 'r', encoding='utf-8') as f:
    raw_data = json.load(f)

dashboard_data = []
for item in raw_data:
    hazard_type = item.get("hazard", "unknown")
    
    if hazard_type == "pothole":
        ui_type = "pothole"
    elif "trash" in hazard_type or "debris" in hazard_type:
        ui_type = "debris"
    else:
        ui_type = "line_erased"

    img_filename = item.get("image", "") # e.g., "images/frame_007569.jpg"
    image_url = f"/{img_filename}" if img_filename else None

    # Format each label so the map popup can render the polygon bboxes
    formatted_labels = []
    for lbl in item.get("labels", []):
        formatted_labels.append({
            "hazard": lbl.get("hazard", hazard_type),
            "color": lbl.get("color", "#ff3b30"),
            "bbox": lbl.get("bbox", [0, 0, 0, 0]),     # [ymin, xmin, ymax, xmax]
            "polygon": lbl.get("polygon", [])
        })

    dashboard_data.append({
        "id": item["id"],
        "type": ui_type,
        "severity": "medium",
        "description": f"Hazard detected at frame {item['frame']}",
        "lat": item["lat"],
        "lng": item["lon"],
        "ts": "2026-09-05T12:00:00Z",
        "image": image_url,
        "labels": formatted_labels
    })

os.makedirs('src/assets', exist_ok=True)
with open('src/assets/sampleHazards.json', 'w', encoding='utf-8') as f:
    json.dump(dashboard_data, f, indent=2)

print("Generated local sampleHazards.json successfully!")