# Hexenex ERP deployment

Production deploys automatically whenever a commit is pushed to `main`.
GitHub Actions builds the API and web application, uploads an atomic release
bundle over SSH, preserves the production `.env` when present, restarts
Passenger, and verifies the login page and its static assets.

Production URL: https://erp.hexenex.com/login/

The deployment target is deliberately restricted to:

`/home/u571486348/domains/hexenex.com/public_html/erp`

The deploy script refuses any other destination. It never cleans or writes to
`/home/u571486348/domains/hexenex.com/public_html`, so the existing WordPress
site at `hexenex.com` remains isolated.

## GitHub Actions configuration

Create the repository secret `HOSTINGER_SSH_PASSWORD`. The following repository
variables make the destination explicit and can be changed without editing the
workflow:

- `HOSTINGER_HOST`
- `HOSTINGER_PORT`
- `HOSTINGER_USER`
- `HOSTINGER_APP_DIR`
- `HOSTINGER_BASE_URL`

The workflow can also be run manually from **Actions → Deploy to Hostinger → Run
workflow**. Never commit SSH credentials or production environment files.

## Database migrations

Hostinger's shared runtime previously hung Prisma's schema engine, so routine
deployments do not run migrations. Enable `RUN_DATABASE_MIGRATIONS=1` only for a
reviewed release that adds a migration; execution is capped at 120 seconds.
