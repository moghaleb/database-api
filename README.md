# database-api

Environment & secrets
----------------------

This project reads sensitive values from environment variables. Copy `.env.example` to `.env` for local development and fill in secure values. Do NOT commit your real `.env` file.

Recommended variables (see `.env.example`):

- `ADMIN_PASSWORD` - password for admin login
- `API_TOKEN` - token returned after admin login and used for Bearer auth
- `SESSION_SECRET` - secret used by `express-session`
- `PORT` - optional, defaults to 10000

If you deploy to Render or similar, set these variables in the service's environment variable settings instead of using a `.env` file.

Quick local setup
-----------------

1. Copy the example file:

```powershell
cp .env.example .env
```

2. Install dependencies and start:

```powershell
npm install
npm run dev
```

Login page (backend-integrated)
--------------------------------

The administration login form is now served by the backend when you visit `/admin`.

Set these via environment variables `ADMIN_USER` and `ADMIN_PASS`. Do not use default credentials in production.

If you need to test the API directly, you can POST JSON or submit a form to `/login`.

To simulate a browser login (form submit), visit `https://redme.cfd/admin` and use the login form.

Security note
-------------
Never commit real API tokens, passwords, or session secrets to source control. Use environment variables or your cloud provider's secret store.