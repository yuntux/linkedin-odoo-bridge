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
    const hideExistsCheck = document.getElementById('hide-exists');

    // Initial State Check
    const config = await chrome.storage.local.get(['url', 'db', 'username', 'password', 'authMode', 'hideExists']);
    if (config.hideExists !== undefined) hideExistsCheck.checked = config.hideExists;
    
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
                const setupUrlInput = document.getElementById('setup-url');
                if (setupUrlInput) setupUrlInput.value = cfg.url || '';
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

    hideExistsCheck.addEventListener('change', async () => {
        await chrome.storage.local.set({ hideExists: hideExistsCheck.checked });
        applyFilters();
    });

    function applyFilters() {
        const hide = hideExistsCheck.checked;
        const cards = document.querySelectorAll('.contact-card');
        cards.forEach(card => {
            const isExisting = card.hasAttribute('data-exists');
            if (hide && isExisting) {
                card.classList.add('hidden');
            } else {
                card.classList.remove('hidden');
            }
        });
    }

    async function redirectToLinkedIn() {
        const targetUrl = "https://www.linkedin.com/mynetwork/invite-connect/connections/";
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab && tab.url && tab.url.startsWith('http')) {
            if (!tab.url.includes("linkedin.com/mynetwork/invite-connect/connections")) {
                chrome.tabs.update(tab.id, { url: targetUrl });
            }
        } else {
            // If on a restricted page (like chrome://) or no tab, create new
            chrome.tabs.create({ url: targetUrl });
        }
    }

    // Scan Logic
    scanBtn.addEventListener('click', async () => {
        if (scanBtn.disabled) return;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url || !tab.url.includes("linkedin.com/mynetwork/invite-connect/connections")) {
            if (statusMsg) statusMsg.innerHTML = chrome.i18n.getMessage("navigateHint");
            return;
        }

        scanBtn.disabled = true;
        scanBtn.style.opacity = '0.5';
        if (statusMsg) statusMsg.innerText = chrome.i18n.getMessage("scanning");

        chrome.tabs.sendMessage(tab.id, { action: "parse_connections" }, async (response) => {
            setTimeout(() => { 
                scanBtn.disabled = false; 
                scanBtn.style.opacity = '1';
            }, 3000);

            if (chrome.runtime.lastError || !response) {
                if (statusMsg) statusMsg.innerText = chrome.i18n.getMessage("loadError");
                return;
            }
            await renderContactsSequentially(response.contacts);
            if (statusMsg) statusMsg.innerText = chrome.i18n.getMessage("foundContacts", [response.contacts.length.toString()]);
        });
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
            const card = document.createElement('div');
            card.className = 'contact-card';
            card.id = `card-${cardId}`; 
            card.innerHTML = `
                <img src="${contact.imageUrl || ''}" class="contact-img" alt="">
                <div class="contact-info">
                    <p class="contact-name">${contact.name}</p>
                    <p class="contact-headline">${contact.headline}</p>
                    <div class="contact-actions" id="${cardId}">
                        <span class="loading-text">${chrome.i18n.getMessage("checkingOdoo")}</span>
                    </div>
                </div>
            `;
            contactsList.appendChild(card);
            contactData.push({ contact, cardId });
        }

        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        for (const item of contactData) {
            await checkContact(item.contact, item.cardId, config);
            await new Promise(r => setTimeout(r, 50));
        }
    }

    function checkContact(contact, containerId, config) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "odoo_call",
                params: { config, method: "find_best_match", data: contact }
            }, (response) => {
                const container = document.getElementById(containerId);
                const card = document.getElementById(`card-${containerId}`);
                if (container && card) {
                    container.innerHTML = '';
                    if (response && response.status === 'certain') {
                        card.setAttribute('data-exists', 'true');
                        container.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("exists", [response.partner.id.toString()])}</span>`;
                        if (hideExistsCheck.checked) card.classList.add('hidden');
                    } else if (response && (response.status === 'potential' || response.status === 'likely')) {
                        const matchBtn = document.createElement('button');
                        matchBtn.className = `action-btn potential ${response.status}`;
                        matchBtn.innerText = chrome.i18n.getMessage("potentialMatch", [response.partner.id.toString()]);
                        matchBtn.onclick = () => confirmLinkContact(contact, response.partner, containerId);
                        container.appendChild(matchBtn);
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

    async function confirmLinkContact(contact, partner, containerId) {
        const confirmed = confirm(`${chrome.i18n.getMessage("isThisThem")}\n\n${partner.name}\n${partner.function || ""}`);
        if (!confirmed) return;

        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        const container = document.getElementById(containerId);
        const card = document.getElementById(`card-${containerId}`);
        if (container) container.innerHTML = `<span>...</span>`;

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config, method: "update_partner_linkedin", data: { partnerId: partner.id, profileUrl: contact.profileUrl } }
        }, (response) => {
            if (response) {
                if (card) card.setAttribute('data-exists', 'true');
                if (container) container.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("linked")}</span>`;
                if (hideExistsCheck.checked) setTimeout(() => { if (card) card.classList.add('hidden'); }, 1000);
            }
        });
    }

    async function addContactToOdoo(contact, containerId) {
        const config = await chrome.storage.local.get(['url', 'db', 'username', 'password']);
        const container = document.getElementById(containerId);
        const card = document.getElementById(`card-${containerId}`);
        if (!container) return;
        
        container.innerHTML = `<span>${chrome.i18n.getMessage("adding")}</span>`;

        chrome.runtime.sendMessage({
            action: "odoo_call",
            params: { config, method: "add_contact", data: contact }
        }, (response) => {
            const currentContainer = document.getElementById(containerId);
            if (!currentContainer) return;

            if (response && (response > 0 || response.id)) {
                if (card) card.setAttribute('data-exists', 'true');
                currentContainer.innerHTML = `<span class="action-btn exists">${chrome.i18n.getMessage("added")}</span>`;
                if (hideExistsCheck.checked) setTimeout(() => { if (card) card.classList.add('hidden'); }, 1000);
            } else {
                currentContainer.innerHTML = `<span class="error-text">${chrome.i18n.getMessage("error")}</span>`;
            }
        });
    }
});
