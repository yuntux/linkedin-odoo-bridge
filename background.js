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
    if (request.action === "fetch_image") {
        fetchImageAsBase64(request.url).then(sendResponse).catch(() => sendResponse({ error: "img_failed" }));
        return true;
    }
});

async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({ data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Image proxy error:", e);
        throw e;
    }
}

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
