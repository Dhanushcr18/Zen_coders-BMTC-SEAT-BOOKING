#!/usr/bin/env python3
"""
BMTC Smart Transit — AI Seat Scanner  (Flask web app)
======================================================
Features
--------
• MJPEG live stream  (/video_feed)     with seat ROI overlays
• Server-Sent Events (/events)         real-time stats push to browser
• REST  GET /stats                     current occupancy snapshot
• REST  POST /switch_camera            switch to camera index
• REST  POST /switch_demo              switch to demo mode
• REST  POST /upload_video             upload & scan a video file
• REST  GET  /snapshot                 save & download annotated JPEG
• REST  GET  /export                   download occupancy CSV
• REST  GET  /buses                    fleet list from json-server
• Proper IoU-based YOLO detection      (via shared scanner module logic)
• Hysteresis smoothing                 (eliminates seat-status flicker)
• Per-seat confidence tracking         (displayed in /stats)
• Syncs to json-server DB              (localhost:3001)

Run
---
  python app.py --demo                    # no camera, simulated
  python app.py --bus-id KA-01-F-1234     # real camera 0
  python app.py --bus-id KA-01-F-1234 --video bus.mp4

Open: http://localhost:5050
"""

import cv2
import json
import time
import random
import argparse
import threading
import requests
import os
import uuid
import csv
import io
from datetime import datetime
from collections import deque

import numpy as np
from flask import Flask, Response, render_template, jsonify, request, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# ── Config ────────────────────────────────────────────────────────────────────
DB_API        = "http://localhost:3001"
POST_INTERVAL = 15                      # seconds between DB syncs
YOLO_MODEL    = "yolov8n.pt"
PERSON_CLS    = 0                       # COCO class 0 = person
CONF_THRESH   = 0.40
IOU_THRESH    = 0.15                    # min IoU to mark seat occupied
HYST_FRAMES   = 3                       # hysteresis window
DETECT_N      = 3                       # run YOLO every N frames
ROWS          = 9
COL_LABELS    = ['A', 'B', 'C', 'D']
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
SNAPSHOT_FOLDER = os.path.join(os.path.dirname(__file__), "uploads", "snapshots")
ALLOWED_EXT   = {"mp4", "avi", "mov", "mkv", "webm"}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(SNAPSHOT_FOLDER, exist_ok=True)

app = Flask(__name__)
CORS(app)
app.config["UPLOAD_FOLDER"]      = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 500 * 1024 * 1024   # 500 MB

# ── Seat ROI builder ──────────────────────────────────────────────────────────
def build_rois(fw: int = 640, fh: int = 480) -> dict:
    """
    2-left + aisle + 2-right BMTC bus seat layout.
    Returns { "1A": (x1,y1,x2,y2), ... }
    """
    header_h = 72
    footer_h = 20
    usable_h = fh - header_h - footer_h
    aisle_w  = max(18, fw // 10)
    col_w    = (fw - aisle_w) // 4
    seat_h   = usable_h // ROWS
    mg       = 4

    col_x = [
        0,
        col_w,
        col_w * 2 + aisle_w,
        col_w * 3 + aisle_w,
    ]

    rois = {}
    for row in range(1, ROWS + 1):
        y1 = header_h + (row - 1) * seat_h + mg
        y2 = header_h + row * seat_h - mg
        for ci, col in enumerate(COL_LABELS):
            x1 = col_x[ci] + mg
            x2 = col_x[ci] + col_w - mg
            rois[f"{row}{col}"] = (x1, y1, x2, y2)
    return rois


# ── IoU ───────────────────────────────────────────────────────────────────────
def iou(a: tuple, b: tuple) -> float:
    ix1 = max(a[0], b[0]); iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2]); iy2 = min(a[3], b[3])
    iw  = max(0, ix2 - ix1); ih = max(0, iy2 - iy1)
    inter = iw * ih
    area_a = max(0, a[2]-a[0]) * max(0, a[3]-a[1])
    area_b = max(0, b[2]-b[0]) * max(0, b[3]-b[1])
    union  = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


# ── Hysteresis tracker ────────────────────────────────────────────────────────
class SeatStateTracker:
    def __init__(self, seat_ids: list, window: int = HYST_FRAMES):
        self.window   = window
        self._bufs    = {s: deque([False] * window, maxlen=window) for s in seat_ids}
        self._state   = {s: "free" for s in seat_ids}
        self._confs   = {s: 0.0 for s in seat_ids}

    def update(self, raw: dict, confs: dict = None) -> dict:
        """raw: {seat_id: bool}  →  smoothed {seat_id: "occupied"|"free"}"""
        for sid, occ in raw.items():
            self._bufs[sid].append(occ)
            votes = sum(self._bufs[sid])
            if votes >= self.window:
                self._state[sid] = "occupied"
            elif votes == 0:
                self._state[sid] = "free"
            if confs:
                self._confs[sid] = confs.get(sid, 0.0)
        return dict(self._state)

    @property
    def state(self) -> dict:
        return dict(self._state)

    @property
    def confidences(self) -> dict:
        return dict(self._confs)


# ── YOLO detection ────────────────────────────────────────────────────────────
def detect_yolo(frame: np.ndarray, rois: dict, model) -> tuple[dict, dict]:
    """
    Run YOLOv8.  Returns (raw_occupancy, confidence_map).
    raw_occupancy : { seat_id: bool }
    confidence_map: { seat_id: float }  best detection conf per seat
    """
    results = model(frame, verbose=False, classes=[PERSON_CLS])[0]
    raw   = {sid: False for sid in rois}
    confs = {sid: 0.0   for sid in rois}

    detections = []
    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < CONF_THRESH:
            continue
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        detections.append((x1, y1, x2, y2, conf))

    for sid, roi in rois.items():
        best_conf = 0.0
        for det in detections:
            dx1, dy1, dx2, dy2, dconf = det
            overlap = iou(roi, (dx1, dy1, dx2, dy2))
            cx = (dx1 + dx2) / 2
            cy = (dy1 + dy2) / 2
            sx1, sy1, sx2, sy2 = roi
            inside = sx1 <= cx <= sx2 and sy1 <= cy <= sy2
            if overlap >= IOU_THRESH or inside:
                raw[sid]   = True
                best_conf  = max(best_conf, dconf)
                break
        confs[sid] = best_conf

    return raw, confs


def detect_demo(rois: dict) -> tuple[dict, dict]:
    seats = list(rois.keys())
    n     = random.randint(len(seats) // 5, int(len(seats) * 0.75))
    occ   = set(random.sample(seats, n))
    raw   = {s: s in occ for s in seats}
    confs = {s: round(random.uniform(0.55, 0.95), 2) if raw[s] else 0.0 for s in seats}
    return raw, confs


# ── Frame rendering ───────────────────────────────────────────────────────────
GOLD  = (76,  168, 201)
GREEN = (100, 210, 100)
RED   = (60,   60, 180)
WHITE = (255, 255, 255)
DARK  = (18,   18,  26)

def render_frame(frame: np.ndarray, rois: dict, status: dict,
                 confs: dict, bus_id: str, mode: str, fps: float = 0) -> np.ndarray:
    h, w = frame.shape[:2]

    # header
    cv2.rectangle(frame, (0, 0), (w, 68), DARK, -1)
    total    = len(status)
    occupied = sum(1 for v in status.values() if v == "occupied")
    free     = total - occupied
    pct      = round(occupied / total * 100) if total else 0

    cv2.putText(frame, "BMTC AI Scanner", (10, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.72, GOLD, 2)
    cv2.putText(frame, f"Bus: {bus_id}  [{mode}]", (10, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180, 180, 210), 1)
    cv2.putText(frame, f"Occupied: {occupied}  Free: {free}  Load: {pct}%",
                (w // 2 - 140, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.52, WHITE, 1)
    if fps > 0:
        cv2.putText(frame, f"FPS:{fps:.1f}", (w - 80, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, GOLD, 1)
    cv2.putText(frame, datetime.now().strftime("%H:%M:%S"), (w - 80, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.42, (140, 140, 170), 1)

    # aisle divider
    b_roi = rois.get("1B")
    c_roi = rois.get("1C")
    if b_roi and c_roi:
        ax = (b_roi[2] + c_roi[0]) // 2
        cv2.line(frame, (ax, 68), (ax, h - 18), (50, 50, 70), 2)

    # seat boxes
    for sid, (x1, y1, x2, y2) in rois.items():
        st    = status.get(sid, "free")
        color = RED if st == "occupied" else GREEN
        fill  = (50, 50, 150) if st == "occupied" else (25, 75, 25)

        overlay = frame.copy()
        cv2.rectangle(overlay, (x1+1, y1+1), (x2-1, y2-1), fill, -1)
        cv2.addWeighted(overlay, 0.30, frame, 0.70, 0, frame)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # seat label
        cv2.putText(frame, sid, (x1 + 3, y1 + 13),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.28, WHITE, 1)

        # confidence badge (if occupied)
        c = confs.get(sid, 0.0)
        if st == "occupied" and c > 0:
            cv2.putText(frame, f"{int(c*100)}%", (x1 + 2, y2 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.22, (200, 220, 255), 1)

    # occupancy bar
    bx, by, bw, bh = 10, h - 14, w - 20, 8
    cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), (30, 30, 45), -1)
    fw = int(bw * occupied / total) if total else 0
    bc = RED if pct > 80 else GOLD if pct > 55 else GREEN
    cv2.rectangle(frame, (bx, by), (bx + fw, by + bh), bc, -1)

    return frame


def to_jpeg(frame: np.ndarray) -> bytes:
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return buf.tobytes()


# ── Shared state ──────────────────────────────────────────────────────────────
_lock          = threading.Lock()
_seat_status   : dict = {}    # { seat_id: "occupied"|"free" }
_seat_confs    : dict = {}    # { seat_id: float }
_frame_bytes   = None         # latest JPEG
_last_post     = None
_bus_id        = "KA-01-F-1234"
_demo_mode     = False
_yolo_model    = None
_fps           = 0.0

_source_mode   = "demo"       # "demo"|"camera"|"video"|"upload"
_stop_event    = threading.Event()
_cam_thread    = None


# ── Camera thread ─────────────────────────────────────────────────────────────
def camera_thread(source, bus_id: str, demo: bool, mode_label: str, stop_evt):
    global _seat_status, _seat_confs, _frame_bytes, _fps

    rois    = build_rois()
    tracker = SeatStateTracker(list(rois.keys()))

    raw_latest   = {sid: False for sid in rois}
    confs_latest = {sid: 0.0   for sid in rois}
    frame_idx    = 0
    t0           = time.time()
    last_post_t  = 0

    # ── DEMO mode ──────────────────────────────────────────────────────────────
    if demo:
        while not stop_evt.is_set():
            fw, fh = 800, 520
            canvas = np.full((fh, fw, 3), (22, 22, 30), dtype=np.uint8)
            for gi in range(0, fw, 40):
                cv2.line(canvas, (gi, 0), (gi, fh), (32, 32, 42), 1)
            for gi in range(0, fh, 40):
                cv2.line(canvas, (0, gi), (fw, gi), (32, 32, 42), 1)

            raw, confs = detect_demo(rois)
            smoothed   = tracker.update(raw, confs)

            rendered = render_frame(canvas.copy(), rois, smoothed, confs,
                                    bus_id, "DEMO", 2.0)
            jb = to_jpeg(rendered)

            with _lock:
                _seat_status = smoothed.copy()
                _seat_confs  = confs.copy()
                _frame_bytes = jb

            now = time.time()
            if now - last_post_t >= POST_INTERVAL:
                threading.Thread(target=post_to_db, args=(bus_id, smoothed),
                                 daemon=True).start()
                last_post_t = now

            time.sleep(0.5)
        return

    # ── Live / video mode ──────────────────────────────────────────────────────
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[Scanner] ERROR: cannot open source: {source}")
        err = np.full((480, 640, 3), (20, 20, 35), dtype=np.uint8)
        cv2.putText(err, "Cannot open source", (60, 230),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (60, 60, 180), 2)
        cv2.putText(err, str(source), (60, 270),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (140, 140, 170), 1)
        with _lock:
            _frame_bytes = to_jpeg(err)
        return

    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh_v = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    rois    = build_rois(fw, fh_v)
    tracker = SeatStateTracker(list(rois.keys()))
    raw_latest   = {sid: False for sid in rois}
    confs_latest = {sid: 0.0   for sid in rois}
    frame_idx    = 0
    t0           = time.time()

    while not stop_evt.is_set():
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            time.sleep(0.04)
            continue

        frame_idx += 1

        # Run YOLO every N frames only
        if frame_idx % DETECT_N == 0 and _yolo_model:
            raw_latest, confs_latest = detect_yolo(frame, rois, _yolo_model)

        smoothed = tracker.update(raw_latest, confs_latest)

        # FPS
        elapsed  = time.time() - t0
        fps_val  = frame_idx / elapsed if elapsed > 0 else 0
        if elapsed >= 2.0:
            frame_idx = 0
            t0 = time.time()

        rendered = render_frame(frame.copy(), rois, smoothed, confs_latest,
                                bus_id, mode_label, fps_val)
        jb = to_jpeg(rendered)

        with _lock:
            _seat_status = smoothed.copy()
            _seat_confs  = confs_latest.copy()
            _frame_bytes = jb
            _fps         = round(fps_val, 1)

        now = time.time()
        if now - last_post_t >= POST_INTERVAL:
            threading.Thread(target=post_to_db, args=(bus_id, smoothed),
                             daemon=True).start()
            last_post_t = now

    cap.release()


# ── Source manager ────────────────────────────────────────────────────────────
def start_source(source, demo: bool, mode_label: str):
    global _cam_thread, _stop_event, _source_mode, _demo_mode
    global _frame_bytes, _seat_status, _seat_confs

    _stop_event.set()
    if _cam_thread and _cam_thread.is_alive():
        _cam_thread.join(timeout=4)

    _stop_event   = threading.Event()
    _frame_bytes  = None
    _seat_status  = {}
    _seat_confs   = {}
    _demo_mode    = demo

    _cam_thread = threading.Thread(
        target=camera_thread,
        args=(source, _bus_id, demo, mode_label, _stop_event),
        daemon=True
    )
    _cam_thread.start()
    print(f"[Scanner] -> {mode_label}  source={source}")


# ── DB sync ───────────────────────────────────────────────────────────────────
def post_to_db(bus_id: str, status: dict):
    global _last_post
    occupied = sum(1 for v in status.values() if v == "occupied")
    total    = len(status)
    ts       = datetime.now().strftime("%H:%M:%S")
    try:
        requests.patch(f"{DB_API}/buses/{bus_id}",
                       json={"occupied": occupied, "scanner": "Online", "seatMap": status},
                       timeout=5)
        _last_post = ts
        print(f"[{ts}] DB sync: {bus_id} -> {occupied}/{total}")
    except Exception as e:
        print(f"[{ts}] DB sync failed: {e}")


# ── Flask routes ──────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html', bus_id=_bus_id,
                           demo=_demo_mode, source_mode=_source_mode)


@app.route('/video_feed')
def video_feed():
    def gen():
        while True:
            with _lock:
                data = _frame_bytes
            if data:
                yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + data + b'\r\n')
            time.sleep(0.07)   # ~14 fps ceiling
    return Response(gen(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/stats')
def stats():
    with _lock:
        status = _seat_status.copy()
        confs  = _seat_confs.copy()
        fps    = _fps
    total    = len(status)
    occupied = sum(1 for v in status.values() if v == "occupied")
    free     = total - occupied
    return jsonify({
        "bus_id":    _bus_id,
        "total":     total,
        "occupied":  occupied,
        "free":      free,
        "pct":       round(occupied / total * 100, 1) if total else 0,
        "seats":     status,
        "confs":     confs,
        "fps":       fps,
        "last_sync": _last_post,
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "demo":      _demo_mode,
        "source":    _source_mode,
    })


@app.route('/events')
def events():
    """Server-Sent Events — pushes stats every second."""
    def stream():
        while True:
            with _lock:
                status = _seat_status.copy()
                confs  = _seat_confs.copy()
                fps    = _fps
            total    = len(status)
            occupied = sum(1 for v in status.values() if v == "occupied")
            data = json.dumps({
                "occupied": occupied,
                "free":     total - occupied,
                "total":    total,
                "pct":      round(occupied / total * 100, 1) if total else 0,
                "seats":    status,
                "confs":    confs,
                "fps":      fps,
                "time":     datetime.now().strftime("%H:%M:%S"),
                "source":   _source_mode,
            })
            yield f"data: {data}\n\n"
            time.sleep(1)
    return Response(stream(), mimetype='text/event-stream',
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route('/snapshot')
def snapshot():
    """Capture & return the current annotated frame as a downloadable JPEG."""
    with _lock:
        data = _frame_bytes
    if not data:
        return jsonify({"error": "No frame available"}), 503

    fname = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    path  = os.path.join(SNAPSHOT_FOLDER, fname)
    with open(path, 'wb') as f:
        f.write(data)

    return send_file(path, as_attachment=True, download_name=fname,
                     mimetype='image/jpeg')


@app.route('/export')
def export_csv():
    """Export current seat occupancy as a CSV download."""
    with _lock:
        status = _seat_status.copy()
        confs  = _seat_confs.copy()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Seat", "Status", "Confidence", "Timestamp"])
    ts = datetime.now().isoformat()
    for sid in sorted(status.keys()):
        writer.writerow([sid, status[sid], f"{confs.get(sid, 0):.2f}", ts])

    buf.seek(0)
    fname = f"seats_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(buf.getvalue(), mimetype='text/csv',
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


@app.route('/buses')
def buses():
    try:
        r = requests.get(f"{DB_API}/buses", timeout=5)
        return jsonify(r.json())
    except Exception:
        return jsonify([])


@app.route('/switch_camera', methods=['POST'])
def switch_camera():
    global _source_mode
    data    = request.get_json(force=True)
    cam_idx = int(data.get("camera", 0))
    _source_mode = "camera"
    start_source(cam_idx, False, f"CAM {cam_idx}")
    return jsonify({"ok": True, "mode": "camera", "camera": cam_idx})


@app.route('/switch_demo', methods=['POST'])
def switch_demo():
    global _source_mode
    _source_mode = "demo"
    start_source(0, True, "DEMO")
    return jsonify({"ok": True, "mode": "demo"})


@app.route('/upload_video', methods=['POST'])
def upload_video():
    global _source_mode
    if 'video' not in request.files:
        return jsonify({"error": "No file part"}), 400
    f = request.files['video']
    if not f.filename:
        return jsonify({"error": "No file selected"}), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_EXT:
        return jsonify({"error": f"Unsupported format. Use: {', '.join(ALLOWED_EXT)}"}), 400

    fname = secure_filename(f"{uuid.uuid4().hex}_{f.filename}")
    path  = os.path.join(UPLOAD_FOLDER, fname)
    f.save(path)
    _source_mode = "upload"
    start_source(path, False, "UPLOAD")
    return jsonify({"ok": True, "mode": "upload", "file": f.filename})


@app.route('/source_status')
def source_status():
    return jsonify({"mode": _source_mode, "demo": _demo_mode})


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    global _bus_id, _demo_mode, _yolo_model, _source_mode

    parser = argparse.ArgumentParser(description="BMTC AI Seat Scanner Web App")
    parser.add_argument("--bus-id", default="KA-01-F-1234")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--video",  help="Path to video file")
    parser.add_argument("--demo",   action="store_true")
    parser.add_argument("--port",   type=int, default=5050)
    args = parser.parse_args()

    _bus_id    = args.bus_id
    _demo_mode = args.demo

    if not args.demo:
        try:
            from ultralytics import YOLO
            _yolo_model = YOLO(YOLO_MODEL)
            print(f"[Scanner] YOLO loaded: {YOLO_MODEL}")
        except ImportError:
            print("[Scanner] ultralytics not installed → fallback demo mode")
            _demo_mode = True

    if args.video:
        _source_mode = "video"
        start_source(args.video, _demo_mode, "VIDEO")
    elif _demo_mode:
        _source_mode = "demo"
        start_source(0, True, "DEMO")
    else:
        _source_mode = "camera"
        start_source(args.camera, False, f"CAM {args.camera}")

    print(f"\n{'='*55}")
    print(f"  BMTC AI Seat Scanner  —  {'DEMO' if _demo_mode else 'LIVE'}")
    print(f"  Bus: {_bus_id}  |  Dashboard: http://localhost:{args.port}")
    print(f"{'='*55}\n")

    app.run(host="0.0.0.0", port=args.port, debug=False, threaded=True)


if __name__ == "__main__":
    main()
