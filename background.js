// importScripts('odoo_api.js'); // Not needed if loaded via manifest.json scripts array

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "odoo_call") {
        handleOdooCall(request.params).then(sendResponse).catch(err => sendResponse({ error: err.message }));
        return true; 
    }
});

async function handleOdooCall(params) {
    const { config, method, data } = params;
    const api = new OdooAPI(config.url, config.db, config.username, config.password);
    
    if (!config.password) {
        api.isSessionMode = true;
    }

    try {
        switch (method) {
            case 'init_session':
                return await api.initSession();
            case 'check_contact':
                return await api.findPartnerByProfile(data.profileUrl);
            case 'add_contact':
                return await api.createPartner({
                    name: data.name,
                    website: data.profileUrl,
                    function: data.headline,
                    comment: `LinkedIn Sync: ${data.profileUrl}`
                });
            default:
                throw new Error("Unknown method");
        }
    } catch (e) {
        console.error("Background Odoo Error:", e);
        throw e;
    }
}
