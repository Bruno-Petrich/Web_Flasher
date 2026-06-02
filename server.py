#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys
import json
import base64

PORT = int(os.environ.get("PORT", 8000))
USERS_FILE = 'users.json'

def init_users_file():
    if not os.path.exists(USERS_FILE):
        default_users = {
            "admin": { "password": "admin123", "role": "admin", "display": "Administrador" },
            "operador": { "password": "operador123", "role": "operator", "display": "Operador" }
        }
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_users, f, indent=4, ensure_ascii=False)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS headers for development/sharing
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        path_only = self.path.split('?')[0]
        if path_only == '/api/users':
            self.handle_get_users()
        else:
            super().do_GET()

    def do_POST(self):
        path_only = self.path.split('?')[0]
        if path_only == '/api/add-firmware':
            self.handle_add_firmware()
        elif path_only == '/api/delete-firmware':
            self.handle_delete_firmware()
        elif path_only == '/api/save-user':
            self.handle_save_user()
        elif path_only == '/api/delete-user':
            self.handle_delete_user()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_get_users(self):
        try:
            init_users_file()
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(users_db).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))

    def handle_save_user(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            username = payload['username'].strip().lower()
            password = payload['password']
            role = payload['role']
            display = payload['display'].strip()
            
            if not username or not password or not display:
                raise Exception("Campos obrigatórios ausentes")
                
            init_users_file()
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
                
            users_db[username] = {
                "password": password,
                "role": role,
                "display": display
            }
            
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(users_db, f, indent=4, ensure_ascii=False)
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "message": f"Usuário '{username}' salvo com sucesso."}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))

    def handle_delete_user(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            username = payload['username'].strip().lower()
            
            init_users_file()
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                users_db = json.load(f)
                
            if username not in users_db:
                raise Exception("Usuário não encontrado")
                
            admins = [u for u, data in users_db.items() if data['role'] == 'admin']
            if users_db[username]['role'] == 'admin' and len(admins) <= 1:
                raise Exception("Não é possível excluir o único administrador do sistema.")
                
            del users_db[username]
            
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(users_db, f, indent=4, ensure_ascii=False)
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "message": f"Usuário '{username}' excluído com sucesso."}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))

    def handle_delete_firmware(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            fw_key = payload['key']
            
            json_path = os.path.join('firmwares', 'firmwares.json')
            if not os.path.exists(json_path):
                raise Exception("Catálogo de firmwares não encontrado")
                
            with open(json_path, 'r', encoding='utf-8') as f:
                firmwares_db = json.load(f)
                
            if fw_key not in firmwares_db:
                raise Exception("Firmware não encontrado no catálogo")
                
            fw_url = firmwares_db[fw_key]['url']
            if fw_url and fw_url.startswith('firmwares/'):
                file_path = os.path.abspath(fw_url)
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        print(f"[API] Arquivo físico '{file_path}' removido.")
                    except Exception as fe:
                        print(f"[API WARNING] Falha ao remover arquivo físico: {fe}")
                        
            del firmwares_db[fw_key]
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(firmwares_db, f, indent=4, ensure_ascii=False)
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "message": f"Firmware '{fw_key}' excluído com sucesso."}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))

    def handle_add_firmware(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            fw_key = payload['key']
            fw_name = payload['name']
            fw_chip = payload['chip']
            fw_offset = payload['offset']
            fw_erase_all = payload['eraseAll']
            fw_desc = payload['desc']
            
            fw_filename = payload.get('fileName')
            fw_base64 = payload.get('fileBase64')
            
            json_path = os.path.join('firmwares', 'firmwares.json')
            firmwares_db = {}
            
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        firmwares_db = json.load(f)
                except Exception:
                    firmwares_db = {}
            
            if fw_filename and fw_base64:
                os.makedirs('firmwares', exist_ok=True)
                binary_data = base64.b64decode(fw_base64)
                file_path = os.path.join('firmwares', fw_filename)
                with open(file_path, 'wb') as f:
                    f.write(binary_data)
                fw_url = f"firmwares/{fw_filename}"
            else:
                if fw_key in firmwares_db:
                    fw_url = firmwares_db[fw_key]['url']
                else:
                    raise Exception("Arquivo de firmware é obrigatório para novos cadastros.")
            
            firmwares_db[fw_key] = {
                "name": fw_name,
                "chip": fw_chip,
                "offset": fw_offset,
                "eraseAll": fw_erase_all,
                "url": fw_url,
                "desc": fw_desc
            }
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(firmwares_db, f, indent=4, ensure_ascii=False)
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {"status": "success", "message": f"Firmware '{fw_name}' salvo com sucesso."}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            print(f"[API] Firmware '{fw_name}' adicionado/atualizado com sucesso.")
            
        except Exception as e:
            print(f"[API ERROR] Falha no upload: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {"status": "error", "message": f"Erro interno no servidor: {str(e)}"}
            self.wfile.write(json.dumps(response).encode('utf-8'))

def run_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    init_users_file()
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
            print("=" * 60)
            print("   QuantumFlash Web Flasher - Servidor com Painel Admin")
            print("=" * 60)
            print(f" Servidor ativo na porta: {PORT}")
            print(f" Acesse no seu navegador através de:")
            print(f" --> http://localhost:{PORT}")
            print("=" * 60)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado pelo usuário.")
        sys.exit(0)
    except Exception as e:
        print(f"\nErro ao iniciar o servidor: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_server()
