# Hostinger deployment

Production deploys automatically whenever a commit is pushed to the `xheikh`
branch. GitHub Actions builds both applications, uploads a release bundle over
SSH, runs pending Prisma migrations, preserves the production `.env`, restarts
Passenger, and verifies the login page.

## One-time GitHub setup

In the repository, open **Settings → Secrets and variables → Actions**, create a
repository secret named `HOSTINGER_SSH_PASSWORD`, and set it to the Hostinger SSH
password. Never add that password or any `.env` file to Git.

The workflow can also be run manually from **Actions → Deploy to Hostinger → Run
workflow**.

## Normal deployment

Commit reviewed changes to `xheikh` and push them to GitHub. The deployment is
then automatic; no ZIP upload is needed.

Production URL:
https://slategrey-crocodile-436096.hostingersite.com/login/
