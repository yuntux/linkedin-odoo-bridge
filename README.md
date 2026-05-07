# LinkedIn to Odoo Connector

A browser extension (Chrome/Firefox) to synchronize your LinkedIn connections to your Odoo 18 instance in real-time, with advanced duplicate and name management.

## 🚀 Features

- **Real-time Auto-Scan**: LinkedIn contacts are automatically added to your sidepanel as you scroll through the page.
- **Smart Matching**: Automatic duplicate detection via 3 levels (LinkedIn URL, Name/Firstname + Company, Homonyms).
- **Direct Odoo Link**: Access the Odoo contact form in one click for verification.
- **Multi-Version Support**: Compatible with standard Odoo configurations or with the `partner_firstname` module.
- **Premium Rendering**: Smooth, modern, and localized (EN/FR/DE/ES/IT/PT/ZH) interface.

## 🛡 Security & Stealth (Important)

The extension was designed to be as discreet as possible to protect your LinkedIn account:

1. **Passive Reading**: The extension makes **no network calls to LinkedIn**. It extracts data locally from your browser's HTML code.
2. **No Automation**: It does not simulate clicks and does not force scrolling. It only reacts to your natural actions.

### 💡 Usage Guidelines
- **Human Speed**: Do not scroll through hundreds of contacts in a few seconds.
- **Natural Sessions**: Avoid scanning all your connections in a single session.

## 🛠 Technical Installation

### 1. Odoo Side (Prerequisites)
The extension is flexible and adapts to your setup:
- **LinkedIn Field**: If a technical field `linkedin_url` (Char) exists on `res.partner`, the extension will use it by default. Otherwise, it will use the `website` field.
- **Name Management**: 
    - If the `partner_firstname` module is installed (presence of the `first_name` field), the extension will automatically separate the First Name and Last Name.
    - Otherwise, the full name is sent to the `name` field.
- **Permissions**: The Odoo user must have read/write rights on contacts (`res.partner`).

### 2. Browser Side
1. Go to the extensions page:
   - Chrome: `chrome://extensions`
   - Firefox: `about:debugging`
2. Enable **Developer Mode**.
3. Click on **Load unpacked** (Chrome) or **Load temporary Add-on** (Firefox).
4. Select the `linkedin-odoo-bridge` folder.

## ⚙️ Extension Configuration

During the first use, provide:
- **Odoo URL**: The full address (e.g., `https://my-odoo.com`).
- **Database**: The technical name of the DB.
- **Authentication**:
    - **Session**: Use your active session (if you are already logged into Odoo in the same browser).
    - **Password**: Use your login and an **App Password / API Key**.

## 🧩 Project Structure
- `content.js`: LinkedIn parser & Auto-scan.
- `sidepanel.js`: UI logic and orchestration.
- `odoo_api.js`: JSON-RPC communication wrapper for Odoo.
- `background.js`: Proxy for Odoo calls and image retrieval.

---
*Developed for Odoo 18.0 Community & Enterprise.*
