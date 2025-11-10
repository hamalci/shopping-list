#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
שרת נוכחות NFC פשוט - עובד עם כל דפדפן כולל Safari אייפון
"""

import http.server
import socketserver
import json
import datetime
import os
from urllib.parse import urlparse, parse_qs

PORT = 8000

class SimpleAttendanceHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # מנתח את הנתיב
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        print(f"📥 בקשה מתקבלת: {self.path}")
        
        if path == '/api/checkin':
            self.handle_checkin(query_params)
        elif path == '/api/status':
            self.handle_status()
        elif path == '/':
            self.handle_home()
        else:
            # שולח הודעת 404 פשוטה באנגלית
            self.send_response(404)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            error_msg = json.dumps({'error': 'Page not found'}, ensure_ascii=False)
            self.wfile.write(error_msg.encode('utf-8'))
    
    def handle_checkin(self, query_params):
        """מטפל בבקשת checkin"""
        employee_id = query_params.get('employee_id', [None])[0]
        
        if not employee_id:
            response = {
                'success': False,
                'message': '❌ חסר מזהה עובד. השתמש ב: ?employee_id=emp001'
            }
        else:
            # טוען/יוצר קובץ נוכחות
            attendance_file = 'attendance_simple.json'
            try:
                if os.path.exists(attendance_file):
                    with open(attendance_file, 'r', encoding='utf-8') as f:
                        attendance = json.load(f)
                else:
                    attendance = []
            except:
                attendance = []
            
            # קובע פעולה (כניסה/יציאה)
            last_action = None
            for record in reversed(attendance):
                if record.get('employee_id') == employee_id:
                    last_action = record.get('action')
                    break
            
            new_action = 'checkout' if last_action == 'checkin' else 'checkin'
            
            # יוצר רישום חדש
            now = datetime.datetime.now()
            new_record = {
                'employee_id': employee_id,
                'action': new_action,
                'timestamp': now.isoformat(),
                'date': now.strftime('%Y-%m-%d'),
                'time': now.strftime('%H:%M:%S')
            }
            
            attendance.append(new_record)
            
            # שומר לקובץ
            try:
                with open(attendance_file, 'w', encoding='utf-8') as f:
                    json.dump(attendance, f, ensure_ascii=False, indent=2)
                
                response = {
                    'success': True,
                    'action': new_action,
                    'message': f'✅ {"כניסה" if new_action == "checkin" else "יציאה"} נרשמה בהצלחה!',
                    'time': now.strftime('%H:%M:%S'),
                    'employee_id': employee_id,
                    'hebrew_action': 'כניסה' if new_action == 'checkin' else 'יציאה'
                }
                print(f"💾 נשמר: {employee_id} - {new_action}")
            except Exception as e:
                response = {
                    'success': False,
                    'message': f'❌ שגיאה בשמירה: {str(e)}'
                }
        
        self.send_json_response(response)
    
    def handle_status(self):
        """מחזיר סטטוס השרת"""
        try:
            if os.path.exists('attendance_simple.json'):
                with open('attendance_simple.json', 'r', encoding='utf-8') as f:
                    attendance = json.load(f)
                total_records = len(attendance)
            else:
                total_records = 0
            
            response = {
                'success': True,
                'message': '🎯 שרת נוכחות פעיל!',
                'total_records': total_records,
                'time': datetime.datetime.now().strftime('%H:%M:%S')
            }
        except Exception as e:
            response = {
                'success': False,
                'message': f'❌ שגיאה: {str(e)}'
            }
        
        self.send_json_response(response)
    
    def handle_home(self):
        """דף בית"""
        response = {
            'message': '🎯 שרת נוכחות NFC',
            'instructions': 'להשתמש: /api/checkin?employee_id=emp001',
            'status_check': '/api/status',
            'time': datetime.datetime.now().strftime('%H:%M:%S')
        }
        self.send_json_response(response)
    
    def send_json_response(self, data):
        """שולח תשובת JSON"""
        json_data = json.dumps(data, ensure_ascii=False, indent=2)
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        self.wfile.write(json_data.encode('utf-8'))

def run_server():
    """מריץ את השרת"""
    try:
        with socketserver.TCPServer(("", PORT), SimpleAttendanceHandler) as httpd:
            print("=" * 50)
            print("🚀 שרת נוכחות NFC מופעל!")
            print(f"🌐 פורט: {PORT}")
            print(f"💻 מחשב: http://localhost:{PORT}")
            print(f"📱 אייפון: http://192.168.1.182:{PORT}")
            print("")
            print("🔗 לבדיקה:")
            print(f"   📊 סטטוס: http://192.168.1.182:{PORT}/api/status")
            print(f"   ✅ כניסה: http://192.168.1.182:{PORT}/api/checkin?employee_id=emp001")
            print("")
            print("✋ לעצירה: Ctrl+C")
            print("=" * 50)
            
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 השרת נעצר")
    except Exception as e:
        print(f"❌ שגיאה: {e}")

if __name__ == '__main__':
    run_server()