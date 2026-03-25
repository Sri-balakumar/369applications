"""
Face Recognition Attendance - Camera Script
=============================================
Runs on the device with the camera (PC, laptop, Raspberry Pi).
Detects faces, matches against known employees from Odoo, and logs attendance.

Usage:
    pip install -r requirements.txt
    python face_camera.py

Configuration:
    Edit the ODOO_* variables below to match your Odoo server.
    Set CAMERA_SOURCE to 0 for USB/webcam, or an RTSP URL for IP camera.
"""

import base64
import json
import time
import sys

import cv2
import face_recognition
import numpy as np
import requests

# ============================================================
# CONFIGURATION - Edit these values
# ============================================================
ODOO_URL = 'http://localhost:8069'       # Your Odoo server URL
ODOO_DB = 'odooo19'                       # Your Odoo database name
ODOO_USERNAME = 'admin'                   # Odoo username
ODOO_PASSWORD = 'admin'                   # Odoo password
CAMERA_SOURCE = 0                         # 0 = USB/webcam, or RTSP URL string for IP camera
CAMERA_NAME = 'Main Door'                # Name for this camera
CONFIDENCE_THRESHOLD = 0.6               # Lower = stricter match (0.4-0.6 recommended)
COOLDOWN_SECONDS = 300                    # 5 minutes - won't re-log same person within this time
FRAME_SKIP = 3                            # Process every Nth frame (for performance)
# ============================================================


class OdooClient:
    """Simple Odoo JSON-RPC client."""

    def __init__(self, url, db, username, password):
        self.url = url.rstrip('/')
        self.db = db
        self.username = username
        self.password = password
        self.uid = None
        self.session = requests.Session()

    def authenticate(self):
        """Login to Odoo and get session."""
        response = self.session.post(
            f'{self.url}/web/session/authenticate',
            json={
                'jsonrpc': '2.0',
                'params': {
                    'db': self.db,
                    'login': self.username,
                    'password': self.password,
                },
            },
        )
        result = response.json().get('result', {})
        self.uid = result.get('uid')
        if not self.uid:
            raise Exception(f'Odoo login failed: {response.json()}')
        print(f'[Odoo] Logged in as {self.username} (uid={self.uid})')
        return self.uid

    def call(self, route, params):
        """Call Odoo JSON-RPC endpoint."""
        response = self.session.post(
            f'{self.url}{route}',
            json={'jsonrpc': '2.0', 'params': params},
        )
        data = response.json()
        if data.get('error'):
            raise Exception(f'Odoo error: {data["error"]}')
        return data.get('result')

    def get_employees_with_faces(self):
        """Fetch all employees with registered face encodings."""
        return self.call('/face_attendance/employees', {})

    def log_attendance(self, employee_id, confidence, snapshot_base64=None):
        """Log face detection to Odoo."""
        return self.call('/face_attendance/log', {
            'employee_id': employee_id,
            'confidence': round(confidence * 100, 1),
            'snapshot_base64': snapshot_base64,
            'camera_name': CAMERA_NAME,
        })

    def register_face(self, employee_id, encoding_json, image_base64=None):
        """Register face encoding for an employee."""
        return self.call('/face_attendance/register', {
            'employee_id': employee_id,
            'encoding': encoding_json,
            'face_image_base64': image_base64,
        })


def load_known_faces(odoo):
    """Load known face encodings from Odoo."""
    print('[Faces] Loading known faces from Odoo...')
    employees = odoo.get_employees_with_faces()

    known_encodings = []
    known_ids = []
    known_names = []

    for emp in employees:
        try:
            encoding = json.loads(emp['encoding'])
            known_encodings.append(np.array(encoding))
            known_ids.append(emp['id'])
            known_names.append(emp['name'])
        except (json.JSONDecodeError, TypeError):
            print(f'  [!] Invalid encoding for {emp["name"]}, skipping.')

    print(f'[Faces] Loaded {len(known_encodings)} faces.')
    return known_encodings, known_ids, known_names


def frame_to_base64(frame, face_location=None):
    """Convert a frame (or cropped face) to base64 for sending to Odoo."""
    if face_location:
        top, right, bottom, left = face_location
        # Add some padding
        h, w = frame.shape[:2]
        pad = 30
        top = max(0, top - pad)
        left = max(0, left - pad)
        bottom = min(h, bottom + pad)
        right = min(w, right + pad)
        face_img = frame[top:bottom, left:right]
    else:
        face_img = frame

    _, buffer = cv2.imencode('.jpg', face_img)
    return base64.b64encode(buffer).decode('utf-8')


def register_mode(odoo):
    """Register a new employee's face using the camera.
    Takes a photo and sends the encoding to Odoo.
    """
    employee_id = input('\nEnter employee ID to register: ').strip()
    if not employee_id.isdigit():
        print('Invalid employee ID.')
        return

    employee_id = int(employee_id)
    print(f'[Register] Position the employee in front of the camera. Press SPACE to capture, Q to cancel.')

    cap = cv2.VideoCapture(CAMERA_SOURCE)
    if not cap.isOpened():
        print('[Error] Cannot open camera.')
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Show preview
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_frame)

        for (top, right, bottom, left) in face_locations:
            cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)

        cv2.putText(frame, 'Press SPACE to capture, Q to cancel', (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow('Register Face', frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord(' '):
            # Capture
            face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
            if len(face_encodings) == 0:
                print('[Register] No face detected! Try again.')
                continue
            if len(face_encodings) > 1:
                print('[Register] Multiple faces detected! Only one person should be in frame.')
                continue

            encoding = face_encodings[0]
            encoding_json = json.dumps(encoding.tolist())
            image_b64 = frame_to_base64(frame, face_locations[0])

            result = odoo.register_face(employee_id, encoding_json, image_b64)
            if result.get('success'):
                print(f'[Register] Face registered for: {result.get("employee_name")}')
            else:
                print(f'[Register] Failed: {result.get("error")}')
            break

    cap.release()
    cv2.destroyAllWindows()


def detection_mode(odoo):
    """Main detection loop - continuously detect and identify faces."""
    known_encodings, known_ids, known_names = load_known_faces(odoo)

    if len(known_encodings) == 0:
        print('[!] No known faces loaded. Register some faces first.')
        print('    Run with --register flag to register faces.')
        return

    # Cooldown tracking: {employee_id: last_logged_time}
    cooldowns = {}

    print(f'[Camera] Opening camera: {CAMERA_SOURCE}')
    cap = cv2.VideoCapture(CAMERA_SOURCE)
    if not cap.isOpened():
        print('[Error] Cannot open camera. Check CAMERA_SOURCE setting.')
        return

    print('[Camera] Running face detection. Press Q to quit.')
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            print('[Camera] Failed to read frame.')
            break

        frame_count += 1
        display_frame = frame.copy()

        # Only process every Nth frame for performance
        if frame_count % FRAME_SKIP != 0:
            cv2.imshow('Door Monitor', display_frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
            continue

        # Resize for faster processing
        small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
        rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # Detect faces
        face_locations = face_recognition.face_locations(rgb_small)
        face_encodings = face_recognition.face_encodings(rgb_small, face_locations)

        for (top, right, bottom, left), face_enc in zip(face_locations, face_encodings):
            # Scale back up (since we resized to 0.5x)
            top *= 2
            right *= 2
            bottom *= 2
            left *= 2

            # Compare with known faces
            distances = face_recognition.face_distance(known_encodings, face_enc)

            if len(distances) == 0:
                continue

            best_match_idx = np.argmin(distances)
            best_distance = distances[best_match_idx]
            confidence = 1.0 - best_distance

            if best_distance <= CONFIDENCE_THRESHOLD:
                # Match found
                emp_id = known_ids[best_match_idx]
                emp_name = known_names[best_match_idx]

                # Check cooldown
                now = time.time()
                last_logged = cooldowns.get(emp_id, 0)

                if now - last_logged >= COOLDOWN_SECONDS:
                    # Log door detection
                    snapshot_b64 = frame_to_base64(frame, (top, right, bottom, left))
                    try:
                        result = odoo.log_attendance(emp_id, confidence, snapshot_b64)
                        if result.get('success'):
                            print(f'[DETECTED] {emp_name} at door ({confidence*100:.1f}%)')
                            cooldowns[emp_id] = now
                        else:
                            print(f'[Error] {result.get("error")}')
                    except Exception as e:
                        print(f'[Error] Failed to log: {e}')

                # Draw green box with name
                cv2.rectangle(display_frame, (left, top), (right, bottom), (0, 255, 0), 2)
                label = f'{emp_name} ({confidence*100:.0f}%)'
                cv2.putText(display_frame, label, (left, top - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            else:
                # Unknown face - red box
                cv2.rectangle(display_frame, (left, top), (right, bottom), (0, 0, 255), 2)
                cv2.putText(display_frame, 'Unknown', (left, top - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        # Show frame
        cv2.imshow('Door Monitor', display_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print('[Camera] Stopped.')


def main():
    print('=' * 50)
    print('  Door Monitoring - Face Recognition')
    print('=' * 50)
    print(f'  Odoo: {ODOO_URL}')
    print(f'  Database: {ODOO_DB}')
    print(f'  Camera: {CAMERA_SOURCE}')
    print('=' * 50)

    # Connect to Odoo
    odoo = OdooClient(ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD)
    try:
        odoo.authenticate()
    except Exception as e:
        print(f'[Error] Cannot connect to Odoo: {e}')
        sys.exit(1)

    # Check mode
    if '--register' in sys.argv:
        register_mode(odoo)
    else:
        print('\nModes:')
        print('  1. Start Detection (default)')
        print('  2. Register New Face')
        print('  Q. Quit')
        choice = input('\nSelect mode [1]: ').strip() or '1'

        if choice == '1':
            detection_mode(odoo)
        elif choice == '2':
            register_mode(odoo)
        else:
            print('Bye!')


if __name__ == '__main__':
    main()
