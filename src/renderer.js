let currentSettings = {};
let activePath = "";
let currentTarget = "game";
let configs = { shroud: {}, eml: {}, server: {} };
let aceEditors = { shroud: null, eml: null, server: null };

const CONFIG_TEMPLATES = {
    userGroups: {
        name: "New Group",
        password: "ChangeMe123",
        canKickBan: false,
        canAccessInventories: false,
        canEditWorld: false,
        canEditBase: false,
        canExtendBase: false,
        reservedSlots: 0
    },
    tags: "EN",
    bannedAccounts: "SteamID_Here"
};

async function init() {
    currentSettings = await window.api.getSettings();

    const switcher = document.getElementById('targetSwitcher');
    const hasGame = !!(currentSettings.gamePath && currentSettings.gamePath.length > 3);
    const hasServer = !!(currentSettings.serverPath && currentSettings.serverPath.length > 3);

    switcher.options[0].disabled = !hasGame;
    switcher.options[1].disabled = !hasServer;

    if (currentTarget === "game" && !hasGame && hasServer) {
        currentTarget = "server";
        switcher.value = "server";
    } else if (currentTarget === "server" && !hasServer && hasGame) {
        currentTarget = "game";
        switcher.value = "game";
    } else {
        currentTarget = switcher.value;
    }

    activePath = currentTarget === 'game' ? currentSettings.gamePath : currentSettings.serverPath;

    const launchLabel = document.getElementById('launch-label');
    if (launchLabel) launchLabel.innerText = currentTarget === 'game' ? 'Game' : 'Server';

    const displayValue = activePath || "Directory not set";
    const asideDisplay = document.getElementById('aside-path-display');
    const dashDisplay = document.getElementById('dash-path-display');

    if (asideDisplay) asideDisplay.innerText = displayValue;
    if (dashDisplay) dashDisplay.innerText = displayValue;

    const serverTabBtn = document.getElementById('serverTabBtn');
    if (serverTabBtn) {
        if (currentTarget === 'server') serverTabBtn.classList.remove('hidden');
        else serverTabBtn.classList.add('hidden');
    }

    await updateDashboard();
    setupEditors();
}

function openActivePath() {
    if (activePath) {
        window.api.openPath(activePath);
    } else {
        alert("No path is currently set.");
    }
}

async function launchTarget() {
    if (!activePath && currentTarget === 'server') return alert("Set server path first!");
    const res = await window.api.launchTarget({ type: currentTarget, path: activePath });
    if (res.success) {
        // Optional: show a small toast or notification
    } else {
        alert("Launch failed: " + res.error);
    }
}

// Function to handle tab switching and UI highlighting
async function showTab(id) {
    // Update Tab Content Visibility
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    // Update Sidebar Button Highlighting
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === id) {
            btn.classList.add('bg-slate-800');
            btn.classList.remove('hover:bg-slate-800');
        } else {
            btn.classList.remove('bg-slate-800');
            btn.classList.add('hover:bg-slate-800');
        }
    });

    if (id === 'settings') {
        document.getElementById('set-game-path').value = currentSettings.gamePath;
        document.getElementById('set-server-path').value = currentSettings.serverPath;
        document.getElementById('set-windows-start').checked = currentSettings.startWithWindows;
        document.getElementById('set-server-restart').value = currentSettings.serverRestartHour;
        document.getElementById('set-server-priority').value = currentSettings.serverPriority;
        document.getElementById('set-server-affinity').value = currentSettings.serverAffinity;
    }

    if (id === 'savegames') refreshSaves();

    if (id === 'shroud-cfg') loadVisualConfig('shroud', 'shroudtopia.json');
    if (id === 'eml-cfg') loadVisualConfig('eml', 'eml.json');
    if (id === 'server-cfg') loadVisualConfig('server', 'enshrouded_server.json');
}

let worldsData = [];

async function refreshSaves() {
    const data = await window.api.getSavegames({ 
        gamePath: currentSettings.gamePath, 
        serverPath: currentSettings.serverPath 
    });
    worldsData = data.worlds;

    const worldList = document.getElementById('world-list');
    worldList.innerHTML = "";

    worldsData.forEach(w => {
        const item = document.createElement('div');
        const activeClass = w.isActiveOnServer ? 'world-card-active' : 'border-slate-800';
        
        item.className = `p-5 bg-slate-900/40 border ${activeClass} rounded-3xl flex flex-col gap-4 transition-all`;
        item.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-black uppercase text-slate-200">${w.name}</span>
                        ${w.isActiveOnServer ? '<span class="bg-cyan-500 text-slate-950 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">Active Server World</span>' : ''}
                    </div>
                    <div class="flex gap-3 mt-1">
                        <span class="text-[10px] font-bold ${w.hasClient ? 'text-cyan-400' : 'text-slate-700'}">CLIENT: ${w.hasClient ? 'READY' : 'EMPTY'}</span>
                        <span class="text-[10px] font-bold ${w.hasServer ? 'text-indigo-400' : 'text-slate-700'}">SERVER: ${w.hasServer ? 'READY' : 'EMPTY'}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    ${!w.isActiveOnServer && w.hasServer && currentTarget === 'server' ? 
                        `<button onclick="setActiveWorld('${w.prefix}')" class="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-xl text-[10px] font-black transition">ACTIVATE</button>` : ''}
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-800/50">
                <!-- Push to Server -->
                <div class="flex flex-col gap-2">
                    <label class="text-[9px] font-black text-slate-500 uppercase px-1">Push ${w.name} to Server Slot:</label>
                    <div class="flex gap-2">
                        <select id="push-select-${w.prefix}" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] p-2 outline-none">
                            ${worldsData.map(opt => `<option value="${opt.prefix}" ${opt.prefix === w.prefix ? 'selected' : ''}>${opt.name}</option>`).join('')}
                        </select>
                        <button onclick="handleTransfer('toServer', '${w.prefix}')" ${!w.hasClient ? 'disabled' : ''} 
                                class="bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white disabled:opacity-20 px-3 rounded-lg text-[10px] font-black transition">PUSH</button>
                    </div>
                </div>

                <!-- Pull to Client -->
                <div class="flex flex-col gap-2">
                    <label class="text-[9px] font-black text-slate-500 uppercase px-1">Pull ${w.name} to Client Slot:</label>
                    <div class="flex gap-2">
                        <select id="pull-select-${w.prefix}" class="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] p-2 outline-none">
                            ${worldsData.map(opt => `<option value="${opt.prefix}" ${opt.prefix === w.prefix ? 'selected' : ''}>${opt.name}</option>`).join('')}
                        </select>
                        <button onclick="handleTransfer('toClient', '${w.prefix}')" ${!w.hasServer ? 'disabled' : ''} 
                                class="bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white disabled:opacity-20 px-3 rounded-lg text-[10px] font-black transition">PULL</button>
                    </div>
                </div>
            </div>
        `;
        worldList.appendChild(item);
    });
}

async function handleTransfer(direction, sourcePrefix) {
    const targetPrefix = document.getElementById(`${direction === 'toServer' ? 'push' : 'pull'}-select-${sourcePrefix}`).value;
    const targetWorld = worldsData.find(w => w.prefix === targetPrefix);
    
    // Overwrite Warning logic
    const existsAtDest = (direction === 'toServer') ? targetWorld.hasServer : targetWorld.hasClient;
    
    if (existsAtDest) {
        const confirmMsg = `WARNING: The target slot (${targetWorld.name}) already has a save file. 
        
Are you sure you want to OVERWRITE it with the save from ${worldsData.find(w => w.prefix === sourcePrefix).name}?`;
        if (!confirm(confirmMsg)) return;
    }

    const res = await window.api.transferSave({
        direction,
        sourcePrefix,
        targetPrefix,
        serverPath: currentSettings.serverPath
    });

    if (res.success) {
        alert("Transfer successful!");
        refreshSaves();
    } else {
        alert("Transfer failed: " + res.error);
    }
}

async function setActiveWorld(prefix) {
    if (!currentSettings.serverPath) return alert("Server path not set.");
    const res = await window.api.setActiveWorld({
        serverPath: currentSettings.serverPath,
        prefix: prefix
    });

    if (res.success) {
        refreshSaves();
    } else {
        alert("Error: " + res.error);
    }
}

async function updateDashboard() {
    if (!activePath) return;

    const status = await window.api.checkInstallations({ target: activePath });
    const { shroud, eml } = status.target;

    // 1. Render Horizontal Loader Cards
    const statusContainer = document.getElementById('loader-status');
    statusContainer.innerHTML = "";

    const renderLoaderCard = (name, isInstalled, type) => {
        const div = document.createElement('div');
        div.className = `flex-1 p-5 rounded-2xl border transition-all ${isInstalled ? 'bg-cyan-500/5 border-cyan-500/20' : 'bg-slate-900 border-slate-800'} flex justify-between items-center`;
        div.innerHTML = `
            <div>
                <div class="font-black text-[11px] uppercase">${name}</div>
                <div class="text-[9px] ${isInstalled ? 'text-cyan-400' : 'text-slate-500'} font-black uppercase">${isInstalled ? 'Ready' : 'Missing'}</div>
            </div>
            ${!isInstalled ? `<button onclick="installLoader('${type}')" class="bg-cyan-600 hover:bg-cyan-500 px-4 py-1.5 rounded-lg text-[9px] font-black transition">INSTALL</button>` : ''}
        `;
        return div;
    };

    statusContainer.appendChild(renderLoaderCard("Shroudtopia", shroud, 'shroud'));
    statusContainer.appendChild(renderLoaderCard("EML", eml, 'eml'));

    // 2. UNLOCK SIDEBAR TABS
    // We use querySelector to be 100% sure we hit the right elements
    const sBtn = document.getElementById('shroudTabBtn');
    const eBtn = document.getElementById('emlTabBtn');

    if (shroud) {
        sBtn.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        sBtn.classList.add('opacity-50', 'pointer-events-none');
    }

    if (eml) {
        eBtn.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        eBtn.classList.add('opacity-50', 'pointer-events-none');
    }

    // 3. Render Mod Grid
    const mods = await window.api.getMods(activePath);
    const modList = document.getElementById('mod-list');
    if (!modList) return;

    modList.innerHTML = mods.length ? "" : '<div class="col-span-full p-10 text-center text-slate-600 text-xs font-bold uppercase border-2 border-dashed border-slate-900 rounded-3xl">No mods found</div>';

    mods.forEach(mod => {
        const item = document.createElement('div');
        item.className = `group p-4 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${mod.active ? 'bg-slate-900 border-slate-800' : 'bg-slate-950 border-slate-900 opacity-60'}`;
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="overflow-hidden">
                    <div class="font-bold text-sm truncate ${mod.active ? 'text-slate-200' : 'text-slate-500'}">${mod.name}</div>
                    <div class="text-[9px] text-slate-600 font-black uppercase">${mod.version}</div>
                </div>
                <span class="px-2 py-1 rounded text-[8px] font-black uppercase ${mod.type === 'shroudtopia' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-indigo-500/10 text-indigo-400'}">${mod.type}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="toggleModStatus('${mod.id}', ${mod.isDirectory}, ${mod.active})" class="flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition ${mod.active ? 'bg-slate-800 hover:bg-red-500/20 hover:text-red-500' : 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white'}">
                    ${mod.active ? 'Disable' : 'Enable'}
                </button>
            </div>
        `;
        modList.appendChild(item);
    });
}

// Handler to move mods between Active/Inactive
async function toggleModStatus(modId, isDirectory, active) {
    if (!activePath) return;
    const res = await window.api.toggleMod({
        basePath: activePath,
        modId: modId,
        isDirectory: isDirectory,
        currentlyActive: active
    });
    if (res.success) updateDashboard();
    else alert("Error moving mod: " + res.error);
}

// Handler for the Import button
async function importMod() {
    if (!activePath) return alert("Please select a game/server path first in Settings.");
    const res = await window.api.importMod(activePath);
    if (res && res.success) {
        updateDashboard();
    } else if (res && !res.success) {
        alert("Import failed: " + res.error);
    }
}

function setupEditors() {
    ['shroud', 'eml', 'server'].forEach(type => {
        const el = document.getElementById(`${type}-ace`);
        if (el && !aceEditors[type]) {
            aceEditors[type] = ace.edit(`${type}-ace`);
            aceEditors[type].setTheme("ace/theme/monokai");
            aceEditors[type].session.setMode("ace/mode/json");
        }
    });
}

async function loadVisualConfig(type, filename) {
    const data = await window.api.readJson(`${activePath}/${filename}`) || {};
    configs[type] = data;
    renderForm(type, configs[type], document.getElementById(`${type}-visual`));
    if (aceEditors[type]) aceEditors[type].setValue(JSON.stringify(data, null, 4), -1);
}

function renderForm(configKey, data, container, path = []) {
    if (path.length === 0) container.innerHTML = "";

    for (let key in data) {
        const value = data[key];
        const currentPath = [...path, key];
        
        const row = document.createElement('div');
        row.className = "mb-2 border-l-2 border-slate-800/50 ml-2 pl-4 transition-all";

        if (Array.isArray(value)) {
            // --- ARRAY HANDLING ---
            const header = document.createElement('div');
            header.className = "flex items-center justify-between group py-2";
            
            const label = document.createElement('span');
            label.className = "text-[10px] font-black text-cyan-500 uppercase tracking-widest";
            label.innerText = `${key} (${value.length})`;
            
            const addBtn = document.createElement('button');
            addBtn.className = "text-[9px] bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600 hover:text-white px-2 py-0.5 rounded transition font-bold";
            addBtn.innerText = "+ ADD ITEM";
            addBtn.onclick = () => {
                const template = CONFIG_TEMPLATES[key] !== undefined ? 
                    JSON.parse(JSON.stringify(CONFIG_TEMPLATES[key])) : "";
                value.push(template);
                updateValueByPath(configs[configKey], currentPath, value);
                refreshVisual(configKey);
            };

            header.appendChild(label);
            header.appendChild(addBtn);
            row.appendChild(header);

            const listContainer = document.createElement('div');
            listContainer.className = "space-y-4 mt-2";

            value.forEach((item, index) => {
                const itemWrapper = document.createElement('div');
                itemWrapper.className = "relative p-3 bg-slate-950/30 border border-slate-800/50 rounded-xl";
                
                // Delete button for array item
                const delBtn = document.createElement('button');
                delBtn.innerHTML = "&times;";
                delBtn.className = "absolute top-1 right-2 text-slate-500 hover:text-red-500 text-lg font-bold transition";
                delBtn.onclick = () => {
                    value.splice(index, 1);
                    updateValueByPath(configs[configKey], currentPath, value);
                    refreshVisual(configKey);
                };
                itemWrapper.appendChild(delBtn);

                // Recursively render the item (if object) or a simple input (if primitive)
                if (typeof item === 'object' && item !== null) {
                    renderForm(configKey, item, itemWrapper, [...currentPath, index]);
                } else {
                    const primitiveInput = document.createElement('input');
                    primitiveInput.className = "w-full bg-slate-950 border border-slate-800 p-2 rounded text-xs text-slate-300 outline-none focus:border-cyan-500/50";
                    primitiveInput.value = item;
                    primitiveInput.oninput = () => {
                        value[index] = primitiveInput.value;
                        updateValueByPath(configs[configKey], currentPath, value);
                        syncAce(configKey);
                    };
                    itemWrapper.appendChild(primitiveInput);
                }
                listContainer.appendChild(itemWrapper);
            });
            row.appendChild(listContainer);

        } else if (typeof value === 'object' && value !== null) {
            // --- OBJECT HANDLING (Collapsible) ---
            const header = document.createElement('div');
            header.className = "flex items-center gap-2 cursor-pointer group py-2";

            const icon = document.createElement('span');
            icon.className = "text-[10px] text-slate-500 transition-transform transform rotate-0";
            icon.innerHTML = "▼";
            
            const label = document.createElement('span');
            label.className = "text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-slate-200";
            label.innerText = key;

            header.appendChild(icon);
            header.appendChild(label);
            row.appendChild(header);

            const childBox = document.createElement('div');
            childBox.className = "mt-2 space-y-2";
            
            header.onclick = () => {
                const isHidden = childBox.classList.contains('hidden');
                childBox.classList.toggle('hidden');
                icon.style.transform = isHidden ? "rotate(0deg)" : "rotate(-90deg)";
            };

            renderForm(configKey, value, childBox, currentPath);
            row.appendChild(childBox);

        } else {
            // --- PRIMITIVE HANDLING ---
            const label = document.createElement('label');
            label.className = "text-[9px] font-black text-slate-500 uppercase block mb-1 mt-2";
            label.innerText = key;
            row.appendChild(label);

            const input = document.createElement('input');
            input.className = "no-drag w-full bg-slate-950/50 border border-slate-800 p-2.5 rounded-xl text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition";
            
            if (typeof value === 'boolean') {
                const checkWrapper = document.createElement('div');
                checkWrapper.className = "flex items-center gap-3 py-1";
                input.type = 'checkbox';
                input.checked = value;
                input.className = "w-5 h-5 accent-cyan-500 cursor-pointer";
                label.className = "text-[10px] font-bold text-slate-300 cursor-pointer mb-0 mt-0";
                label.onclick = () => input.click();
                checkWrapper.appendChild(input);
                checkWrapper.appendChild(label);
                row.innerHTML = "";
                row.appendChild(checkWrapper);
            } else {
                input.type = typeof value === 'number' ? 'number' : 'text';
                input.value = value;
                row.appendChild(input);
            }

            input.oninput = () => {
                let val = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
                updateValueByPath(configs[configKey], currentPath, val);
                syncAce(configKey);
            };
        }
        container.appendChild(row);
    }
}

// Helper: Sync Visual UI back to Ace
function syncAce(configKey) {
    if(aceEditors[configKey]) {
        const cursor = aceEditors[configKey].getCursorPosition();
        aceEditors[configKey].setValue(JSON.stringify(configs[configKey], null, 4), -1);
        aceEditors[configKey].moveCursorToPosition(cursor);
    }
}

// Helper: Completely refresh Visual UI (needed after Add/Delete)
function refreshVisual(configKey) {
    const container = document.getElementById(`${configKey}-visual`);
    renderForm(configKey, configs[configKey], container);
    syncAce(configKey);
}

function updateValueByPath(obj, path, value) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
    }
    current[path[path.length - 1]] = value;
}

function toggleEditor(type) {
    const visual = document.getElementById(`${type}-visual`);
    const raw = document.getElementById(`${type}-raw`);
    if (raw.classList.contains('hidden')) {
        visual.classList.add('hidden');
        raw.classList.remove('hidden');
    } else {
        try {
            configs[type] = JSON.parse(aceEditors[type].getValue());
            renderForm(type, configs[type], visual);
            raw.classList.add('hidden');
            visual.classList.remove('hidden');
        } catch (e) { alert("JSON Fix required."); }
    }
}

async function saveConfig(filename) {
    let type = 'server';
    if (filename.startsWith('shroud')) type = 'shroud';
    if (filename.startsWith('eml')) type = 'eml';

    const res = await window.api.saveJson({ filePath: `${activePath}/${filename}`, data: configs[type] });
    if (res.success) alert("Config Saved!");
    else alert("Error: " + res.error);
}

async function saveAppSettings() {
    const settings = {
        gamePath: document.getElementById('set-game-path').value,
        serverPath: document.getElementById('set-server-path').value,
        startWithWindows: document.getElementById('set-windows-start').checked,
        serverRestartHour: parseInt(document.getElementById('set-server-restart').value),
        serverPriority: document.getElementById('set-server-priority').value,
        serverAffinity: parseInt(document.getElementById('set-server-affinity').value)
    };
    await window.api.saveSettings(settings);
    init();
    alert("Settings updated.");
}

async function installLoader(type) {
    if (!activePath) return alert("Set path first.");
    const success = await window.api.installLoader({ type, targetPath: activePath });
    if (success) { alert(`${type} installed!`); init(); }
    else alert("Install failed.");
}

init();