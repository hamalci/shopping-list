#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
שרת Live Server פשוט על פורט 5500 - בדומה לזה ש-VS Code משתמש בו
"""

import http.server
import socketserver
import json
import datetime
import os
from urllib.parse import urlparse, parse_qs

PORT = 5500

class LiveServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.getcwd(), **kwargs)
    
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        print(f"📥 בקשה: {self.path}")
        
        if path == '/api/checkin':
            self.handle_api_checkin(query_params)
        elif path == '/api/status':
            self.handle_api_status()
        else:
            # קבצים רגילים - HTML, CSS, JS
            super().do_GET()
    
    def handle_api_checkin(self, query_params):
        """API endpoint לרישום נוכחות"""
        employee_id = query_params.get('employee_id', [None])[0]
        
        if not employee_id:
            response = {
                'success': False,
                'message': '❌ חסר מזהה עובד'
            }
        else:
            # טוען נתונים קיימים
            attendance_file = 'attendance_live.json'
            try:
                if os.path.exists(attendance_file):
                    with open(attendance_file, 'r', encoding='utf-8') as f:
                        attendance = json.load(f)
                else:
                    attendance = []
            except:
                attendance = []
            
            # קובע פעולה
            last_action = None
            for record in reversed(attendance):
                if record.get('employee_id') == employee_id:
                    last_action = record.get('action')
                    break
            
            new_action = 'checkout' if last_action == 'checkin' else 'checkin'
            
            # רישום חדש
            now = datetime.datetime.now()
            new_record = {
                'employee_id': employee_id,
                'action': new_action,
                'timestamp': now.isoformat(),
                'date': now.strftime('%Y-%m-%d'),
                'time': now.strftime('%H:%M:%S')
            }
            
            attendance.append(new_record)
            
            # שמירה
            try:
                with open(attendance_file, 'w', encoding='utf-8') as f:
                    json.dump(attendance, f, ensure_ascii=False, indent=2)
                
                response = {
                    'success': True,
                    'action': new_action,
                    'message': f'✅ {"כניסה" if new_action == "checkin" else "יציאה"} נרשמה!',
                    'time': now.strftime('%H:%M:%S'),
                    'employee_id': employee_id
                }
                print(f"💾 נשמר: {employee_id} - {new_action}")
            except Exception as e:
                response = {
                    'success': False,
                    'message': f'❌ שגיאה: {str(e)}'
                }
        
        self.send_json_response(response)
    
    def handle_api_status(self):
        """API endpoint לסטטוס"""
        try:
            attendance_file = 'attendance_live.json'
            if os.path.exists(attendance_file):
                with open(attendance_file, 'r', encoding='utf-8') as f:
                    attendance = json.load(f)
                total_records = len(attendance)
            else:
                total_records = 0
            
            response = {
                'success': True,
                'message': '🎯 שרת Live נוכחות פעיל!',
                'total_records': total_records,
                'port': PORT,
                'time': datetime.datetime.now().strftime('%H:%M:%S')
            }
        except Exception as e:
            response = {
                'success': False,
                'message': f'❌ שגיאה: {str(e)}'
            }
        
        self.send_json_response(response)
    
    def send_json_response(self, data):
        """שולח תשובת JSON"""
        json_data = json.dumps(data, ensure_ascii=False, indent=2)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        self.wfile.write(json_data.encode('utf-8'))

def run_live_server():
    """מריץ את שרת הנוכחות על פורט 5500"""
    try:
        with socketserver.TCPServer(("", PORT), LiveServerHandler) as httpd:
            print("=" * 60)
            print("🚀 שרת נוכחות Live Server מופעל!")
            print(f"🌐 פורט: {PORT} (כמו VS Code Live Server)")
            print(f"💻 מחשב: http://localhost:{PORT}/nfc-attendance.html")
            print(f"📱 אייפון: http://192.168.1.182:{PORT}/nfc-attendance.html")
            print("")
            print("🔗 API לשימוש ב-iOS Shortcuts:")
            print(f"   ✅ כניסה: http://192.168.1.182:{PORT}/api/checkin?employee_id=emp001")
            print(f"   📊 סטטוס: http://192.168.1.182:{PORT}/api/status")
            print("")
            print("✋ לעצירה: Ctrl+C")
            print("=" * 60)
            
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print("❌ פורט 5500 תפוס - כנראה Live Server פועל כבר")
            print("💡 נסה לעצור את Live Server או להשתמש בפורט אחר")
        else:
            print(f"❌ שגיאה: {e}")
    except KeyboardInterrupt:
        print("\n👋 השרת נעצר")

if __name__ == '__main__':
    run_live_server()