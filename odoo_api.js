/**
 * Odoo API Wrapper for LinkedIn Connector
 */
class OdooAPI {
    constructor(url, db, username, password) {
        this.url = url;
        this.db = db;
        this.username = username;
        this.password = password;
        this.uid = null;
        this.csrfToken = null;
        this.isSessionMode = !password;
        this.linkedInField = 'website'; 
        this.isInitializing = false; // Guard to prevent infinite recursion
    }

    async initSession() {
        if (this.isInitializing) return;
        this.isInitializing = true;
        
        try {
            const response = await fetch(`${this.url}/web/session/modules`, { method: 'GET' });
            const cookies = document.cookie;
            const csrfMatch = cookies.match(/csrf_token=([^;]+)/);
            if (csrfMatch) this.csrfToken = csrfMatch[1];

            const sessionInfo = await this.callWeb('/web/session/get_session_info', {});
            if (sessionInfo && sessionInfo.uid) {
                this.uid = sessionInfo.uid;
                this.db = sessionInfo.db;
                
                // Important: detectLinkedInField calls 'call', 
                // but since isInitializing is true, it won't loop back here.
                await this.detectLinkedInField();
                
                return { uid: this.uid, db: this.db };
            }
        } catch (e) {
            console.error("Session Init Error:", e);
        } finally {
            this.isInitializing = false;
        }
        return null;
    }

    async detectLinkedInField() {
        try {
            // Use a direct fetch or ensure this doesn't trigger recursion
            const fields = await this.call('res.partner', 'fields_get', [['linkedin_url'], ['string']]);
            if (fields && fields.linkedin_url) {
                this.linkedInField = 'linkedin_url';
            }
        } catch (e) {
            this.linkedInField = 'website';
        }
    }

    async callWeb(route, params) {
        const response = await fetch(`${this.url}${route}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: "2.0", method: "call", params, id: Math.floor(Math.random() * 1000) })
        });
        const res = await response.json();
        return res.result;
    }

    async call(model, method, args, kwargs = {}) {
        // Only trigger initSession if not already initializing and no token
        if (this.isSessionMode && !this.csrfToken && !this.isInitializing) {
            await this.initSession();
        }

        const payload = {
            jsonrpc: "2.0",
            method: "call",
            params: {
                model,
                method,
                args,
                kwargs,
                context: { "lang": "fr_FR" }
            },
            id: Math.floor(Math.random() * 1000)
        };

        const endpoint = this.isSessionMode ? `${this.url}/web/dataset/call_kw` : `${this.url}/jsonrpc`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.csrfToken) headers['X-CSRF-Token'] = this.csrfToken;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        const res = await response.json();
        if (res.error) throw new Error(res.error.data ? res.error.data.message : res.error.message);
        return res.result;
    }

    async findBestMatch(contact) {
        const certain = await this.call('res.partner', 'search_read', [
            [[this.linkedInField, '=', contact.profileUrl]],
            ['id', 'name']
        ]);
        if (certain.length > 0) return { status: 'certain', partner: certain[0] };

        const potential = await this.call('res.partner', 'search_read', [
            [['name', 'ilike', contact.name], ['is_company', '=', false]],
            ['id', 'name', 'function', 'parent_id']
        ]);
        
        if (potential.length > 0) {
            const match = potential[0];
            const odooCompanyName = match.parent_id ? match.parent_id[1] : "";
            if (contact.companyName && odooCompanyName && 
                (odooCompanyName.toLowerCase().includes(contact.companyName.toLowerCase()) || 
                 contact.companyName.toLowerCase().includes(odooCompanyName.toLowerCase()))) {
                return { status: 'likely', partner: match };
            }
            return { status: 'potential', partner: match };
        }
        return null;
    }

    async findCompanyByName(name) {
        if (!name) return null;
        const companies = await this.call('res.partner', 'search_read', [
            [['is_company', '=', true], ['name', 'ilike', name]],
            ['id']
        ]);
        return companies.length > 0 ? companies[0].id : null;
    }

    async updatePartnerLinkedIn(partnerId, profileUrl) {
        const vals = {};
        vals[this.linkedInField] = profileUrl;
        return await this.call('res.partner', 'write', [[partnerId], vals]);
    }

    async createContact(contact) {
        const companyId = await this.findCompanyByName(contact.companyName);
        const vals = {
            name: contact.name,
            function: contact.jobTitle,
            comment: contact.companyName ? `Entreprise LinkedIn: ${contact.companyName}\n${contact.headline}` : contact.headline,
            is_company: false
        };
        vals[this.linkedInField] = contact.profileUrl;
        if (companyId) vals.parent_id = companyId;
        return await this.call('res.partner', 'create', [vals]);
    }
}
