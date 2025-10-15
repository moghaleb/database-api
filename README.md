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

Login page
----------

A simple login page is available at `/login.html` and posts credentials to `POST /login`.

- Default credentials (for local testing):
	- username: `admin`
	- password: `admin123`

You can override the admin username/password with environment variables `ADMIN_USER` and `ADMIN_PASS`.

To test locally using PowerShell:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/login -Method POST -ContentType 'application/json' -Body (ConvertTo-Json @{username='admin'; password='admin123'}) | ConvertTo-Json -Depth 5
```

Security note
-------------
Never commit real API tokens, passwords, or session secrets to source control. Use environment variables or your cloud provider's secret store.