# Smart S3r — Monorepo

Full-stack e-commerce application with a React frontend and Express backend.

## 🧰 Prerequisites

Make sure you have these installed before cloning:

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/installation) — install via `npm install -g pnpm`

---

## 🚀 Getting Started (After Cloning)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

Copy the example env file into `apps/backend/`:

```bash
# Create apps/backend/.env with the following content:
DATABASE_URL="file:./dev.db"

ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

NODE_ENV=development

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_URL=cloudinary://your_api_key:your_api_secret@your_cloud_name
```

> **Note:** The `DATABASE_URL` points to a local SQLite file. No external database setup required.

### 3. Push the schema & generate the Prisma client

```bash
pnpm prisma:push
```

This will:

- Create the SQLite database file (`apps/backend/prisma/dev.db`)
- Apply the full schema
- Generate the Prisma client

### 4. Seed the database

```bash
pnpm prisma:seed
```

This will insert:

- ✅ An admin user → `dev@email.com` / `Dev123`
- ✅ All categories (from `public/categories.json`)
- ✅ All products (from `public/products.json`)

### 5. Start the development servers

```bash
pnpm dev
```

This starts both:

- **Backend** → http://localhost:3000
- **Frontend** → http://localhost:5173

---

## 📁 Project Structure

```
node-store/
├── apps/
│   ├── backend/          # Express + Prisma + SQLite
│   └── frontend/         # React + Vite + TypeScript
├── packages/
│   └── types/            # Shared TypeScript types
├── package.json          # Root workspace config (pnpm)
└── README.md
```

---

## 🔧 Available Scripts (from root)

### Development

| Script              | Description                   |
| ------------------- | ----------------------------- |
| `pnpm dev`          | Start both frontend & backend |
| `pnpm dev:backend`  | Start backend only            |
| `pnpm dev:frontend` | Start frontend only           |

### Database

| Script                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `pnpm prisma:push`     | Apply schema changes to SQLite (no migration files) |
| `pnpm prisma:migrate`  | Run Prisma migrations                               |
| `pnpm prisma:generate` | Regenerate the Prisma client                        |
| `pnpm prisma:seed`     | Seed the database with initial data                 |
| `pnpm prisma:studio`   | Open Prisma Studio (visual DB browser)              |

### Build & Production

| Script       | Description                         |
| ------------ | ----------------------------------- |
| `pnpm build` | Build both apps                     |
| `pnpm start` | Start the production backend server |

---

## 🛠️ Tech Stack

**Frontend:**

- React 19 + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- React Router

**Backend:**

- Express.js + TypeScript
- Prisma ORM
- SQLite (local development)
- JWT Authentication
- Cloudinary (image uploads)

---

## 🐛 Troubleshooting

**`DATABASE_URL` missing error?**
Make sure `apps/backend/.env` exists and contains `DATABASE_URL="file:./dev.db"`.

**Prisma client not found?**
Run `pnpm prisma:generate` to regenerate it.

**Port conflicts?**
Ensure ports `3000` (backend) and `5173` (frontend) are free.

**Frontend can't reach backend?**
In local dev the frontend proxies to the backend automatically via Vite config.
In production, set the `VITE_API_URL` environment variable.
