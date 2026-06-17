# OrkaVault 🔐
**The Secure Credential Management OS — PROJXON Internal Platform**

OrkaVault is a premium enterprise password and credential vault. This repository contains both the web platform and the **Desktop Application**.

---

## ⚡ Team Quick Start (Desktop App)
If you are joining the team and want to run the **OrkaVault Desktop App** on your machine, follow these 3 steps:

### 1. Clone & Install
```bash
git clone https://github.com/PROJXON/OrkaVault.git
cd OrkaVault/frontend
npm install
```

### 2. Configure (One-time)
Create a file named `.env` inside the `frontend` folder:
```env
VITE_API_URL=PASTE_YOUR_BACKEND_API_URL_HERE
```

### 3. Launch Desktop App
```bash
npm run electron:dev
```
*Note: You do **not** need to run the backend locally. The app is pre-configured to talk to the live production server!*

---

## 📦 How to Build an Installer (.exe)
If you want to create a standalone installer to share with others:
1. Go to the `frontend` folder.
2. Run `npm run build`.
3. Run `npm run build:electron`.
4. Your installer will be in `frontend/dist-desktop/`.

---

## 🛠️ Tech Stack
| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Electron |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL (Production) · SQLite (Local) |
| **Auth** | JWT Access + Refresh Tokens |

---

## 🛡️ Key Features
- **Role-Based Access Control**: Admin, Manager, and Holder roles with strictly enforced permissions.
- **Time-Limited Reveals**: Single-view (90s), Temporary (24h), and Ongoing access grants.
- **Collection Governance**: Admins assign specific credential collections to Managers.
- **Audit Logging**: Full trail of every access request, approval, and reveal event.
- **Google Authenticator QR**: Secure TOTP QR code reveals with screenshot protection.
- **Premium UI**: Dark mode, glassmorphism, and smooth transitions.

---

## 🏗️ Project Structure
- `backend/`: Express + TypeScript API, Prisma schema, and all route logic.
- `frontend/`: React source code and Electron desktop configuration.
- `frontend/main.cjs`: The desktop app launcher.

---

## 🤝 Contributing
1. Create a feature branch: `git checkout -b your-name/feature`
2. Make your changes and commit: `git commit -m "feat: amazing update"`
3. Push and open a Pull Request!

---
© 2026 Projxon OrkaVault. All rights reserved.
