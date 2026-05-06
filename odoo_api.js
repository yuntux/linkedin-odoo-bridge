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
            if (this.isSessionMode) {
                const response = await fetch(`${this.url}/web/session/modules`, { method: 'GET' });
                const cookies = document.cookie;
                const csrfMatch = cookies.match(/csrf_token=([^;]+)/);
                if (csrfMatch) this.csrfToken = csrfMatch[1];

                const sessionInfo = await this.callWeb('/web/session/get_session_info', {});
                if (sessionInfo && sessionInfo.uid) {
                    this.uid = sessionInfo.uid;
                    this.db = sessionInfo.db;
                }
            } else {
                const res = await this.call('common', 'login', [this.db, this.username, this.password]);
                if (res) this.uid = res;
            }

            if (this.uid) {
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
        console.log("Odoo Connector: Detecting partner fields...");
        try {
            const liFields = await this.call('res.partner', 'fields_get', [['linkedin_url'], ['type']]);
            this.linkedInField = (liFields && liFields.linkedin_url) ? 'linkedin_url' : 'website';
        } catch (e) {
            this.linkedInField = 'website';
        }

        try {
            const fnFields = await this.call('res.partner', 'fields_get', [['first_name'], ['type']]);
            this.hasFirstName = !!(fnFields && fnFields.first_name);
        } catch (e) {
            this.hasFirstName = false;
        }
        console.log(`Odoo Connector: Final Config -> linkedin_field: ${this.linkedInField}, has_first_name: ${this.hasFirstName}`);
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
        if (!this.uid && !this.isInitializing) {
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

    async ensureInitialized() {
        if (!this.uid && !this.isInitializing) {
            await this.initSession();
        }
    }

    async findBestMatch(contact) {
        await this.ensureInitialized();

        const certain = await this.call('res.partner', 'search_read', [
            [[this.linkedInField, '=', contact.profileUrl]],
            ['id', 'name']
        ]);
        if (certain.length > 0) return { status: 'certain', partner: certain[0] };

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
            const matches = potential.map(p => {
                const odooCompanyName = p.parent_id ? p.parent_id[1] : "";
                const isLikely = contact.company && odooCompanyName &&
                    (odooCompanyName.toLowerCase().includes(contact.company.toLowerCase()) ||
                        contact.company.toLowerCase().includes(odooCompanyName.toLowerCase()));
                return { partner: p, status: isLikely ? 'likely' : 'potential' };
            });
            matches.sort((a, b) => (a.status === 'likely' ? -1 : 1));
            return { status: 'multi', matches: matches };
        }
        return { status: 'none' };
    }

    async linkPartner(partnerId, profileUrl) {
        await this.ensureInitialized();
        const vals = {};
        vals[this.linkedInField] = profileUrl;
        await this.call('res.partner', 'write', [[partnerId], vals]);
        return partnerId;
    }

    async createPartner(contact) {
        await this.ensureInitialized();
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
