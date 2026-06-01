# QuantumFlash — Gravador de Firmware Simplificado

Um flasher web moderno para microcontroladores Espressif (ESP32, ESP32-S3, ESP32-C3, ESP8266) baseado na API Web Serial e `esptool-js`. 

Permite gravar firmwares oficiais do catálogo ou fazer upload de arquivos `.bin` personalizados diretamente pelo navegador, sem necessidade de instalar ferramentas de linha de comando.

---

## 🚀 Como Executar Localmente (Com Painel Administrativo)

O projeto inclui um servidor Python para gerenciar usuários e catálogo de firmwares.

1. Navegue até a pasta do projeto.
2. Inicie o servidor local executando:
   ```bash
   python server.py
   ```
3. Abra no navegador: `http://localhost:8000`
4. Use uma das credenciais padrão para acessar:
   * **Administrador**: `admin` / `admin123`
   * **Operador**: `operador` / `operador123`

> [!NOTE]
> No painel do administrador local, você pode gerenciar usuários, cadastrar novos firmwares e fazer upload de arquivos `.bin` diretamente pela interface web.

---

## 🌐 Como Usar Online (GitHub Pages)

Você pode hospedar este gravador estaticamente no **GitHub Pages** para que qualquer pessoa consiga gravar as placas diretamente pela internet.

### Diferenças entre o modo Online e Local:
* **Online (Estático)**: O gravador, a seleção de firmwares cadastrados e o upload de arquivos `.bin` personalizados funcionam **100% no navegador**. O Painel do Administrador (criação de usuários e upload de novos firmwares via formulário web) não funcionará diretamente online por não possuir o servidor Python ativo.
* **Como atualizar o catálogo online**: Para adicionar novos firmwares ao catálogo online, basta colocar o arquivo `.bin` na pasta `firmwares/`, atualizar o arquivo `firmwares/firmwares.json` com o offset correspondente e fazer o `git push` para o GitHub.

### Configurando o GitHub Pages:
1. Crie um repositório no GitHub (ex: `Web_Flasher`).
2. Adicione o repositório remoto e faça o push da branch `main`.
3. No GitHub, vá em **Settings** -> **Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/ (root)`.
5. Clique em **Save**. O site estará disponível em `https://<seu-usuario>.github.io/Web_Flasher/`.

---

## 🛠️ Tecnologias Utilizadas

* **HTML5 & Vanilla CSS**: Interface fluida com design cyberpunk/glassmorphism responsivo.
* **Web Serial API**: Comunicação direta do navegador com a porta serial do computador.
* **esptool-js (v0.4.0)**: Biblioteca oficial da Espressif para comunicação com o bootloader.
* **Python (http.server)**: Backend leve para desenvolvimento local e persistência de dados.
