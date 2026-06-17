# OrkaVault

> **OrkaVault** is a secure, enterprise-grade password and credential management platform built for internal teams. It features role-based access control, time-limited secret reveals, audit logging, collection-based access governance, and a desktop Electron client.

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + Vite + Electron          |
| Backend   | Node.js + Express + TypeScript      |
| Database  | PostgreSQL (via Prisma ORM)         |
| Auth      | JWT (Access + Refresh Tokens)       |
| Storage   | Local Uploads / Cloud-Ready         |

---

## Features

- 🔐 **Role-Based Access Control** — Admin, Manager, Holder roles with enforced permissions
- ⏱ **Time-Limited Secret Reveals** — Single-view (90s), Temporary (24h), and Ongoing grants
- 📁 **Collection-Based Governance** — Admins assign specific collections to Managers
- 📋 **Audit Logging** — Full trail of access requests and approvals
- 🔔 **In-App Notifications** — Real-time alerts for access requests and approvals
- 📱 **Google Authenticator QR** — Secure TOTP QR code reveal with screenshot protection
- 🩺 **Health Audit Dashboard** — Password strength and rotation compliance monitoring
- 🖥 **Electron Desktop App** — Full-featured cross-platform desktop client

---

## Project Structure

```
OrkaVault/
├── backend/          # Express + TypeScript API server
│   ├── prisma/       # Database schema and migrations
│   ├── src/
│   │   ├── routes/   # API route handlers
│   │   ├── middleware/
│   │   └── services/
│   └── package.json
│
└── frontend/         # React + Vite + Electron client
    ├── src/
    │   ├── pages/    # Application pages
    │   ├── components/
    │   └── lib/      # API client, auth context
    └── package.json
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (or a free [Neon](https://neon.tech) instance)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env   # Fill in your DATABASE_URL, JWT_SECRET, etc.
npx prisma db push
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env   # Add VITE_API_URL if deploying to production
npm run dev            # Web app at http://localhost:3000
# OR
npm run electron:dev   # Desktop app via Electron
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable        | Description                         |
|-----------------|-------------------------------------|
| `DATABASE_URL`  | PostgreSQL connection string        |
| `JWT_SECRET`    | Secret for signing JWT tokens       |
| `FRONTEND_URL`  | Allowed CORS origin (frontend URL)  |
| `PORT`          | Port to run on (default: 5001)      |

### Frontend (`frontend/.env`)

| Variable       | Description                                       |
|----------------|---------------------------------------------------|
| `VITE_API_URL` | Backend API URL (defaults to `http://localhost:5001/api`) |

---

## Deployment

See the deployment guide for instructions on hosting via:
- **Backend** → [Render](https://render.com) (free tier)
- **Frontend** → [Vercel](https://vercel.com) (free tier)
- **Database** → [Neon](https://neon.tech) (free tier PostgreSQL)

---

## License

Private — © PROJXON. All rights reserved.
