/**
 * LinkedIn to Odoo Connector - Sidepanel Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const scanBtn = document.getElementById('scan-btn');
    const statusMsg = document.getElementById('status-msg');
    const contactsList = document.getElementById('contacts-list');
    const debugOutput = document.getElementById('debug-output');
    const toggleDebug = document.getElementById('toggle-debug');
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const settingsToggle = document.getElementById('settings-toggle');
    const backToMainBtn = document.getElementById('back-to-main');
    const syncSessionBtn = document.getElementById('sync-session');
    const saveSettingsBtn = document.getElementById('save-settings');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    let renderedProfileUrls = new Set();
    let contactQueue = [];
    let isProcessingQueue = false;

    // 1. Initial Load & Localization
    localizeUI();
    loadSettings();

    // 2. Navigation & Tabs
    if (settingsToggle) {
        settingsToggle.addEventListener('click', () => {
            settingsView.classList.remove('hidden');
            mainView.classList.add('hidden');
            if (backToMainBtn) backToMainBtn.classList.remove('hidden');
        });
    }

    if (backToMainBtn) {
        backToMainBtn.addEventListener('click', () => {
            loadSettings();
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            if (targetTab) targetTab.classList.remove('hidden');
        });
    });

    // 3. Authentication Handlers
    syncSessionBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('session-url');
        const url = urlInput ? urlInput.value.trim().replace(/\/$/, "") : "";
        if (!url) {
            alert("Veuillez saisir une URL Odoo");
            return;
        }

        syncSessionBtn.disabled = true;
        syncSessionBtn.innerText = chrome.i18n.getMessage("adding") || "Connexion...";

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config: { url }, method: "init_session" }
        }, async (response) => {
            if (response && response.uid) {
                await chrome.storage.local.set({ url, db: response.db, username: "", password: "" });
                loadSettings();
            } else {
                alert(chrome.i18n.getMessage("sessionFailed") || "Échec de la connexion session.");
            }
            syncSessionBtn.disabled = false;
            syncSessionBtn.innerText = chrome.i18n.getMessage("syncSession") || "Synchroniser";
        });
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const config = {
            url: document.getElementById('manual-url').value.trim().replace(/\/$/, ""),
            db: document.getElementById('manual-db').value.trim(),
            username: document.getElementById('manual-user').value.trim(),
            password: document.getElementById('manual-pass').value.trim()
        };

        if (!config.url || !config.db || !config.username || !config.password) {
            alert("Veuillez remplir tous les champs");
            return;
        }

        await chrome.storage.local.set(config);
        loadSettings();
    });

    // 4. Scan & Queue Management
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "new_contacts_auto") {
            const newContacts = request.contacts.filter(c => !renderedProfileUrls.has(c.profileUrl));
            if (newContacts.length > 0) {
                addToQueue(newContacts, true); // Enable auto-scroll for live scan
            }
        }
    });

    scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        scanBtn.style.opacity = '0.5';
        statusMsg.innerText = chrome.i18n.getMessage("scanning");

        contactsList.innerHTML = '';
        renderedProfileUrls.clear();
        contactQueue = [];

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes("linkedin.com")) {
            statusMsg.innerHTML = chrome.i18n.getMessage("navigateHint");
            scanBtn.disabled = false;
            scanBtn.style.opacity = '1';
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "parse_connections" }, async (response) => {
            setTimeout(() => { scanBtn.disabled = false; scanBtn.style.opacity = '1'; }, 3000);
            if (chrome.runtime.lastError || !response) {
                statusMsg.innerText = chrome.i18n.getMessage("loadError");
                return;
            }
            if (response.contacts) {
                addToQueue(response.contacts);
                statusMsg.innerText = chrome.i18n.getMessage("foundContacts", [response.contacts.length.toString()]);
            }
        });
    });

    function addToQueue(contacts, autoScroll = false) {
        contacts.forEach(contact => {
            if (!renderedProfileUrls.has(contact.profileUrl)) {
                renderedProfileUrls.add(contact.profileUrl);
                const cardId = getSafeId(contact.profileUrl);
                const imgId = `img-${cardId}`;
                renderContactCard(contact, cardId, imgId);
                contactQueue.push({ contact, cardId, imgId, autoScroll });
            }
        });
        if (!isProcessingQueue) processQueue();
    }

    async function processQueue() {
        if (isProcessingQueue || contactQueue.length === 0) return;
        isProcessingQueue = true;
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);

        while (contactQueue.length > 0) {
            const item = contactQueue.shift();
            try {
                await checkContact(item.contact, item.cardId, config);
                await new Promise(r => setTimeout(r, 200)); // Slightly faster but still safe
            } catch (e) {
                console.error("Queue Error:", e);
            }

            // Auto-scroll ONLY if this item came from an auto-scan
            if (item.autoScroll) {
                mainView.scrollTo({ top: mainView.scrollHeight, behavior: 'smooth' });
            }
        }
        isProcessingQueue = false;
    }

    function renderContactCard(contact, cardId, imgId) {
        const card = document.createElement('div');
        card.className = 'contact-card';
        card.innerHTML = `
            <div class="contact-img-container">
                <img id="${imgId}" src="" class="contact-img hidden" alt="">
                <div id="placeholder-${imgId}" class="contact-img placeholder"></div>
            </div>
            <div class="contact-info">
                <p class="contact-name">${contact.name}</p>
                <p class="contact-position">${contact.position || ''}</p>
                <p class="contact-company">${contact.company || ''}</p>
                <div class="contact-actions" id="${cardId}">
                    <span class="loading-text">${chrome.i18n.getMessage("checkingOdoo") || "Vérification Odoo..."}</span>
                </div>
            </div>
        `;
        contactsList.appendChild(card);
        if (contact.imageUrl) {
            chrome.runtime.sendMessage({ action: "fetch_image", url: contact.imageUrl }, (res) => {
                const imgEl = document.getElementById(imgId);
                const placeholder = document.getElementById(`placeholder-${imgId}`);
                if (res && res.data && imgEl) {
                    imgEl.src = res.data;
                    imgEl.classList.remove('hidden');
                    if (placeholder) placeholder.classList.add('hidden');
                }
            });
        }
    }

    // 5. UI Helpers
    function getSafeId(str) {
        try {
            return 'id-' + btoa(unescape(encodeURIComponent(str))).replace(/[^a-z0-9]/gi, '');
        } catch (e) {
            return 'id-' + Math.random().toString(36).substr(2, 9);
        }
    }

    async function loadSettings() {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        if (config.url) {
            mainView.classList.remove('hidden');
            settingsView.classList.add('hidden');
            if (backToMainBtn) backToMainBtn.classList.add('hidden');

            const sessionUrl = document.getElementById('session-url');
            const manualUrl = document.getElementById('manual-url');
            if (sessionUrl) sessionUrl.value = config.url;
            if (manualUrl) manualUrl.value = config.url;

            const dbInput = document.getElementById('manual-db');
            const userInput = document.getElementById('manual-user');
            if (dbInput) dbInput.value = config.db || "";
            if (userInput) userInput.value = config.username || "";

            // Auto-check session if no password
            if (!config.password) {
                chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "init_session" } });
            }
        } else {
            settingsView.classList.remove('hidden');
            mainView.classList.add('hidden');
            if (backToMainBtn) backToMainBtn.classList.add('hidden');
        }
    }

    function localizeUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const translation = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
            if (translation) el.innerHTML = translation;
        });
    }

    function renderSuccessWithLink(containerId, odooUrl, partnerId, msgKey) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const card = container.closest('.contact-card');
        if (card && (msgKey === "certainMatch" || msgKey === "added")) card.classList.add('is-existing');
        const partnerUrl = `${odooUrl}/web#id=${partnerId}&model=res.partner&view_type=form`;
        container.innerHTML = `<div class="success-box"><span class="action-btn exists">${chrome.i18n.getMessage(msgKey)}</span><a href="${partnerUrl}" target="_blank" class="odoo-link success-link">Voir dans Odoo ↗</a></div>`;
    }

    function checkContact(contact, containerId, config) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "find_best_match", data: contact } }, (response) => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = '';
                    if (response && response.status === 'certain') {
                        renderSuccessWithLink(containerId, config.url, response.partner.id, "certainMatch");
                    } else if (response && response.status === 'multi') {
                        let matchesHtml = '';
                        response.matches.forEach((m, idx) => {
                            const partnerUrl = `${config.url}/web#id=${m.partner.id}&model=res.partner&view_type=form`;
                            matchesHtml += `<div class="match-row ${m.status}"><div class="match-info-text"><p class="match-status">${chrome.i18n.getMessage(m.status === 'likely' ? "likelyMatch" : "potentialMatch", [m.partner.name])}${m.partner.parent_id ? ` (${m.partner.parent_id[1]})` : ""}</p><a href="${partnerUrl}" target="_blank" class="odoo-link">Voir dans Odoo ↗</a></div><button class="action-btn link small" id="link-${containerId}-${idx}">${chrome.i18n.getMessage("linkBtn")}</button></div>`;
                        });
                        container.innerHTML = `<div class="match-box multi">${matchesHtml}<div class="match-footer"><button class="action-btn add-anyway" id="add-${containerId}">${chrome.i18n.getMessage("createAnywayBtn")}</button></div></div>`;
                        response.matches.forEach((m, idx) => {
                            const btn = document.getElementById(`link-${containerId}-${idx}`);
                            if (btn) btn.onclick = () => linkContactToOdoo(m.partner.id, contact.profileUrl, containerId);
                        });
                        const addBtn = document.getElementById(`add-${containerId}`);
                        if (addBtn) addBtn.onclick = () => addContactToOdoo(contact, containerId);
                    } else {
                        const addBtn = document.createElement('button');
                        addBtn.className = 'action-btn add';
                        addBtn.innerText = chrome.i18n.getMessage("addToOdoo");
                        addBtn.onclick = () => addContactToOdoo(contact, containerId);
                        container.appendChild(addBtn);
                    }
                }
                resolve();
            });
        });
    }

    async function linkContactToOdoo(partnerId, profileUrl, containerId) {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "link_partner", data: { partnerId, profileUrl } } }, () => {
            renderSuccessWithLink(containerId, config.url, partnerId, "added");
        });
    }

    async function addContactToOdoo(contact, containerId) {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "add_contact", data: contact } }, (response) => {
            const partnerId = (response && response.id) ? response.id : response;
            if (partnerId && partnerId > 0) renderSuccessWithLink(containerId, config.url, partnerId, "added");
        });
    }

    const hideExistingToggle = document.getElementById('hide-existing-toggle');
    if (hideExistingToggle) {
        chrome.storage.local.get(['hideExisting'], (res) => {
            if (res.hideExisting) {
                hideExistingToggle.checked = true;
                contactsList.classList.add('hide-existing');
            }
        });
        hideExistingToggle.addEventListener('change', (e) => {
            chrome.storage.local.set({ hideExisting: e.target.checked });
            if (e.target.checked) contactsList.classList.add('hide-existing');
            else contactsList.classList.remove('hide-existing');
        });
    }

    if (toggleDebug) {
        toggleDebug.addEventListener('click', () => {
            debugOutput.classList.toggle('hidden');
            const isHidden = debugOutput.classList.contains('hidden');
            toggleDebug.innerText = chrome.i18n.getMessage(isHidden ? "showDebug" : "hideDebug");
        });
    }
});
