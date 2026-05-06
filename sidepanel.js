document.addEventListener('DOMContentLoaded', async () => {
    // Internationalization helper
    function translateUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const message = chrome.i18n.getMessage(key);
            if (message) el.innerHTML = message;
        });
    }
    translateUI();

    const setupView = document.getElementById('setup-view');
    const manualView = document.getElementById('manual-view');
    const mainView = document.getElementById('main-view');
    const settingsToggle = document.getElementById('settings-toggle');
    const scanBtn = document.getElementById('scan-btn');
    const contactsList = document.getElementById('contacts-list');
    const statusMsg = document.getElementById('status-msg');
    const debugOutput = document.getElementById('debug-output');
    const toggleDebug = document.getElementById('toggle-debug');

    // Initial State Check
    const config = await chrome.storage.local.get(['url', 'db', 'username', 'password', 'authMode']);
    if (config.url) {
        tryAutoConnect(config);
    } else {
        showView('setup');
    }

    async function tryAutoConnect(cfg) {
        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config: cfg, method: "init_session" }
        }, (response) => {
            if (response && response.uid) {
                showView('main');
            } else {
                showView('setup');
                document.getElementById('setup-url').value = cfg.url || '';
            }
        });
    }

    function showView(viewName) {
        setupView.classList.add('hidden');
        manualView.classList.add('hidden');
        mainView.classList.add('hidden');
        settingsToggle.classList.add('hidden');

        if (viewName === 'setup') setupView.classList.remove('hidden');
        if (viewName === 'manual') manualView.classList.remove('hidden');
        if (viewName === 'main') {
            mainView.classList.remove('hidden');
            settingsToggle.classList.remove('hidden');
        }
    }

    function cleanUrl(rawUrl) {
        try {
            const urlObj = new URL(rawUrl.trim());
            return urlObj.origin;
        } catch (e) {
            return rawUrl.trim();
        }
    }

    // Onboarding Events
    document.getElementById('setup-connect').addEventListener('click', async () => {
        let url = document.getElementById('setup-url').value;
        url = cleanUrl(url);
        
        if (!url) return alert("Please enter your Odoo URL.");

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config: { url }, method: "init_session" }
        }, async (response) => {
            if (response && response.uid) {
                await chrome.storage.local.set({ url, authMode: 'session', password: '' });
                showView('main');
                redirectToLinkedIn();
            } else {
                alert(chrome.i18n.getMessage("sessionFailed"));
            }
        });
    });

    document.getElementById('show-manual').addEventListener('click', () => showView('manual'));
    document.getElementById('back-to-setup').addEventListener('click', () => showView('setup'));

    document.getElementById('manual-save').addEventListener('click', async () => {
        const url = cleanUrl(document.getElementById('manual-url').value);
        const newConfig = {
            url: url,
            db: document.getElementById('manual-db').value.trim(),
            username: document.getElementById('manual-user').value.trim(),
            password: document.getElementById('manual-pass').value.trim(),
            authMode: 'password'
        };
        await chrome.storage.local.set(newConfig);
        showView('main');
    });

    settingsToggle.addEventListener('click', () => showView('setup'));

    async function redirectToLinkedIn() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const targetUrl = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
        if (tab && !tab.url.includes("linkedin.com/mynetwork/invite-connect/connections")) {
            chrome.tabs.update(tab.id, { url: targetUrl });
        }
    }

    // Scan Logic
    scanBtn.addEventListener('click', async () => {
        if (scanBtn.disabled) return;
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url.includes("linkedin.com/mynetwork/invite-connect/connections")) {
            statusMsg.innerHTML = chrome.i18n.getMessage("navigateHint");
            return;
        }

        scanBtn.disabled = true;
        scanBtn.style.opacity = '0.5';
        statusMsg.innerText = chrome.i18n.getMessage("scanning");

        chrome.tabs.sendMessage(tab.id, { action: "parse_connections" }, async (response) => {
            setTimeout(() => { 
                scanBtn.disabled = false; 
                scanBtn.style.opacity = '1';
            }, 3000);

            if (chrome.runtime.lastError || !response) {
                statusMsg.innerText = chrome.i18n.getMessage("loadError");
                return;
            }
            
            // Fetch Odoo Config for Debug
            const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
            chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "get_config" } }, (odooCfg) => {
                if (debugOutput) {
                    debugOutput.innerText = `--- ODOO CONFIG ---\n` +
                                         `LinkedIn Field: ${odooCfg?.linkedInField || 'unknown'}\n` +
                                         `Has First Name: ${odooCfg?.hasFirstName || 'false'}\n\n` +
                                         `--- SCAN STATS ---\n` +
                                         `Raw Links Found: ${response.debugCount || 0}\n` + 
                                         `Contacts Parsed: ${response.contacts ? response.contacts.length : 0}\n` +
                                         `JSON:\n${JSON.stringify(response.contacts, null, 2)}`;
                }
            });

            if (response.contacts) {
                await renderContactsSequentially(response.contacts);
                statusMsg.innerText = chrome.i18n.getMessage("foundContacts", [response.contacts.length.toString()]);
            }
        });
    });

    toggleDebug.addEventListener('click', () => {
        debugOutput.classList.toggle('hidden');
        const isHidden = debugOutput.classList.contains('hidden');
        toggleDebug.innerText = chrome.i18n.getMessage(isHidden ? "showDebug" : "hideDebug");
    });

    function getSafeId(str) {
        return 'id-' + btoa(str).replace(/[^a-z0-9]/gi, '');
    }

    async function renderContactsSequentially(contacts) {
        contactsList.innerHTML = '';
        if (!contacts || contacts.length === 0) {
            contactsList.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage("noContacts")}</div>`;
            return;
        }

        const contactData = [];
        for (const contact of contacts) {
            const cardId = getSafeId(contact.profileUrl);
            const imgId = `img-${cardId}`;
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
                        <span class="loading-text">${chrome.i18n.getMessage("checkingOdoo")}</span>
                    </div>
                </div>
            `;
            contactsList.appendChild(card);
            contactData.push({ contact, cardId, imgId });
            
            // Fetch image in background to bypass CSP
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

        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        for (const item of contactData) {
            try {
                await checkContact(item.contact, item.cardId, config);
            } catch (e) {
                console.error("Sequence Error:", e);
            }
            await new Promise(r => setTimeout(r, 100));
        }
    }

    function checkContact(contact, containerId, config) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "odoo_call",
                params: { config, method: "find_best_match", data: contact }
            }, (response) => {
                const container = document.getElementById(containerId);
                if (container) {
                    container.innerHTML = '';
                    if (response && response.status === 'certain') {
                        container.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("certainMatch")}</span>`;
                    } else if (response && response.status === 'multi') {
                        let matchesHtml = '';
                        const odooUrl = config.url;
                        response.matches.forEach((m, idx) => {
                            const partnerName = m.partner.name;
                            const companyName = m.partner.parent_id ? ` (${m.partner.parent_id[1]})` : "";
                            const msgKey = m.status === 'likely' ? "likelyMatch" : "potentialMatch";
                            const btnId = `link-${containerId}-${idx}`;
                            const partnerUrl = `${odooUrl}/web#id=${m.partner.id}&model=res.partner&view_type=form`;
                            
                            matchesHtml += `
                                <div class="match-row ${m.status}">
                                    <div class="match-info-text">
                                        <p class="match-status">${chrome.i18n.getMessage(msgKey, [partnerName])}${companyName}</p>
                                        <a href="${partnerUrl}" target="_blank" class="odoo-link">Voir dans Odoo ↗</a>
                                    </div>
                                    <button class="action-btn link small" id="${btnId}">${chrome.i18n.getMessage("linkBtn")}</button>
                                </div>
                            `;
                        });

                        container.innerHTML = `
                            <div class="match-box multi">
                                ${matchesHtml}
                                <div class="match-footer">
                                    <button class="action-btn add-anyway" id="add-${containerId}">${chrome.i18n.getMessage("createAnywayBtn")}</button>
                                </div>
                            </div>
                        `;

                        response.matches.forEach((m, idx) => {
                            document.getElementById(`link-${containerId}-${idx}`).onclick = () => linkContactToOdoo(m.partner.id, contact.profileUrl, containerId);
                        });
                        document.getElementById(`add-${containerId}`).onclick = () => addContactToOdoo(contact, containerId);
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
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = `<span>${chrome.i18n.getMessage("adding")}</span>`;

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config, method: "link_partner", data: { partnerId, profileUrl } }
        }, (response) => {
            const currentContainer = document.getElementById(containerId);
            if (currentContainer) {
                currentContainer.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("added")}</span>`;
            }
        });
    }

    async function addContactToOdoo(contact, containerId) {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `<span>${chrome.i18n.getMessage("adding")}</span>`;

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config, method: "add_contact", data: contact }
        }, (response) => {
            const currentContainer = document.getElementById(containerId);
            if (!currentContainer) return;

            if (response && (response > 0 || response.id)) {
                currentContainer.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("added")}</span>`;
            } else {
                currentContainer.innerHTML = `<span class="error-text">${chrome.i18n.getMessage("error")}</span>`;
            }
        });
    }
});
