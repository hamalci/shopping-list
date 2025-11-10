#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import datetime
import os
from urllib.parse import urlparse, parse_qs

# נתיבי הקבצים
ATTENDANCE_FILE = 'attendance.json'
EMPLOYEES_FILE = 'employees.json'

def load_json_file(filename):
    """טוען קובץ JSON או יוצר חדש אם לא קיים"""
    if os.path.exists(filename):
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    return []

def save_json_file(filename, data):
    """שומר נתונים לקובץ JSON"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def init_employees():
    """יוצר קובץ עובדים אם לא קיים"""
    if not os.path.exists(EMPLOYEES_FILE):
        employees = [
            {"id": "emp001", "name": "עובד דוגמה", "department": "IT"},
            {"id": "emp002", "name": "עובד שני", "department": "HR"}
        ]
        save_json_file(EMPLOYEES_FILE, employees)

def get_employee_status(employee_id):
    """מחזיר את סטטוס העובד הנוכחי"""
    attendance = load_json_file(ATTENDANCE_FILE)
    employee_records = [r for r in attendance if r['employee_id'] == employee_id]
    
    if not employee_records:
        return 'out'
    
    # מחפש את הרישום האחרון
    last_record = max(employee_records, key=lambda x: x['timestamp'])
    return 'in' if last_record['action'] == 'checkin' else 'out'

def record_attendance(employee_id):
    """רושם נוכחות עובד"""
    # בודק סטטוס נוכחי
    current_status = get_employee_status(employee_id)
    new_action = 'checkout' if current_status == 'in' else 'checkin'
    
    # יוצר רישום חדש
    now = datetime.datetime.now()
    record = {
        'employee_id': employee_id,
        'timestamp': now.isoformat(),
        'action': new_action,
        'date': now.strftime('%Y-%m-%d'),
        'time': now.strftime('%H:%M:%S')
    }
    
    # שומר לקובץ
    attendance = load_json_file(ATTENDANCE_FILE)
    attendance.append(record)
    save_json_file(ATTENDANCE_FILE, attendance)
    
    return {
        'success': True,
        'action': new_action,
        'message': f'✅ {"כניסה" if new_action == "checkin" else "יציאה"} נרשמה בהצלחה!',
        'time': now.strftime('%H:%M:%S'),
        'employee_id': employee_id
    }

class AttendanceHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """מטפל בבקשות GET"""
        parsed_url = urlparse(self.path)
        
        # מוסיף CORS headers
        self.send_response(200)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        if parsed_url.path == '/api/checkin':
            # מקבל employee_id מה-query parameters
            query_params = parse_qs(parsed_url.query)
            employee_id = query_params.get('employee_id', [None])[0]
            
            if employee_id:
                result = record_attendance(employee_id)
                response = json.dumps(result, ensure_ascii=False)
            else:
                response = json.dumps({
                    'success': False,
                    'message': '❌ חסר מזהה עובד'
                }, ensure_ascii=False)
        
        elif parsed_url.path == '/api/status':
            # מחזיר סטטוס כללי
            attendance = load_json_file(ATTENDANCE_FILE)
            employees = load_json_file(EMPLOYEES_FILE)
            
            response = json.dumps({
                'total_records': len(attendance),
                'employees': len(employees),
                'message': '✅ השרת פעיל'
            }, ensure_ascii=False)
        
        else:
            # דף בית פשוט
            response = json.dumps({
                'message': '🎯 שרת נוכחות NFC פעיל!',
                'endpoints': {
                    'checkin': '/api/checkin?employee_id=emp001',
                    'status': '/api/status'
                }
            }, ensure_ascii=False)
        
        self.wfile.write(response.encode('utf-8'))
    
    def do_OPTIONS(self):
        """מטפל בבקשות OPTIONS עבור CORS"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_server():
    """מריץ את השרת"""
    init_employees()
    
    server_address = ('', 8080)  # פורט 8080 במקום 5000
    httpd = HTTPServer(server_address, AttendanceHandler)
    
    print("🚀 שרת נוכחות NFC מופעל!")
    print(f"📱 API לאייפון: http://192.168.1.182:8080/api/checkin?employee_id=emp001")
    print(f"🌐 סטטוס: http://192.168.1.182:8080/api/status")
    print("✋ לעצירה: Ctrl+C")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 השרת נעצר")
        httpd.shutdown()

if __name__ == '__main__':
    run_server()