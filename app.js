/* ==========================================================================
   QUANTUMFLASH CONTROLLER (SECURE VERSION)
   ========================================================================== */

import { ESPLoader, Transport } from "https://unpkg.com/esptool-js@0.4.0/bundle.js";

// Auth Role Definitions and Temporary Logins
let credentials = {}; // Loaded dynamically from server

// Global variables
let currentRole = sessionStorage.getItem("quantumflash_role") || null;
let firmwares = {}; // Dynamic catalog loaded from firmwares.json
let port = null;
let transport = null;
let esploader = null;
let isFlashing = false;

// DOM Elements selection
const loginOverlay = document.getElementById("login-overlay");
const loginUsernameInput = document.getElementById("username");
const loginPasswordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");

const appContent = document.getElementById("app-content");
const loggedUserRoleBadge = document.getElementById("logged-user-role");
const btnLogout = document.getElementById("btn-logout");

const elWebSerialCheck = document.getElementById("web-serial-check");
const systemStatus = document.getElementById("system-status");
const firmwareSelect = document.getElementById("firmware-select");

const customFileBlock = document.getElementById("custom-file-block");
const customFileInput = document.getElementById("custom-file-input");
const customOffsetInput = document.getElementById("custom-offset-input");

const firmwareDescCard = document.getElementById("firmware-desc-card");
const descTitle = document.getElementById("desc-title");
const descText = document.getElementById("desc-text");

const btnFlash = document.getElementById("btn-flash");

const progressBlock = document.getElementById("progress-block");
const progressStatusText = document.getElementById("progress-status-text");
const progressPercentage = document.getElementById("progress-percentage");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressSpeed = document.getElementById("progress-speed");
const progressBytes = document.getElementById("progress-bytes");

const btnToggleLogs = document.getElementById("btn-toggle-logs");
const logContainer = document.getElementById("log-container");
const logTerminal = document.getElementById("log-terminal");

// Admin Elements Selection
const adminPanel = document.getElementById("admin-panel");
const adminUploadForm = document.getElementById("admin-upload-form");
const adminFwKey = document.getElementById("admin-fw-key");
const adminFwName = document.getElementById("admin-fw-name");
const adminFwChip = document.getElementById("admin-fw-chip");
const adminFwOffset = document.getElementById("admin-fw-offset");
const adminFwErase = document.getElementById("admin-fw-erase");
const adminFwDesc = document.getElementById("admin-fw-desc");
const adminFileInput = document.getElementById("admin-file-input");
const btnAdminSubmit = document.getElementById("btn-admin-submit");
const adminProgressBlock = document.getElementById("admin-progress-block");
const adminProgressBarFill = document.getElementById("admin-progress-bar-fill");
const adminProgressText = document.getElementById("admin-progress-text");

/* ==========================================================================
   DOM INITIALIZATION
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
    await loadUsers();
    setupAuthentication();
    checkSerialSupport();
    setupDropdownListener();
    setupLogAccordion();
    setupCustomFileListeners();
    setupAdminForm();
});

/* ==========================================================================
   AUTHENTICATION LOGIC (ADMIN / OPERATOR ROLE CONTROL)
   ========================================================================== */

function setupAuthentication() {
    // Check if session is already active
    if (currentRole) {
        applySessionRole(currentRole);
    }

    btnLogin.addEventListener("click", performLogin);
    
    // Allow enter press on fields
    const triggerLogin = (e) => { if (e.key === "Enter") performLogin(); };
    loginUsernameInput.addEventListener("keydown", triggerLogin);
    loginPasswordInput.addEventListener("keydown", triggerLogin);

    btnLogout.addEventListener("click", () => {
        sessionStorage.removeItem("quantumflash_role");
        sessionStorage.removeItem("quantumflash_username");
        currentRole = null;
        
        // UI Reset
        appContent.classList.add("hidden-block");
        loginOverlay.classList.remove("hidden-block");
        loginPasswordInput.value = "";
        loginError.classList.add("hidden-block");
        
        // Reset flasher UI
        firmwareSelect.value = "";
        customFileBlock.classList.add("hidden-block");
        firmwareDescCard.classList.add("hidden-block");
        btnFlash.disabled = true;
    });
}

function performLogin() {
    const user = loginUsernameInput.value.trim().toLowerCase();
    const pass = loginPasswordInput.value;
    
    if (credentials[user] && credentials[user].password === pass) {
        const role = credentials[user].role;
        sessionStorage.setItem("quantumflash_role", role);
        sessionStorage.setItem("quantumflash_username", user);
        currentRole = role;
        
        // Hide login error
        loginError.classList.add("hidden-block");
        
        applySessionRole(role);
        
        // Clear login fields
        loginUsernameInput.value = "";
        loginPasswordInput.value = "";
    } else {
        loginError.classList.remove("hidden-block");
    }
}

function applySessionRole(role) {
    // Hide overlay
    loginOverlay.classList.add("hidden-block");
    appContent.classList.remove("hidden-block");
    
    if (role === "admin") {
        loggedUserRoleBadge.textContent = "Administrador";
        loggedUserRoleBadge.style.color = "var(--secondary)";
        loggedUserRoleBadge.style.borderColor = "rgba(177,0,255,0.3)";
        loggedUserRoleBadge.style.background = "rgba(177,0,255,0.08)";
        
        // Show Admin dashboard
        adminPanel.classList.remove("hidden-block");
        
        renderUserAdminList();
        renderFirmwareAdminList();
    } else {
        loggedUserRoleBadge.textContent = "Operador";
        loggedUserRoleBadge.style.color = "var(--primary)";
        loggedUserRoleBadge.style.borderColor = "rgba(0,242,254,0.3)";
        loggedUserRoleBadge.style.background = "rgba(0,242,254,0.08)";
        
        // Hide Admin dashboard
        adminPanel.classList.add("hidden-block");
    }
    
    // Load dynamically the firmwares from json file
    loadFirmwaresCatalog();
}

/* ==========================================================================
   DYNAMIC CATALOG LOAD
   ========================================================================== */

async function loadFirmwaresCatalog() {
    try {
        writeLog("[QuantumFlash] Carregando catálogo de firmwares do servidor...", "system-line");
        const res = await fetch("firmwares/firmwares.json?t=" + Date.now()); // cache buster
        if (!res.ok) {
            throw new Error(`HTTP Erro: ${res.status}`);
        }
        firmwares = await res.json();
        
        populateFirmwareDropdown();
        if (currentRole === "admin") {
            renderFirmwareAdminList();
        }
        writeLog("[QuantumFlash] Catálogo atualizado com sucesso.", "success-line");
    } catch (err) {
        console.error(err);
        writeLog("[QuantumFlash ERROR] Falha ao ler firmwares.json do servidor local: " + err.message, "error-line");
        writeLog("Verifique se o server.py está ativo e se a pasta contem firmwares.json.", "warning-line");
    }
}

function populateFirmwareDropdown() {
    // Store current select value to keep it if exists
    const currentVal = firmwareSelect.value;
    
    // Clear select options except placeholder and custom
    firmwareSelect.innerHTML = '<option value="" disabled selected>-- Selecione uma opção --</option>';
    
    // Add keys from dynamic db
    Object.keys(firmwares).forEach(key => {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = firmwares[key].name;
        firmwareSelect.appendChild(option);
    });
    
    // Append custom binary loader option at the end
    const customOpt = document.createElement("option");
    customOpt.value = "custom";
    customOpt.textContent = "Carregar Arquivo Personalizado (.bin)";
    firmwareSelect.appendChild(customOpt);
    
    // Restore value
    if (currentVal && firmwareSelect.querySelector(`option[value="${currentVal}"]`)) {
        firmwareSelect.value = currentVal;
    } else {
        firmwareSelect.value = "";
        customFileBlock.classList.add("hidden-block");
        firmwareDescCard.classList.add("hidden-block");
        btnFlash.disabled = true;
    }
}

/* ==========================================================================
   WEB SERIAL SUPPORT CHECK
   ========================================================================== */

function checkSerialSupport() {
    if ("serial" in navigator) {
        elWebSerialCheck.textContent = "Web Serial API Ativa";
        elWebSerialCheck.className = "api-check api-ok";
    } else {
        elWebSerialCheck.textContent = "Navegador não suportado";
        elWebSerialCheck.className = "api-check api-err";
        btnFlash.disabled = true;
        writeLog("[QuantumFlash ERROR] A API Web Serial não é suportada por este navegador.\n" +
                 "Acesse usando Google Chrome ou Microsoft Edge no computador para efetuar gravações.", "error-line");
    }
}

/* ==========================================================================
   LOG DRAWER ACCORDION
   ========================================================================== */

function setupLogAccordion() {
    btnToggleLogs.addEventListener("click", () => {
        const isActive = btnToggleLogs.classList.toggle("active");
        if (isActive) {
            logContainer.classList.remove("hidden-block");
            btnToggleLogs.querySelector("span").textContent = "Ocultar Logs de Gravação";
        } else {
            logContainer.classList.add("hidden-block");
            btnToggleLogs.querySelector("span").textContent = "Mostrar Logs de Gravação";
        }
    });
}

function writeLog(text, className = "") {
    const formattedText = text.replace(/\r/g, "");
    if (!formattedText.trim() && text !== "\n") return;

    const line = document.createElement("div");
    line.className = `log-line ${className}`;
    line.textContent = formattedText;
    logTerminal.appendChild(line);
    
    logTerminal.scrollTop = logTerminal.scrollHeight;
    
    if (logTerminal.children.length > 300) {
        logTerminal.removeChild(logTerminal.firstChild);
    }
}

/* ==========================================================================
   SELECTIONS & FLOW TRIGGERS
   ========================================================================== */

function setupDropdownListener() {
    firmwareSelect.addEventListener("change", () => {
        const val = firmwareSelect.value;
        if (!val) {
            btnFlash.disabled = true;
            customFileBlock.classList.add("hidden-block");
            firmwareDescCard.classList.add("hidden-block");
            return;
        }

        if (val === "custom") {
            customFileBlock.classList.remove("hidden-block");
            firmwareDescCard.classList.add("hidden-block");
            validateCustomInputs();
        } else {
            customFileBlock.classList.add("hidden-block");
            
            const fw = firmwares[val];
            descTitle.textContent = fw.name;
            descText.textContent = fw.desc;
            firmwareDescCard.classList.remove("hidden-block");
            
            btnFlash.disabled = false;
        }
    });
}

function setupCustomFileListeners() {
    customFileInput.addEventListener("change", validateCustomInputs);
    customOffsetInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9a-fA-F]/g, "");
        validateCustomInputs();
    });
}

function validateCustomInputs() {
    const fileSelected = customFileInput.files.length > 0;
    const offsetValid = customOffsetInput.value.trim().length > 0;
    
    if (fileSelected && offsetValid) {
        btnFlash.disabled = false;
    } else {
        btnFlash.disabled = true;
    }
}

/* ==========================================================================
   CONNECT AND WRITE FLASH ENGINE (AUTOMATED FLOW)
   ========================================================================== */

btnFlash.addEventListener("click", async () => {
    if (isFlashing) return;
    
    isFlashing = true;
    btnFlash.disabled = true;
    firmwareSelect.disabled = true;
    customFileInput.disabled = true;
    customOffsetInput.disabled = true;
    
    logTerminal.innerHTML = "";
    writeLog("[QuantumFlash] Iniciando gravação automatizada...", "system-line");
    
    systemStatus.textContent = "Conectando Placa";
    systemStatus.className = "status-badge status-connecting";
    
    if (!btnToggleLogs.classList.contains("active")) {
        btnToggleLogs.click();
    }
    
    let firmwareBinary = null;
    let targetOffset = 0;
    let shouldErase = false;
    
    const selectedKey = firmwareSelect.value;
    
    try {
        // 1. Download or Load Firmware Bin
        if (selectedKey === "custom") {
            const file = customFileInput.files[0];
            writeLog(`[Carregador] Carregando arquivo local: ${file.name}...`, "system-line");
            firmwareBinary = await readFileAsUint8Array(file);
            targetOffset = parseInt(customOffsetInput.value, 16);
            shouldErase = false;
        } else {
            const fw = firmwares[selectedKey];
            writeLog(`[Carregador] Baixando binário cadastrado: ${fw.url}...`, "system-line");
            
            try {
                firmwareBinary = await downloadFirmwareFromServer(fw.url);
            } catch (fetchErr) {
                throw new Error(`Falha ao obter o arquivo do servidor local (${fw.url}). Verifique se o server.py está ativo e se o arquivo físico existe na pasta "firmwares/".`);
            }
            
            targetOffset = parseInt(fw.offset, 16);
            shouldErase = fw.eraseAll;
        }
        
        writeLog(`[Carregador] Binário lido com sucesso. Tamanho: ${(firmwareBinary.length / 1024).toFixed(1)} KB.`, "success-line");
        writeLog(`[Carregador] Offset definido: 0x${targetOffset.toString(16).toUpperCase()}`, "system-line");

        // 2. Request Web Serial Port Access
        writeLog("[Serial] Selecione o dispositivo na caixa de diálogo do navegador...", "system-line");
        port = await navigator.serial.requestPort();
        
        // 3. Setup ESPLoader & Transport
        transport = new Transport(port, true);
        
        const loaderTerminal = {
            clean() {
                logTerminal.innerHTML = "";
            },
            writeLine(data) {
                writeLog(data, "write-line");
            },
            write(data) {
                writeLog(data, "write-line");
            }
        };

        esploader = new ESPLoader({
            transport: transport,
            baudrate: 921600,
            terminal: loaderTerminal
        });
        
        // 4. Connect to device
        writeLog("[Serial] Conectando ao bootloader... Se falhar, segure o botão BOOT/IO0 na placa.", "warning-line");
        const detectedChip = await esploader.main("default_reset");
        writeLog(`[Serial] Chip Detectado: ${detectedChip}`, "success-line");
        
        systemStatus.textContent = `Gravando ${detectedChip}`;
        systemStatus.className = "status-badge status-flashing";
        
        // 5. Setup Progress trackers
        progressBlock.classList.remove("hidden-block");
        updateProgressBar(0, "Preparando gravação...");
        
        let totalWrittenBytes = 0;
        let lastWritten = 0;
        const startTime = Date.now();
        
        const speedTimer = setInterval(() => {
            const delta = totalWrittenBytes - lastWritten;
            lastWritten = totalWrittenBytes;
            const speedKb = (delta / 1024).toFixed(1);
            progressSpeed.textContent = `${speedKb} kB/s`;
        }, 1000);
        
        const flashOptions = {
            fileArray: [{ data: uint8ArrayToBinaryString(firmwareBinary), address: targetOffset }],
            flashSize: 'keep',
            flashFreq: 'keep',
            flashMode: 'keep',
            eraseAll: shouldErase,
            compress: true,
            reportProgress: (fileIndex, written, total) => {
                totalWrittenBytes = written;
                const pct = Math.round((written / total) * 100);
                updateProgressBar(pct, `Gravando firmware: ${pct}%`);
                progressBytes.textContent = `${(written / 1024).toFixed(1)} KB / ${(total / 1024).toFixed(1)} KB`;
            }
        };
        
        // 6. Write/Erase Flash
        if (shouldErase) {
            writeLog("[Flash] Limpando memória flash... Por favor, aguarde.", "warning-line");
            updateProgressBar(0, "Limpando flash...");
        }
        
        writeLog("[Flash] Transferindo dados comprimidos para a memória do chip...", "system-line");
        await esploader.writeFlash(flashOptions);
        
        clearInterval(speedTimer);
        
        // 7. Success finish and reboot
        writeLog("[Flash] Gravação concluída!", "success-line");
        updateProgressBar(100, "Gravação Concluída!");
        progressSpeed.textContent = "Concluído";
        
        writeLog("[Flash] Reiniciando placa...", "system-line");
        try {
            if (esploader && typeof esploader.hardReset === "function") {
                await esploader.hardReset();
            } else if (esploader && typeof esploader.after === "function") {
                await esploader.after("hard_reset");
            } else {
                writeLog("[Flash] Método de reinicialização automática indisponível.", "warning-line");
            }
        } catch (resetErr) {
            writeLog(`[Flash Warning] Não foi possível reiniciar a placa automaticamente: ${resetErr.message}`, "warning-line");
        }
        writeLog("[QuantumFlash SUCCESS] Processo finalizado com sucesso!", "success-line");
        
        systemStatus.textContent = "Sucesso!";
        systemStatus.className = "status-badge status-success";
        
    } catch (err) {
        console.error(err);
        writeLog(`\n[QuantumFlash ERROR] Erro no processo: ${err.message}`, "error-line");
        
        systemStatus.textContent = "Erro na Gravação";
        systemStatus.className = "status-badge status-error";
        updateProgressBar(0, "Falha!");
        progressSpeed.textContent = "Erro";
    } finally {
        if (transport) {
            try {
                await transport.disconnect();
            } catch (disError) {
                console.error("Erro ao fechar porta", disError);
            }
        }
        
        isFlashing = false;
        firmwareSelect.disabled = false;
        customFileInput.disabled = false;
        customOffsetInput.disabled = false;
        
        if (firmwareSelect.value) {
            btnFlash.disabled = false;
        }
    }
});

/* ==========================================================================
   ADMINISTRATOR ACTIONS (FIRMWARE UPLOAD & PUBLISH TO SERVER API)
   ========================================================================== */

const adminFormTitle = document.getElementById("admin-form-title");
const btnAdminCancelEdit = document.getElementById("btn-admin-cancel-edit");
const adminFileLabel = document.getElementById("admin-file-label");

let firmwareEditState = {
    isEditing: false,
    key: ""
};

function setupAdminForm() {
    // Clear custom key field from special characters
    adminFwKey.addEventListener("input", (e) => {
        e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    });

    adminFwOffset.addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/[^0-9a-fA-F]/g, "");
    });

    btnAdminSubmit.addEventListener("click", publishNewFirmware);
    btnAdminCancelEdit.addEventListener("click", cancelFirmwareEdit);
    
    // User Management Event Listeners
    if (adminUserUsernameInput) {
        adminUserUsernameInput.addEventListener("input", (e) => {
            e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "");
        });
    }
    if (btnAdminSaveUser) {
        btnAdminSaveUser.addEventListener("click", saveUser);
    }
    if (btnAdminCancelUserEdit) {
        btnAdminCancelUserEdit.addEventListener("click", cancelUserEdit);
    }
    if (showUserPasswordsCheckbox) {
        showUserPasswordsCheckbox.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            adminUserPasswordInput.type = isChecked ? "text" : "password";
            if (adminUserPasswordConfirmInput) {
                adminUserPasswordConfirmInput.type = isChecked ? "text" : "password";
            }
        });
    }
}

async function publishNewFirmware() {
    // Validate inputs
    const key = adminFwKey.value.trim();
    const name = adminFwName.value.trim();
    const chip = adminFwChip.value;
    const offset = adminFwOffset.value.trim() ? "0x" + adminFwOffset.value.trim() : "0x0";
    const erase = adminFwErase.checked;
    const desc = adminFwDesc.value.trim();
    const file = adminFileInput.files[0];
    
    if (!key || !name || !desc) {
        alert("Favor preencher todos os campos de texto obrigatórios.");
        return;
    }
    
    if (!firmwareEditState.isEditing && !file) {
        alert("Favor selecionar um arquivo de firmware (.bin).");
        return;
    }
    
    btnAdminSubmit.disabled = true;
    adminProgressBlock.classList.remove("hidden-block");
    updateAdminProgressBar(0, "Preparando dados...");
    
    try {
        let base64Content = null;
        let fileName = null;
        
        if (file) {
            updateAdminProgressBar(20, "Convertendo arquivo binário...");
            base64Content = await readFileAsBase64(file);
            fileName = file.name;
        }
        
        updateAdminProgressBar(50, "Enviando dados para o servidor...");
        
        const payload = {
            key: key,
            name: name,
            chip: chip,
            offset: offset,
            eraseAll: erase,
            desc: desc
        };
        
        if (file) {
            payload.fileName = fileName;
            payload.fileBase64 = base64Content;
        }
        
        // POST to backend API
        const response = await fetch("/api/add-firmware", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        
        const resData = await response.json();
        
        updateAdminProgressBar(100, "Completo!");
        
        if (response.ok && resData.status === "success") {
            alert(`Sucesso: ${resData.message}`);
            
            // Reset fields
            cancelFirmwareEdit();
            adminUploadForm.reset();
            
            // Reload Catalog
            await loadFirmwaresCatalog();
        } else {
            throw new Error(resData.message || "Erro desconhecido retornado pelo servidor.");
        }
        
    } catch (err) {
        console.error(err);
        alert(`Erro ao salvar firmware: ${err.message}`);
    } finally {
        btnAdminSubmit.disabled = false;
        setTimeout(() => {
            adminProgressBlock.classList.add("hidden-block");
        }, 3000);
    }
}

function updateAdminProgressBar(pct, text) {
    adminProgressBarFill.style.width = `${pct}%`;
    adminProgressText.textContent = text;
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */

function updateProgressBar(pct, text) {
    progressBarFill.style.width = `${pct}%`;
    progressPercentage.textContent = `${pct}%`;
    progressStatusText.textContent = text;
}

function readFileAsUint8Array(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(new Uint8Array(e.target.result));
        reader.onerror = (err) => reject(new Error("Falha ao ler binário local."));
        reader.readAsArrayBuffer(file);
    });
}

function downloadFirmwareFromServer(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(new Uint8Array(xhr.response));
            } else {
                reject(new Error(`Falha de download: Código HTTP ${xhr.status}`));
            }
        };
        
        xhr.onerror = () => reject(new Error("Erro de conexão de rede local."));
        xhr.send();
    });
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Extrapolate raw base64 string from data URL
            const base64String = reader.result.split(",")[1];
            resolve(base64String);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
    });
}

function uint8ArrayToBinaryString(uint8Array) {
    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, chunk);
    }
    return binaryString;
}

/* ==========================================================================
   USER AND FIRMWARE MANAGEMENT CONTROLLER (ADMIN SECTION)
   ========================================================================== */

// DOM Elements Selection for User Management
const adminUserListBody = document.getElementById("admin-user-list-body");
const adminUserForm = document.getElementById("admin-user-form");
const adminUserFormTitle = document.getElementById("admin-user-form-title");
const adminUserUsernameInput = document.getElementById("admin-user-username");
const adminUserDisplayInput = document.getElementById("admin-user-display");
const adminUserRoleSelect = document.getElementById("admin-user-role");
const adminUserPasswordInput = document.getElementById("admin-user-password");
const adminUserPasswordConfirmInput = document.getElementById("admin-user-password-confirm");
const showUserPasswordsCheckbox = document.getElementById("show-user-passwords");
const btnAdminSaveUser = document.getElementById("btn-admin-save-user");
const btnAdminCancelUserEdit = document.getElementById("btn-admin-cancel-user-edit");
const userEditMode = document.getElementById("user-edit-mode");

// DOM Elements Selection for Firmware Management
const adminFirmwareListBody = document.getElementById("admin-firmware-list-body");

// --- USER OPERATIONS ---

async function loadUsers() {
    try {
        const res = await fetch("/api/users?t=" + Date.now());
        if (!res.ok) throw new Error(`HTTP Erro: ${res.status}`);
        credentials = await res.json();
        
        if (currentRole === "admin") {
            renderUserAdminList();
        }
    } catch (err) {
        console.error("Falha ao ler banco de usuários:", err);
        credentials = {
            "admin": { password: "admin123", role: "admin", display: "Administrador" }
        };
    }
}

function renderUserAdminList() {
    if (!adminUserListBody) return;
    adminUserListBody.innerHTML = "";
    
    const currentUser = sessionStorage.getItem("quantumflash_username") || "";
    
    Object.keys(credentials).forEach(username => {
        const u = credentials[username];
        const tr = document.createElement("tr");
        
        const tdUser = document.createElement("td");
        tdUser.textContent = username;
        tr.appendChild(tdUser);
        
        const tdDisplay = document.createElement("td");
        tdDisplay.textContent = u.display;
        tr.appendChild(tdDisplay);
        
        const tdRole = document.createElement("td");
        tdRole.textContent = u.role === "admin" ? "Administrador" : "Operador";
        tr.appendChild(tdRole);
        
        const tdActions = document.createElement("td");
        tdActions.className = "btn-action-group";
        
        // Edit Button
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-small btn-small-edit";
        btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", () => startEditUser(username));
        tdActions.appendChild(btnEdit);
        
        // Delete Button
        const btnDelete = document.createElement("button");
        btnDelete.className = "btn-small btn-small-delete";
        btnDelete.textContent = "Excluir";
        if (username === currentUser) {
            btnDelete.disabled = true;
            btnDelete.title = "Não é possível excluir a si mesmo.";
            btnDelete.style.opacity = "0.5";
            btnDelete.style.cursor = "not-allowed";
        } else {
            btnDelete.addEventListener("click", () => deleteUser(username));
        }
        tdActions.appendChild(btnDelete);
        
        tr.appendChild(tdActions);
        adminUserListBody.appendChild(tr);
    });
}

function startEditUser(username) {
    const u = credentials[username];
    adminUserUsernameInput.value = username;
    adminUserUsernameInput.disabled = true;
    adminUserDisplayInput.value = u.display;
    adminUserRoleSelect.value = u.role;
    adminUserPasswordInput.value = u.password;
    if (adminUserPasswordConfirmInput) {
        adminUserPasswordConfirmInput.value = u.password;
    }
    
    userEditMode.value = "edit";
    adminUserFormTitle.textContent = `Editar Usuário: ${username}`;
    btnAdminCancelUserEdit.classList.remove("hidden-block");
    
    document.getElementById("admin-user-form").scrollIntoView({ behavior: "smooth" });
}

function cancelUserEdit() {
    adminUserUsernameInput.value = "";
    adminUserUsernameInput.disabled = false;
    adminUserDisplayInput.value = "";
    adminUserRoleSelect.value = "operator";
    adminUserPasswordInput.value = "";
    if (adminUserPasswordConfirmInput) {
        adminUserPasswordConfirmInput.value = "";
    }
    if (showUserPasswordsCheckbox) {
        showUserPasswordsCheckbox.checked = false;
        adminUserPasswordInput.type = "password";
        if (adminUserPasswordConfirmInput) {
            adminUserPasswordConfirmInput.type = "password";
        }
    }
    
    userEditMode.value = "create";
    adminUserFormTitle.textContent = "Cadastrar Novo Usuário";
    btnAdminCancelUserEdit.classList.add("hidden-block");
}

async function saveUser() {
    const username = adminUserUsernameInput.value.trim().toLowerCase();
    const display = adminUserDisplayInput.value.trim();
    const role = adminUserRoleSelect.value;
    const password = adminUserPasswordInput.value;
    const passwordConfirm = adminUserPasswordConfirmInput ? adminUserPasswordConfirmInput.value : "";
    
    if (!username || !display || !password) {
        alert("Favor preencher todos os campos do usuário!");
        return;
    }
    
    if (password !== passwordConfirm) {
        alert("As senhas digitadas não coincidem! Verifique e tente novamente.");
        return;
    }
    
    try {
        const res = await fetch("/api/save-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, display, role, password })
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
            alert(data.message);
            cancelUserEdit();
            await loadUsers();
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        alert("Erro ao salvar usuário: " + err.message);
    }
}

async function deleteUser(username) {
    if (!confirm(`Deseja realmente excluir o usuário "${username}"?`)) return;
    
    try {
        const res = await fetch("/api/delete-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
            alert(data.message);
            await loadUsers();
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        alert("Erro ao excluir usuário: " + err.message);
    }
}

// --- FIRMWARE OPERATIONS ---

function renderFirmwareAdminList() {
    if (!adminFirmwareListBody) return;
    adminFirmwareListBody.innerHTML = "";
    
    Object.keys(firmwares).forEach(key => {
        const fw = firmwares[key];
        const tr = document.createElement("tr");
        
        const tdName = document.createElement("td");
        tdName.textContent = fw.name;
        tr.appendChild(tdName);
        
        const tdChip = document.createElement("td");
        tdChip.textContent = fw.chip;
        tr.appendChild(tdChip);
        
        const tdOffset = document.createElement("td");
        tdOffset.textContent = fw.offset;
        tr.appendChild(tdOffset);
        
        const tdActions = document.createElement("td");
        tdActions.className = "btn-action-group";
        
        // Edit Button
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-small btn-small-edit";
        btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", () => startEditFirmware(key));
        tdActions.appendChild(btnEdit);
        
        // Delete Button
        const btnDelete = document.createElement("button");
        btnDelete.className = "btn-small btn-small-delete";
        btnDelete.textContent = "Excluir";
        btnDelete.addEventListener("click", () => deleteFirmware(key));
        tdActions.appendChild(btnDelete);
        
        tr.appendChild(tdActions);
        adminFirmwareListBody.appendChild(tr);
    });
}

function startEditFirmware(key) {
    const fw = firmwares[key];
    adminFwKey.value = key;
    adminFwKey.disabled = true;
    adminFwName.value = fw.name;
    adminFwChip.value = fw.chip;
    
    const offsetVal = fw.offset.startsWith("0x") ? fw.offset.substring(2) : fw.offset;
    adminFwOffset.value = offsetVal;
    
    adminFwErase.checked = fw.eraseAll;
    adminFwDesc.value = fw.desc;
    
    adminFileInput.required = false;
    adminFileLabel.textContent = "Selecionar Novo Arquivo Binário (.bin) [Opcional]";
    
    firmwareEditState.isEditing = true;
    firmwareEditState.key = key;
    
    adminFormTitle.textContent = `Editar Firmware: ${fw.name}`;
    btnAdminCancelEdit.classList.remove("hidden-block");
    
    document.getElementById("admin-upload-form").scrollIntoView({ behavior: "smooth" });
}

function cancelFirmwareEdit() {
    adminFwKey.value = "";
    adminFwKey.disabled = false;
    adminFwName.value = "";
    adminFwChip.value = "ESP32";
    adminFwOffset.value = "0";
    adminFwErase.checked = false;
    adminFwDesc.value = "";
    adminFileInput.value = "";
    adminFileInput.required = true;
    adminFileLabel.textContent = "Selecionar Arquivo Binário (.bin)";
    
    firmwareEditState.isEditing = false;
    firmwareEditState.key = "";
    
    adminFormTitle.textContent = "Cadastrar Novo Firmware";
    btnAdminCancelEdit.classList.add("hidden-block");
}

async function deleteFirmware(key) {
    if (!confirm(`Deseja realmente excluir o firmware "${firmwares[key].name}"?`)) return;
    
    try {
        const res = await fetch("/api/delete-firmware", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (res.ok && data.status === "success") {
            alert(data.message);
            await loadFirmwaresCatalog();
        } else {
            throw new Error(data.message);
        }
    } catch (err) {
        alert("Erro ao excluir firmware: " + err.message);
    }
}
