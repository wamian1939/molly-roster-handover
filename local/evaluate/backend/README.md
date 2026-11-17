# Evaluate Molly Backend

Node.js + TypeScript + Express + Prisma backend for the Employee Evaluation module.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example:

```bash
copy .env.example .env
```

3. Update `DATABASE_URL` in `.env` to point to your PostgreSQL database.

4. Generate Prisma client:

```bash
npm run prisma:generate
```

5. Create database tables:

```bash
npm run prisma:migrate -- --name init
```

6. Seed data from the frontend mock shape:

```bash
npm run prisma:seed
```

7. Start the API:

```bash
npm run dev
```

After applying the auth migration, create the first administrator by setting
`ADMIN_USERNAME`, `ADMIN_DISPLAY_NAME`, and `ADMIN_INITIAL_PASSWORD` in the
backend environment and running:

```bash
npm run auth:bootstrap-admin
```

The bootstrap command refuses to overwrite an existing administrator. Remove
`ADMIN_INITIAL_PASSWORD` from the environment after the account is created.

The API runs on `http://127.0.0.1:4000/api` by default.

## Frontend

Set the frontend API base URL in the root `.env`:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4000/api
```

Then start the frontend from the project root:

```bash
npm run dev
```
