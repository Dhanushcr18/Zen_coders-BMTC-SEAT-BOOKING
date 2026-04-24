#!/usr/bin/env python3
"""
BMTC Smart Transit — AI Seat Scanner  (standalone)
====================================================
Proper YOLOv8 seat-occupancy detection with:
  • IoU-overlap scoring  (not just centroid)
  • Per-seat confidence accumulation
  • Hysteresis / state smoothing to eliminate flicker
  • Realistic BMTC 2×2 seat layout with centre aisle
  • Occupancy bar & per-seat label overlay
  • Periodic JSON POST to backend API

Run modes
---------
  python scanner.py --demo                           # simulated, no camera
  python scanner.py --bus-id KA-01-F-1234 --camera 0
  python scanner.py --bus-id KA-01-F-1234 --video bus.mp4

Setup
-----
  pip install -r requirements.txt
"""

import cv2
import json
import time
import threading
import argparse
import random
import requests
import numpy as np
from datetime import datetime
from collections import deque

# ── Configuration ─────────────────────────────────────────────────────────────
API_ENDPOINT        = "http://localhost:5000/api/seat-update"
POST_INTERVAL_SEC   = 30          # seconds between API POSTs
YOLO_MODEL_PATH     = "yolov8n.pt"
PERSON_CLASS_ID     = 0           # COCO class 0 = person
CONF_THRESHOLD      = 0.40        # minimum detection confidence to count
IOU_THRESHOLD       = 0.15        # minimum IoU overlap to mark seat occupied
HYSTERESIS_FRAMES   = 3           # consecutive frames needed to change state
DETECT_EVERY_N      = 3           # run YOLO only every N frames (speed vs accuracy)

# Bus layout
ROWS    = 9
COL_LABELS = ['A', 'B', 'C', 'D']   # A,B = left of aisle; C,D = right of aisle

# ── Seat ROI builder ────────────────────────────────────────────────────────────────
def build_seat_rois(frame_w: int = 640, frame_h: int = 480) -> dict[str, tuple]:
    """
    Build a realistic 2+aisle+2 seat ROI map.

    Layout (top-view perspective):
        [ A ][ B ] | aisle | [ C ][ D ]   ×9 rows

    Returns
    -------
    dict  { "1A": (x1,y1,x2,y2), ... }   pixel boxes inside the frame
    """
    header_h   = 72     # top header bar reserved for stats overlay
    footer_h   = 20     # bottom bar
    usable_h   = frame_h - header_h - footer_h
    usable_w   = frame_w

    # horizontal split into: col_w | col_w | aisle | col_w | col_w
    aisle_w    = max(18, usable_w // 10)
    col_w      = (usable_w - aisle_w) // 4
    seat_h     = usable_h // ROWS
    margin     = 4   # inner padding per cell

    # x-start for each column
    col_x = [
        0,                          # A
        col_w,                      # B
        col_w * 2 + aisle_w,       # C  (after aisle)
        col_w * 3 + aisle_w,       # D
    ]

    rois = {}
    for row in range(1, ROWS + 1):
        y1 = header_h + (row - 1) * seat_h + margin
        y2 = header_h + row * seat_h - margin
        for ci, col in enumerate(COL_LABELS):
            x1 = col_x[ci] + margin
            x2 = col_x[ci] + col_w - margin
            rois[f"{row}{col}"] = (x1, y1, x2, y2)

    return rois


# ── IoU helper ─────────────────────────────────────────────────────────────────
def iou(box_a: tuple, box_b: tuple) -> float:
    """
    Intersection-over-Union of two (x1,y1,x2,y2) boxes.
    Returns float in [0, 1].
    """
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter   = inter_w * inter_h

    area_a  = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b  = max(0, bx2 - bx1) * max(0, by2 - by1)
    union   = area_a + area_b - inter

    return inter / union if union > 0 else 0.0


# ── Hysteresis state tracker ────────────────────────────────────────────────────
class SeatStateTracker:
    """
    Smooths raw per-frame detections using a short vote buffer.
    A seat flips state only after HYSTERESIS_FRAMES consecutive
    matching raw detections, preventing flickering.
    """

    def __init__(self, seat_ids: list[str], window: int = HYSTERESIS_FRAMES):
        self.window   = window
        self._buffers = {sid: deque([False] * window, maxlen=window) for sid in seat_ids}
        self._state   = {sid: "free" for sid in seat_ids}

    def update(self, raw: dict[str, bool]) -> dict[str, str]:
        """
        raw : { seat_id: True|False (currently detected as occupied) }
        Returns smoothed state dict { seat_id: "occupied"|"free" }
        """
        for sid, occupied in raw.items():
            self._buffers[sid].append(occupied)
            votes = sum(self._buffers[sid])
            if votes >= self.window:
                self._state[sid] = "occupied"
            elif votes == 0:
                self._state[sid] = "free"
            # else keep previous state (hysteresis)
        return dict(self._state)

    @property
    def state(self) -> dict[str, str]:
        return dict(self._state)


# ── YOLO detection ─────────────────────────────────────────────────────────────
def detect_occupancy_yolo(frame: np.ndarray, model, rois: dict) -> dict[str, bool]:
    """
    Run YOLOv8 on frame.  For each seat ROI, compute the IoU with every
    detected person bounding box.  Seat is considered 'raw occupied' if
    max(IoU) >= IOU_THRESHOLD  OR  person centroid is inside the ROI.

    Returns
    -------
    dict  { seat_id: bool }   (True = raw occupied this frame)
    """
    results = model(frame, verbose=False, classes=[PERSON_CLASS_ID])[0]
    raw     = {sid: False for sid in rois}

    detections = []   # list of (x1,y1,x2,y2,conf)
    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < CONF_THRESHOLD:
            continue
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        detections.append((x1, y1, x2, y2, conf))

    for sid, roi in rois.items():
        for det in detections:
            dx1, dy1, dx2, dy2, _ = det
            det_box = (dx1, dy1, dx2, dy2)

            # Method 1: IoU overlap between detection and seat ROI
            overlap = iou(roi, det_box)

            # Method 2: centroid inside seat ROI
            cx = (dx1 + dx2) / 2
            cy = (dy1 + dy2) / 2
            sx1, sy1, sx2, sy2 = roi
            centroid_inside = sx1 <= cx <= sx2 and sy1 <= cy <= sy2

            if overlap >= IOU_THRESHOLD or centroid_inside:
                raw[sid] = True
                break   # one hit is enough for this seat

    return raw


# ── Demo mode ──────────────────────────────────────────────────────────────────
def detect_occupancy_demo(rois: dict) -> dict[str, bool]:
    """Simulate ~55% occupancy for demo / no-camera mode."""
    seats  = list(rois.keys())
    n_occ  = random.randint(len(seats) // 5, int(len(seats) * 0.75))
    picked = set(random.sample(seats, n_occ))
    return {s: s in picked for s in seats}


# ── Frame rendering ────────────────────────────────────────────────────────────
GOLD  = (76,  168, 201)   # BGR
GREEN = (100, 210, 100)
RED   = (60,   60, 180)
WHITE = (255, 255, 255)
DARK  = (18,   18,  26)

def draw_overlay(frame: np.ndarray, rois: dict,
                 status: dict, bus_id: str, mode: str,
                 fps: float = 0) -> np.ndarray:
    """Render seat boxes, stats header, occupancy bar on frame."""
    h, w = frame.shape[:2]

    # ── Header bar ────────────────────────────────────────────────────────────
    cv2.rectangle(frame, (0, 0), (w, 68), DARK, -1)

    total    = len(status)
    occupied = sum(1 for v in status.values() if v == "occupied")
    free     = total - occupied
    pct      = round(occupied / total * 100) if total else 0

    cv2.putText(frame, "BMTC AI Scanner", (10, 26),
                cv2.FONT_HERSHEY_SIMPLEX, 0.72, GOLD, 2)
    cv2.putText(frame, f"Bus: {bus_id}  [{mode}]", (10, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (180, 180, 210), 1)

    stat_str = f"Occupied: {occupied}  Free: {free}  Load: {pct}%"
    cv2.putText(frame, stat_str, (w // 2 - 130, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, WHITE, 1)

    if fps > 0:
        cv2.putText(frame, f"FPS: {fps:.1f}", (w - 80, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, GOLD, 1)
    cv2.putText(frame, datetime.now().strftime("%H:%M:%S"), (w - 80, 52),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (140, 140, 170), 1)

    # ── Aisle label ───────────────────────────────────────────────────────────
    # Find aisle gap between B and C column
    sample_b = rois.get("1B")
    sample_c = rois.get("1C")
    if sample_b and sample_c:
        ax = (sample_b[2] + sample_c[0]) // 2
        cv2.line(frame, (ax, 68), (ax, h - 18), (50, 50, 70), 2)
        cv2.putText(frame, "AISLE", (ax - 22, 68 + 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, (80, 80, 110), 1)

    # ── Seat boxes ────────────────────────────────────────────────────────────
    for sid, (x1, y1, x2, y2) in rois.items():
        st    = status.get(sid, "free")
        color = RED if st == "occupied" else GREEN

        # semi-transparent fill
        overlay = frame.copy()
        fill_c  = (50, 50, 160) if st == "occupied" else (30, 80, 30)
        cv2.rectangle(overlay, (x1 + 1, y1 + 1), (x2 - 1, y2 - 1), fill_c, -1)
        cv2.addWeighted(overlay, 0.28, frame, 0.72, 0, frame)

        # border
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # label
        cv2.putText(frame, sid, (x1 + 3, y1 + 13),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.28, WHITE, 1)

    # ── Occupancy bar ─────────────────────────────────────────────────────────
    bx, by, bw, bh = 10, h - 14, w - 20, 8
    cv2.rectangle(frame, (bx, by), (bx + bw, by + bh), (30, 30, 45), -1)
    fill_w    = int(bw * occupied / total) if total else 0
    bar_color = RED if pct > 80 else GOLD if pct > 55 else GREEN
    cv2.rectangle(frame, (bx, by), (bx + fill_w, by + bh), bar_color, -1)
    cv2.putText(frame, f"{pct}%", (bx + fill_w + 4, by + 7),
                cv2.FONT_HERSHEY_SIMPLEX, 0.3, (180, 180, 180), 1)

    return frame


# ── API poster ─────────────────────────────────────────────────────────────────
def post_seat_data(bus_id: str, status: dict[str, str]):
    """POST a JSON seat-occupancy payload to the backend API."""
    total    = len(status)
    occupied = sum(1 for v in status.values() if v == "occupied")
    payload  = {
        "bus_id":    bus_id,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "seats":     status,
        "summary": {
            "total":    total,
            "occupied": occupied,
            "free":     total - occupied,
            "pct":      round(occupied / total * 100, 1) if total else 0,
        },
    }
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"\n[{ts}] Posting seat data for {bus_id}")
    print(json.dumps(payload["summary"], indent=2))

    try:
        r = requests.post(API_ENDPOINT, json=payload,
                          headers={"Content-Type": "application/json"}, timeout=10)
        print(f"  → API {r.status_code}")
    except requests.exceptions.ConnectionError:
        print("  → API not reachable (standalone mode).")
    except Exception as ex:
        print(f"  → API error: {ex}")

    return payload


# ── Periodic poster thread ─────────────────────────────────────────────────────
class PeriodicPoster(threading.Thread):
    def __init__(self, bus_id: str, get_status_fn):
        super().__init__(daemon=True)
        self.bus_id       = bus_id
        self.get_status   = get_status_fn
        self._stop        = threading.Event()

    def run(self):
        while not self._stop.is_set():
            s = self.get_status()
            if s:
                post_seat_data(self.bus_id, s)
            self._stop.wait(POST_INTERVAL_SEC)

    def stop(self):
        self._stop.set()


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="BMTC AI Seat Scanner")
    parser.add_argument("--bus-id",  default="KA-01-F-1234",
                        help="Bus registration number")
    parser.add_argument("--camera",  type=int, default=0,
                        help="Camera index (0 = default webcam)")
    parser.add_argument("--video",   help="Path to video file (overrides camera)")
    parser.add_argument("--demo",    action="store_true",
                        help="Simulated demo mode — no camera needed")
    args = parser.parse_args()

    rois    = build_seat_rois()
    tracker = SeatStateTracker(list(rois.keys()))
    current_status: dict[str, str] = {}

    # ── DEMO mode ──────────────────────────────────────────────────────────────
    if args.demo:
        print("=" * 60)
        print("  BMTC AI Scanner  —  DEMO MODE")
        print("=" * 60)
        print(f"  Bus   : {args.bus_id}")
        print(f"  Seats : {len(rois)}")
        print(f"  Post  : every {POST_INTERVAL_SEC}s\n")

        poster = PeriodicPoster(args.bus_id, lambda: current_status)
        poster.start()
        try:
            tick = 0
            while True:
                raw            = detect_occupancy_demo(rois)
                current_status = tracker.update(raw)
                occ = sum(1 for v in current_status.values() if v == "occupied")
                print(f"\r  [Tick {tick:04d}]  Occupied: {occ}/{len(rois)}", end="", flush=True)
                tick += 1
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n  Demo stopped.")
            poster.stop()
        return

    # ── Load YOLO model ────────────────────────────────────────────────────────
    try:
        from ultralytics import YOLO
        model = YOLO(YOLO_MODEL_PATH)
        print(f"[Scanner] YOLO loaded: {YOLO_MODEL_PATH}")
    except ImportError:
        print("[Scanner] ERROR: 'ultralytics' not installed.\n"
              "          Run: pip install ultralytics")
        return

    # ── Open video source ──────────────────────────────────────────────────────
    source = args.video if args.video else args.camera
    cap    = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[Scanner] ERROR: Cannot open source: {source}")
        return

    fw   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    rois = build_seat_rois(fw, fh)
    tracker = SeatStateTracker(list(rois.keys()))
    mode_label = f"VIDEO {source}" if args.video else f"CAM {args.camera}"

    poster = PeriodicPoster(args.bus_id, lambda: current_status)
    poster.start()

    print(f"[Scanner] Bus {args.bus_id}  |  {len(rois)} seats  "
          f"|  source: {source}  |  post every {POST_INTERVAL_SEC}s")
    print("[Scanner] Press 'q' to quit.\n")

    frame_idx  = 0
    fps_ts     = time.time()
    fps_val    = 0.0
    raw_latest = {sid: False for sid in rois}

    while True:
        ret, frame = cap.read()
        if not ret:
            if args.video:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)   # loop video
                time.sleep(0.05)
                continue
            break

        frame_idx += 1

        # Only run YOLO every N frames
        if frame_idx % DETECT_EVERY_N == 0:
            raw_latest = detect_occupancy_yolo(frame, model, rois)

        smoothed       = tracker.update(raw_latest)
        current_status = smoothed

        # FPS calculation
        now     = time.time()
        elapsed = now - fps_ts
        if elapsed >= 1.0:
            fps_val = round(frame_idx / elapsed if elapsed > 0 else 0, 1)
            # reset counter every second
            fps_ts    = now
            frame_idx = 0

        vis = draw_overlay(frame.copy(), rois, smoothed,
                           args.bus_id, mode_label, fps_val)
        cv2.imshow("BMTC AI Seat Scanner", vis)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    poster.stop()
    print("[Scanner] Stopped.")


if __name__ == "__main__":
    main()
