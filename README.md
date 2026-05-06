# LinkedIn to Odoo Connector

Une extension de navigateur (Chrome/Firefox) permettant de synchroniser vos relations LinkedIn vers votre instance Odoo 18 en temps réel avec une gestion avancée des doublons et des noms.

## 🚀 Fonctionnalités

- **Auto-Scan en temps réel** : Les contacts LinkedIn s'ajoutent automatiquement à votre panneau latéral au fur et à mesure de votre défilement (scroll).
- **Matching Intelligent** : Détection automatique des doublons via 3 niveaux (URL LinkedIn, Nom/Prénom + Entreprise, Homonymes).
- **Lien Direct Odoo** : Accédez à la fiche contact Odoo en un clic pour vérification.
- **Support Multi-Versions** : Compatible avec les configurations Odoo standards ou avec le module `partner_firstname`.
- **Rendu Premium** : Interface fluide, moderne et localisée (FR/EN).

## 🛡 Sécurité & Furtivité (Important)

L'extension a été conçue pour être la plus discrète possible afin de protéger votre compte LinkedIn :

1. **Lecture Passive** : L'extension ne fait **aucun appel réseau vers LinkedIn**. Elle extrait les données localement depuis le code HTML de votre navigateur.
2. **Aucune Automatisation** : Elle ne simule pas de clics et ne force pas le défilement. Elle réagit uniquement à vos actions naturelles.

### 💡 Consignes d'utilisation
- **Vitesse Humaine** : Ne faites pas défiler des centaines de contacts en quelques secondes.
- **Sessions Naturelles** : Évitez de scanner l'intégralité de vos relations en une seule session.

## 🛠 Installation Technique

### 1. Côté Odoo (Pré-requis)
L'extension est flexible et s'adapte à votre installation :
- **Champ LinkedIn** : Si un champ technique `linkedin_url` (Char) existe sur `res.partner`, l'extension l'utilisera par défaut. Sinon, elle utilisera le champ `website`.
- **Gestion des Noms** : 
    - Si le module `partner_firstname` est installé (présence du champ `first_name`), l'extension séparera automatiquement le Prénom et le Nom.
    - Sinon, le nom complet est envoyé dans le champ `name`.
- **Permissions** : L'utilisateur Odoo doit avoir les droits de lecture/écriture sur les contacts (`res.partner`).

### 2. Côté Navigateur
1. Accédez à la page des extensions :
   - Chrome : `chrome://extensions`
   - Firefox : `about:debugging`
2. Activez le **Mode Développeur**.
3. Cliquez sur **Charger l'extension non empaquetée** (Chrome) ou **Charger un module temporaire** (Firefox).
4. Sélectionnez le dossier `linkedin-odoo-bridge`.

## ⚙️ Configuration de l'extension

Lors de la première utilisation, renseignez :
- **URL Odoo** : L'adresse complète (ex: `https://mon-odoo.com`).
- **Base de données** : Le nom technique de la DB.
- **Authentification** :
    - **Session** : Utilisez votre session active (si vous êtes déjà connecté à Odoo sur le même navigateur).
    - **Mot de passe** : Utilisez votre login et un **Mot de passe d'application / Clé API**.

## 🧩 Structure du Projet
- `content.js` : Parser LinkedIn & Auto-scan.
- `sidepanel.js` : Logique d'interface et orchestration.
- `odoo_api.js` : Wrapper de communication JSON-RPC avec Odoo.
- `background.js` : Proxy pour les appels Odoo et la récupération d'images.

---
*Développé pour Odoo 18.0 Community & Enterprise.*
