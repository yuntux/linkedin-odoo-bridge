/**
 * LinkedIn Content Script - Deep Text Extraction
 */

console.log("LinkedIn Odoo Connector: Parser v1.4 (Deep Extraction)");

// Global set to track already sent profiles to avoid duplicates in auto-scan
let seenProfileUrls = new Set();
let autoScanObserver = null;

function startAutoScan() {
    if (autoScanObserver) return;
    
    const targetNode = document.querySelector('.scaffold-layout__main') || document.body;
    autoScanObserver = new MutationObserver((mutations) => {
        const result = parseLinkedInConnections();
        const newContacts = result.contacts.filter(c => !seenProfileUrls.has(c.profileUrl));
        
        if (newContacts.length > 0) {
            newContacts.forEach(c => seenProfileUrls.add(c.profileUrl));
            chrome.runtime.sendMessage({ 
                action: "new_contacts_auto", 
                contacts: newContacts 
            });
        }
    });

    autoScanObserver.observe(targetNode, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "parse_connections") {
        try {
            const result = parseLinkedInConnections();
            // Update seen set when manual scan is done
            result.contacts.forEach(c => seenProfileUrls.add(c.profileUrl));
            sendResponse(result);
            
            // Start auto-scan if not already started
            startAutoScan();
        } catch (error) {
            sendResponse({ error: error.message, contacts: [] });
        }
        return true;
    }
});

function parseLinkedInConnections() {
    const contactsMap = new Map();
    const allLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
    
    allLinks.forEach((link) => {
        try {
            const rawUrl = link.getAttribute('href');
            if (!rawUrl) return;
            
            const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.linkedin.com${rawUrl}`;
            const cleanUrl = fullUrl.split('?')[0].split('#')[0];
            if (cleanUrl.endsWith('/in/') || cleanUrl.includes('/in/ACoAA')) return;

            let card = link.closest('.mn-connection-card') || 
                       link.closest('li') || 
                       link.closest('.artdeco-entity-lockup') ||
                       link.parentElement.closest('div');

            if (!card || contactsMap.has(cleanUrl)) return;

            // 1. EXTRACTION DU NOM (Via ALT Image)
            let name = "";
            const img = card.querySelector('img');
            if (img && img.alt) {
                name = img.alt.trim()
                          .replace(/Photo de profil de /i, "")
                          .replace(/'s profile picture/i, "")
                          .trim();
            }

            // 2. EXTRACTION DU TITRE (Headline)
            // On cherche n'importe quelle balise qui contient du texte et qui n'est pas le nom
            let rawHeadline = "";
            const potentialHeadlines = card.querySelectorAll('span, div, p');
            for (let el of potentialHeadlines) {
                const txt = el.innerText.trim();
                // Si c'est un texte de longueur raisonnable et que ce n'est pas le nom
                if (txt && txt.length > 5 && txt !== name && !txt.includes('\n') && txt.length < 150) {
                    rawHeadline = txt;
                    break;
                }
            }

            // Logique de découpage
            let position = rawHeadline;
            let company = "";
            const separators = [/\s+chez\s+/i, /\s+at\s+/i, /\s*\|\s*/, /\s+@\s+/, /\s*-\s*/];

            for (let sep of separators) {
                const parts = rawHeadline.split(sep);
                if (parts.length > 1) {
                    position = parts[0].trim();
                    company = parts.slice(1).join(" ").trim();
                    break;
                }
            }

            if (name && name !== "LinkedIn Member") {
                const nameParts = name.split(' ');
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ') || firstName;

                contactsMap.set(cleanUrl, {
                    name,
                    firstName,
                    lastName,
                    position,
                    company,
                    profileUrl: cleanUrl,
                    imageUrl: img ? img.src : ""
                });
            }
        } catch (e) { }
    });

    return { 
        contacts: Array.from(contactsMap.values()),
        debugCount: allLinks.length 
    };
}
