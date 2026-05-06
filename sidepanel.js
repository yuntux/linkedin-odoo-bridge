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
    const syncSessionBtn = document.getElementById('sync-session');
    const saveSettingsBtn = document.getElementById('save-settings');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    let renderedProfileUrls = new Set();

    // 1. Initial Load & Localization
    localizeUI();
    loadSettings();

    // 2. Navigation & Tabs
    settingsToggle.addEventListener('click', () => {
        if (settingsView.classList.contains('hidden')) {
            settingsView.classList.remove('hidden');
            mainView.classList.add('hidden');
        } else {
            loadSettings(); // Return to main if configured
        }
    });

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.remove('hidden');
        });
    });

    // 3. Authentication Handlers
    syncSessionBtn.addEventListener('click', async () => {
        const url = document.getElementById('session-url').value.trim().replace(/\/$/, "");
        if (!url) return;
        
        syncSessionBtn.disabled = true;
        syncSessionBtn.innerText = chrome.i18n.getMessage("adding");

        chrome.runtime.sendMessage({ 
            action: "odoo_call", 
            params: { config: { url }, method: "init_session" } 
        }, async (response) => {
            if (response && response.uid) {
                await chrome.storage.local.set({ url, db: response.db, username: "", password: "" });
                loadSettings();
            } else {
                alert(chrome.i18n.getMessage("sessionFailed"));
            }
            syncSessionBtn.disabled = false;
            syncSessionBtn.innerText = chrome.i18n.getMessage("syncSession");
        });
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const config = {
            url: document.getElementById('manual-url').value.trim().replace(/\/$/, ""),
            db: document.getElementById('manual-db').value.trim(),
            username: document.getElementById('manual-user').value.trim(),
            password: document.getElementById('manual-pass').value.trim()
        };
        
        await chrome.storage.local.set(config);
        loadSettings();
    });

    // 4. Scan & Live Update Logic
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "new_contacts_auto") {
            const newContacts = request.contacts.filter(c => !renderedProfileUrls.has(c.profileUrl));
            if (newContacts.length > 0) {
                renderContactsSequentially(newContacts, false);
            }
        }
    });

    scanBtn.addEventListener('click', async () => {
        scanBtn.disabled = true;
        scanBtn.style.opacity = '0.5';
        statusMsg.innerText = chrome.i18n.getMessage("scanning");
        
        contactsList.innerHTML = '';
        renderedProfileUrls.clear();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab.url.includes("linkedin.com")) {
            statusMsg.innerHTML = chrome.i18n.getMessage("navigateHint");
            scanBtn.disabled = false;
            scanBtn.style.opacity = '1';
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "parse_connections" }, async (response) => {
            setTimeout(() => { 
                scanBtn.disabled = false; 
                scanBtn.style.opacity = '1';
            }, 3000);

            if (chrome.runtime.lastError || !response) {
                statusMsg.innerText = chrome.i18n.getMessage("loadError");
                return;
            }
            
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
                await renderContactsSequentially(response.contacts, true);
                statusMsg.innerText = chrome.i18n.getMessage("foundContacts", [response.contacts.length.toString()]);
            }
        });
    });

    // 5. UI Helpers
    function getSafeId(str) {
        // Handle unicode characters safely for btoa
        try {
            return 'id-' + btoa(unescape(encodeURIComponent(str))).replace(/[^a-z0-9]/gi, '');
        } catch (e) {
            return 'id-' + Math.random().toString(36).substr(2, 9);
        }
    }

    async function renderContactsSequentially(contacts, clearList = true) {
        if (clearList) {
            contactsList.innerHTML = '';
            renderedProfileUrls.clear();
        }
        if (!contacts || contacts.length === 0) {
            if (clearList) contactsList.innerHTML = `<div class="empty-state">${chrome.i18n.getMessage("noContacts")}</div>`;
            return;
        }

        const contactData = [];
        for (const contact of contacts) {
            if (renderedProfileUrls.has(contact.profileUrl)) continue;
            renderedProfileUrls.add(contact.profileUrl);

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
            try { await checkContact(item.contact, item.cardId, config); } catch (e) {}
            await new Promise(r => setTimeout(r, 100));
        }
    }

    async function loadSettings() {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        if (config.url) {
            mainView.classList.remove('hidden');
            settingsView.classList.add('hidden');
            document.getElementById('session-url').value = config.url;
            document.getElementById('manual-url').value = config.url;
            document.getElementById('manual-db').value = config.db || "";
            document.getElementById('manual-user').value = config.username || "";
            
            // Auto-init session if no password
            if (!config.password) {
                chrome.runtime.sendMessage({ action: "odoo_call", params: { config, method: "init_session" } });
            }
        } else {
            settingsView.classList.remove('hidden');
            mainView.classList.add('hidden');
        }
    }

    function localizeUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = chrome.i18n.getMessage(key);
            if (translation) el.innerHTML = translation;
        });
    }

    // Reuse existing checkContact, linkContactToOdoo, addContactToOdoo, renderSuccessWithLink logic...
    // (I am including them here to ensure the file is complete and overwrite works)
    
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

    // Hide Existing Filter logic
    const hideExistingToggle = document.getElementById('hide-existing-toggle');
    chrome.storage.local.get(['hideExisting'], (res) => {
        if (res.hideExisting && hideExistingToggle) {
            hideExistingToggle.checked = true;
            contactsList.classList.add('hide-existing');
        }
    });
    if (hideExistingToggle) {
        hideExistingToggle.addEventListener('change', (e) => {
            chrome.storage.local.set({ hideExisting: e.target.checked });
            if (e.target.checked) contactsList.classList.add('hide-existing');
            else contactsList.classList.remove('hide-existing');
        });
    }

    toggleDebug.addEventListener('click', () => {
        debugOutput.classList.toggle('hidden');
        const isHidden = debugOutput.classList.contains('hidden');
        toggleDebug.innerText = chrome.i18n.getMessage(isHidden ? "showDebug" : "hideDebug");
    });
});
