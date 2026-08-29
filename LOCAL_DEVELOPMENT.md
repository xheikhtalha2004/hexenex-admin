# Local development

This downloaded project runs entirely on this computer. It does not connect to
or modify Railway or GitHub.

## Start from VS Code

Open this folder in VS Code and either:

- run `npm run dev` in the root terminal, or
- press `Ctrl+Shift+B` and select **Run Slabline locally**.

Then open <http://127.0.0.1:3000/login>.

Local administrator:

- Email: `local.admin@slabline.test`
- Password: `Slab!1E7qPAFrEVh39a`

Edits made under `web/src`, `web/public`, `api/src`, and `api/prisma` are
synchronized into the Windows runtime and picked up by the development servers.
Application records are stored in the isolated local PostgreSQL database, not
in source files.
