/**
 * LinkedIn Content Script - Ultra Robust & Stealthy version with Smart Parsing
 */

console.log("LinkedIn Odoo Connector: Smart Stealth Parser Loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "parse_connections") {
        const delay = Math.floor(Math.random() * 500) + 200;
        setTimeout(() => {
            try {
                const contacts = parseLinkedInConnections();
                console.log(`Parser found ${contacts.length} contacts`);
                sendResponse({ contacts });
            } catch (error) {
                console.error("Parser Error:", error);
                sendResponse({ error: error.message, contacts: [] });
            }
        }, delay);
        return true;
    }
});

function parseLinkedInConnections() {
    const contactsMap = new Map();
    // Broad search for profile links
    const allLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
    
    allLinks.forEach(link => {
        try {
            const rawUrl = link.getAttribute('href');
            if (!rawUrl) return;
            
            const fullUrl = rawUrl.startsWith('http') ? rawUrl : `https://www.linkedin.com${rawUrl}`;
            const cleanUrl = fullUrl.split('?')[0].split('#')[0];
            
            // Skip non-profile links
            if (cleanUrl.endsWith('/in/') || cleanUrl.includes('/in/ACoAA') || cleanUrl.includes('miniProfile')) return;

            // Find the container card
            let card = link.closest('li') || 
                       link.closest('.mn-connection-card') ||
                       link.closest('[class*="card"]') ||
                       link.closest('[class*="item"]') ||
                       link.parentElement;

            if (!card || contactsMap.has(cleanUrl)) return;

            // Try multiple selectors for the name (LinkedIn changes classes often)
            const nameEl = card.querySelector([
                'span[dir="ltr"]', 
                '.mn-connection-card__name', 
                '[class*="name"]', 
                'span:not([class])',
                'a[href*="/in/"] > span'
            ].join(', '));

            // Try multiple selectors for the headline/occupation
            const headlineEl = card.querySelector([
                '.mn-connection-card__occupation',
                '[class*="occupation"]',
                '[class*="headline"]',
                '[class*="title"]'
            ].join(', '));

            const imgEl = card.querySelector('img');
            
            const fullName = nameEl ? nameEl.innerText.trim() : "";
            const headline = headlineEl ? headlineEl.innerText.trim() : "";
            const imageUrl = imgEl ? imgEl.src : "";

            // If we don't have a name, try to get it from the link's title or text
            const finalName = fullName || link.innerText.trim();

            if (!finalName || finalName.length < 2) return;

            // --- SMART PARSING ---
            const nameParts = finalName.split(' ');
            const firstName = nameParts[0] || "";
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

            let jobTitle = headline;
            let companyName = "";

            const separators = [
                { sep: " chez " }, { sep: " at " }, { sep: " @ " }, 
                { sep: " | " }, { sep: " - " }
            ];

            for (const item of separators) {
                if (headline.includes(item.sep)) {
                    const parts = headline.split(item.sep);
                    jobTitle = parts[0].trim();
                    companyName = parts.slice(1).join(item.sep).trim();
                    break; 
                }
            }

            contactsMap.set(cleanUrl, {
                name: finalName,
                firstName: firstName,
                lastName: lastName,
                headline: headline,
                jobTitle: jobTitle,
                companyName: companyName,
                profileUrl: cleanUrl,
                imageUrl: imageUrl
            });

        } catch (e) {
            // Silently skip failed cards to keep going
        }
    });

    return Array.from(contactsMap.values());
}
