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
        this.hasFirstName = false;
        this.isInitializing = false;
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

                await this.detectPartnerFields();

                return { uid: this.uid, db: this.db };
            }
        } catch (e) {
            console.error("Session Init Error:", e);
        } finally {
            this.isInitializing = false;
        }
        return null;
    }

    async detectPartnerFields() {
        try {
            // Detect all special fields in one go to minimize RPC calls
            const fields = await this.call('res.partner', 'fields_get', [['linkedin_url', 'first_name'], ['string']]);

            if (fields && fields.linkedin_url) {
                this.linkedInField = 'linkedin_url';
            } else {
                this.linkedInField = 'website';
            }

            this.hasFirstName = !!(fields && fields.first_name);
        } catch (e) {
            this.linkedInField = 'website';
            this.hasFirstName = false;
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
        if (this.isSessionMode && !this.csrfToken && !this.isInitializing) {
            await this.initSession();
        }

        const payload = {
            jsonrpc: "2.0",
            method: "call",
            params: {
                model, method, args, kwargs,
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
        // Ensure fields are detected if not already done
        if (this.linkedInField === 'website' && !this.isInitializing && this.uid) {
            // Optional: lazy re-check if needed, but initSession handles it
        }

        // Level 1: Certain Match by URL
        const certain = await this.call('res.partner', 'search_read', [
            [[this.linkedInField, '=', contact.profileUrl]],
            ['id', 'name']
        ]);
        if (certain.length > 0) return { status: 'certain', partner: certain[0] };

        // Level 2: Likely/Potential Match by Name components
        let domain = [['is_company', '=', false]];
        if (this.hasFirstName) {
            domain.push(['first_name', 'ilike', contact.firstName]);
            domain.push(['name', 'ilike', contact.lastName]);
        } else {
            domain.push(['name', 'ilike', contact.name]);
        }

        const potential = await this.call('res.partner', 'search_read', [
            domain,
            ['id', 'name', 'function', 'parent_id']
        ]);

        if (potential.length > 0) {
            // Process each match to see if it's 'likely' or just 'potential'
            const matches = potential.map(p => {
                const odooCompanyName = p.parent_id ? p.parent_id[1] : "";
                const isLikely = contact.company && odooCompanyName &&
                    (odooCompanyName.toLowerCase().includes(contact.company.toLowerCase()) ||
                        contact.company.toLowerCase().includes(odooCompanyName.toLowerCase()));
                
                return { 
                    partner: p, 
                    status: isLikely ? 'likely' : 'potential' 
                };
            });

            // Sort matches so that 'likely' ones appear first
            matches.sort((a, b) => (a.status === 'likely' ? -1 : 1));

            return { status: 'multi', matches: matches };
        }

        return { status: 'none' };
    }

    async findPartnerByProfile(profileUrl) {
        const partners = await this.call('res.partner', 'search_read', [
            [[this.linkedInField, '=', profileUrl]],
            ['id', 'name']
        ]);
        return partners.length > 0 ? partners[0] : null;
    }

    async linkPartner(partnerId, profileUrl) {
        const vals = {};
        vals[this.linkedInField] = profileUrl;
        return await this.call('res.partner', 'write', [[partnerId], vals]);
    }

    async createPartner(contact) {
        const vals = {
            function: contact.position,
            comment: contact.company ? `Entreprise LinkedIn: ${contact.company}` : "",
            is_company: false
        };
        vals[this.linkedInField] = contact.profileUrl;

        if (this.hasFirstName) {
            vals.first_name = contact.firstName;
            vals.name = contact.lastName || contact.firstName;
        } else {
            vals.name = contact.name;
        }

        return await this.call('res.partner', 'create', [vals]);
    }
}
