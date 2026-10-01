# Deploying the store on AWS EC2

This runbook puts the store on one Ubuntu server in AWS Mumbai with HTTPS, daily backups and scheduled jobs.
Every command is meant to be copied and pasted. Wherever you see `shop.example.com`, type **your domain** instead.

What runs on the server (all in Docker, defined in `deploy/docker-compose.prod.yml`):

| Container | What it does |
| --- | --- |
| `app` | The Next.js store (`thrift-app:<commit>` image, built on the server). Applies database migrations on start. |
| `db` | PostgreSQL 16. Not reachable from the internet. |
| `caddy` | HTTPS with automatic Let's Encrypt certificates; forwards traffic to `app`. |
| `backup` | Daily database dump + uploaded images archive, kept 14 days. |
| `cron` | Calls the store's scheduled jobs (order expiry, low stock, daily summary, abandoned carts, payment reconciliation, design purge, review requests) on Indian time. |

Upload limits: Caddy accepts request bodies up to **100 MB on `/api/designs`** (design-studio photo prints are up to 91 MB per request) and up to 50 MB everywhere else (`deploy/Caddyfile`). If you ever put another proxy or a load balancer in front, give it the same limits, or large photo prints will fail with "413 Request Entity Too Large".

---

## 1. What you need

- An AWS account.
- A domain whose DNS records you can edit.
- A Razorpay account (Test mode is enough to start).
- An email sender: an SMTP login (Gmail/Google Workspace app password, Zoho, Brevo, …) or Amazon SES.
- About 30–45 minutes.

Monthly cost (approximate, Mumbai region): t3.small on-demand ≈ US$15–17; 30 GB gp3 disk ≈ US$2.4; Elastic IP free while attached to a running instance (charged when the instance is stopped); S3 backup copies a few cents.

## 2. Launch the server

EC2 console → top-right region **Asia Pacific (Mumbai) ap-south-1** → **Launch instance**:

1. Name: `store`.
2. AMI: **Ubuntu Server 24.04 LTS** — *64-bit (x86)* for **t3.small**, or *64-bit (Arm)* for **t4g.small**. Both work because the image is built on the server.
3. Instance type: **t3.small** (2 GB RAM; the setup script adds 2 GB swap — this is the minimum).
4. Key pair → **Create new key pair**: type ED25519, format `.pem`, name `store`. It downloads `store.pem` — this is your SSH key; keep it safe.
5. Network settings → **Create security group**, inbound rules:
   - SSH, port 22, source **My IP**
   - HTTP, port 80, source **Anywhere** (IPv4 and IPv6)
   - HTTPS, port 443, source **Anywhere** (IPv4 and IPv6)
   - optional: Custom UDP, port 443, source Anywhere (HTTP/3)
6. Storage: **30 GiB gp3**.
7. Advanced details → *Metadata version* **V2 only (token required)**, *Metadata response hop limit* **2** (lets containers use an instance role for S3/SES later; harmless otherwise).
8. **Launch instance**.

## 3. Elastic IP

EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate. Select it → **Actions → Associate Elastic IP address** → choose the `store` instance → Associate. Write the address down.

## 4. DNS

At your domain's DNS host create two records (TTL 300):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (the bare domain) | your Elastic IP |
| A | `www` | your Elastic IP |

**Delete every other record for `@` and `www`**: any other A record, every **AAAA** record, and any `www` CNAME or registrar "parking"/"forwarding" record. Let's Encrypt prefers IPv6, so a leftover AAAA record sends its check to the parking server and Caddy never gets a certificate. (MX and TXT records for email stay.)

Check from your computer until it prints the Elastic IP:

```bash
nslookup shop.example.com
```

Caddy cannot get a certificate until this resolves.

## 5. Connect

```bash
chmod 400 ~/Downloads/store.pem
ssh -i ~/Downloads/store.pem ubuntu@<Elastic IP>
```

**On Windows** (PowerShell), restrict the key to your own user first, or OpenSSH refuses it with "UNPROTECTED PRIVATE KEY FILE":

```powershell
icacls "$HOME\Downloads\store.pem" /inheritance:r
icacls "$HOME\Downloads\store.pem" /grant:r "$($env:USERNAME):(R)"
ssh -i "$HOME\Downloads\store.pem" ubuntu@<Elastic IP>
```

## 6. Bootstrap the server

```bash
git clone https://github.com/sherwynjoel/thrift-Ecom.git ~/store
cd ~/store
sudo bash deploy/setup-ec2.sh
exit
```

SSH in again (step 5) so your user can run `docker`. The script installs Docker, adds 2 GB swap, turns on the firewall (22, 80, 443) and automatic security updates. It is safe to re-run.

**Private repository?** Create a read-only deploy key instead and clone over SSH:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Add the printed key under GitHub → the repo → **Settings → Deploy keys → Add deploy key** (leave "Allow write access" off). Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config
git clone git@github.com:sherwynjoel/thrift-Ecom.git ~/store
```

## 7. Configure

```bash
cd ~/store
cp deploy/.env.production.example deploy/.env
chmod 600 deploy/.env
openssl rand -hex 24      # → POSTGRES_PASSWORD
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -hex 32      # → CRON_SECRET
openssl rand -hex 32      # → RAZORPAY_WEBHOOK_SECRET
nano deploy/.env
```

**The store refuses to start in production until every `[required]` line is filled in** (`deploy/deploy.sh` checks the same list before building). That means you need Razorpay **Test-mode** keys (step 10, first part) and an email sender (step 11) before the first deploy.

| Block | What to put |
| --- | --- |
| `DOMAIN`, `ACME_EMAIL` | Your bare domain (no `https://`) and an email Let's Encrypt can write to about certificates. |
| `POSTGRES_*` | Keep user/db `thrift`; paste the generated hex password. |
| `AUTH_SECRET` | The generated base64 value. Google sign-in (`GOOGLE_CLIENT_*`) is optional. |
| `STORAGE_DRIVER`, `AWS_REGION`, `S3_*` | Keep `local` (images live in the `uploads` volume and are backed up). S3 is optional (step 12). |
| `EMAIL_DRIVER`, `EMAIL_FROM`, `SMTP_URL` | `smtp` + your SMTP URL, or `ses` (step 11). `console` is refused in production. |
| `PAYMENT_PROVIDER`, `RAZORPAY_*` | Keep `razorpay`; paste the Test-mode key id and secret, and the webhook secret you generated. |
| `CRON_SECRET` | The generated hex value (at least 32 characters). |
| `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_META_PIXEL_ID` | Optional analytics; baked into the build. |
| `BACKUP_*` | Keep 14 days; `BACKUP_S3_BUCKET` is optional (step 13). |
| `ADMIN_EMAIL` | Optional default for `seed-admin.sh`. Never put a password in this file. |

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

**Before the first deploy, set your brand name and contact details** — the store ships with placeholders (`YOUR BRAND`, `support@example.com`) that get baked into pages, emails and the sitemap the moment Google can crawl the site. Edit `src/config/brand.ts` (`name`, `supportEmail`, `social.instagram`, `social.youtube`) and `content/pages/contact.md` (the support email), commit, then deploy. Fixing this after launch needs a rebuild (`bash deploy/deploy.sh --no-pull`).

## 8. First deploy

```bash
bash deploy/deploy.sh
```

The first build takes 5–10 minutes on a t3.small; later builds reuse the layer cache. Success ends with the `/api/health` JSON, whose `version` is the commit. Open `https://shop.example.com` — the padlock is shown.

## 9. Create the admin

```bash
bash deploy/seed-admin.sh you@yourdomain.com
```

Type a password (12+ characters) twice. This also creates the three collections the storefront nav and homepage CTAs link to (`new-drops`, `oversized-tees`, `regular-fit-tees`) if they don't already exist, so those links don't 404 before you've added your own. Sign in at `https://shop.example.com/login`, open `/admin` → **Settings** and fill in the business name, address, state, GSTIN, admin email and WhatsApp number. Then add products to those collections (or rename/add more) and homepage banners.

## 10. Razorpay ("Go live" step 1)

**Test mode first** (needed before the first deploy):

1. Razorpay Dashboard (Test mode) → **Account & Settings → API Keys → Generate Test Key**. Copy the key id and secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. **Account & Settings → Webhooks → Add New Webhook**: URL `https://shop.example.com/api/webhooks/razorpay`, secret = your `RAZORPAY_WEBHOOK_SECRET`, events **payment.captured**, **order.paid**, **payment.failed**. Save.
3. After changing `deploy/.env`: `bash deploy/deploy.sh --restart`.
4. Place a test order with Razorpay's test card or UPI (`success@razorpay`). In the dashboard the webhook delivery shows **200**, and the order is **Paid** in `/admin/orders`.

**Switch to live** (after Razorpay activates your account / KYC):

1. Switch the dashboard to **Live mode**, generate live keys, and add a **separate** live webhook with the same URL and events and a **new** secret (`openssl rand -hex 32`).
2. Replace the three `RAZORPAY_*` values in `deploy/.env`, then `bash deploy/deploy.sh --restart`.
3. Place one real low-value order and refund it from `/admin/orders`.

## 11. Email

**Option A — SMTP (any provider).** Gmail/Google Workspace needs an *app password*. Write `@` in the username as `%40`:

```bash
EMAIL_DRIVER=smtp
SMTP_URL=smtps://user%40yourdomain.com:app-password@smtp.provider.com:465
EMAIL_FROM=orders@yourdomain.com
```

**Option B — Amazon SES (ap-south-1).**

1. SES → **Identities → Create identity → Domain**; add the three DKIM CNAME records it shows to your DNS.
2. Add TXT records: SPF `v=spf1 include:amazonses.com ~all` on the domain, and DMARC `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` on `_dmarc`.
3. **Request production access** (new accounts can only mail verified addresses).
4. Either create **SMTP credentials** and use `EMAIL_DRIVER=smtp` with `SMTP_URL=smtps://<smtp-user>:<smtp-password>@email-smtp.ap-south-1.amazonaws.com:465`, or attach an instance role allowing `ses:SendEmail` and use `EMAIL_DRIVER=ses` (with `AWS_REGION=ap-south-1`).

Then `bash deploy/deploy.sh --restart` and test: register a customer (welcome email) or use "Forgot password", or place an order (confirmation email).

## 12. Optional: images on S3

**Skip this whole step if you keep `STORAGE_DRIVER=local` (the default).** Local images live in the `uploads` volume, are served by the store itself and are included in the daily backups. They need no bucket, no policy and no role.

The store writes these keys at the root of the bucket:

| Prefix | What | Who may read it |
| --- | --- | --- |
| `products/`, `collections/`, `banners/` | Catalogue and homepage images | Everyone (public) |
| `designs/previews/` | Mock-up previews of customer designs | Everyone (public) |
| `designs/assets/` | Images customers upload into the design studio. The studio loads them in the browser by URL, so they must be public; the names are random and cannot be guessed. | Everyone (public) |
| `designs/print/` | Full-resolution print files | **Never public.** Only the store reads them (admin print queue downloads) |

1. S3 → **Create bucket** in ap-south-1, e.g. `yourshop-images`. Under *Block Public Access*, untick **only** the two "bucket policies" options and leave the two "ACLs" options ticked.
2. Bucket → **Permissions → Bucket policy**. It makes only the public prefixes readable, never `designs/print/`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicStoreImages",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": [
         "arn:aws:s3:::yourshop-images/products/*",
         "arn:aws:s3:::yourshop-images/collections/*",
         "arn:aws:s3:::yourshop-images/banners/*",
         "arn:aws:s3:::yourshop-images/designs/previews/*",
         "arn:aws:s3:::yourshop-images/designs/assets/*"
       ]
     }]
   }
   ```

3. Bucket → **Permissions → CORS**. The studio draws uploaded images on a canvas, which needs CORS:

   ```json
   [{ "AllowedOrigins": ["https://shop.example.com"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400 }]
   ```

4. IAM → **Roles → Create role** → AWS service, EC2. Add an inline policy that lets the store write, read (print files) and delete its images:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
       "Resource": "arn:aws:s3:::yourshop-images/*"
     }]
   }
   ```

   Then EC2 → the instance → **Actions → Security → Modify IAM role** → choose it. An instance has one role, so add the backup statement from step 13 to this same role if you use both.
5. In `deploy/.env`: `STORAGE_DRIVER=s3`, `S3_BUCKET=yourshop-images`, `AWS_REGION=ap-south-1`, `S3_PUBLIC_BASE_URL=https://yourshop-images.s3.ap-south-1.amazonaws.com` (or the CloudFront URL).
6. Copy the existing local images to the bucket, keeping the same keys. Print files are copied too; the bucket policy keeps them private:

   ```bash
   docker run --rm -v thrift_uploads:/uploads:ro amazon/aws-cli s3 sync /uploads s3://yourshop-images/
   ```

7. `bash deploy/deploy.sh --no-pull` (the image host is baked into the build). Check that a product image opens. Then check that a print file URL (`https://yourshop-images.s3.ap-south-1.amazonaws.com/designs/print/<any file>`) returns **AccessDenied**.

## 13. Backups

The `backup` container makes a database dump (`db-<UTC time>.sql.gz`) and an archive of the uploads volume (`uploads-<UTC time>.tar.gz`) once a day and keeps them **14 days** in the `backups` volume.

```bash
bash deploy/restore.sh list
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup sh /opt/backup/backup.sh once   # one backup now
```

**Off-box copies (recommended):**

1. Create an S3 bucket with a lifecycle rule that deletes objects after 30 days.
2. Attach an instance role allowing `s3:PutObject` on `arn:aws:s3:::<bucket>/thrift/*`.
3. Set `BACKUP_S3_BUCKET=<bucket>` in `deploy/.env`, then `bash deploy/deploy.sh --restart`. This recreates the app, cron and backup containers with the new setting.

Also turn on EBS snapshots as a second layer: EC2 → **Lifecycle Manager** → create a policy for the instance's volume, daily, keep 7.

## 14. Restore

```bash
bash deploy/restore.sh list
bash deploy/restore.sh db db-20261001T213000Z.sql.gz          # takes a fresh backup first, then replaces the database
bash deploy/restore.sh uploads uploads-20261001T213000Z.tar.gz # puts images back
```

Both ask you to type `RESTORE`. **Onto a brand-new server:** do steps 2–8, copy the backup files to the server (`scp`), put them into the `backups` volume, then run the same commands:

```bash
docker cp db-20261001T213000Z.sql.gz thrift-backup-1:/backups/
docker cp uploads-20261001T213000Z.tar.gz thrift-backup-1:/backups/
```

## 15. Updating and rolling back

Push to `main`, then on the server:

```bash
cd ~/store
bash deploy/deploy.sh
```

If the new version fails its health check, the script rolls back to the previous image automatically and says so. Manual rollback:

```bash
docker images thrift-app
bash deploy/deploy.sh --rollback <tag>
```

Database migrations are forward-only and are **not** reverted by a rollback: keep migrations additive, and restore a backup (step 14) if a migration really must be undone.

## 16. Verify checklist

Tick all of these before announcing the store:

- [ ] Padlock shown; `https://www.shop.example.com` redirects to `https://shop.example.com`.
- [ ] `curl -s https://shop.example.com/api/health` → contains `"status":"ok"`.
- [ ] `curl -sI https://shop.example.com | grep -i -E "strict-transport|content-security|x-frame"` shows all three headers.
- [ ] Home, a product, the bag and checkout work on a phone.
- [ ] Register a customer, place a Razorpay test order, receive the confirmation email; the admin gets the new-order email.
- [ ] `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env logs cron --since 30m` shows `expire-orders ok` every 5 minutes.
- [ ] `bash deploy/restore.sh list` shows a backup.
- [ ] **Restore drill.** Prove that the newest dump actually restores by loading it into a scratch database (the live one is untouched). It should print a product count:

  ```bash
  docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup sh -c \
    'f=$(ls -t /backups/db-*.sql.gz | head -n 1) && echo "drill: $f" && dropdb --if-exists drill && createdb drill \
     && gunzip -c "$f" | psql -d drill -v ON_ERROR_STOP=1 -q >/dev/null \
     && psql -d drill -c "select count(*) as products from \"Product\"" ; dropdb --if-exists drill'
  ```

  Repeat the drill every few months.
- [ ] `https://shop.example.com/robots.txt` allows crawling and `https://shop.example.com/sitemap.xml` lists products.
- [ ] Admin Settings saved.
- [ ] Razorpay webhook deliveries are green.
- [ ] A large design-studio photo print uploads without a 413 error.

## 17. Operations

Shortcut for the commands below: `alias dc='docker compose -f ~/store/deploy/docker-compose.prod.yml --env-file ~/store/deploy/.env'` (add it to `~/.bashrc`).

- **Do not run `dc up` yourself.** The app image is tagged with the deployed commit, which only the scripts know. A bare `dc up` looks for `thrift-app:dev`, which does not exist, and fails. Use `bash deploy/deploy.sh` (new code), `bash deploy/deploy.sh --restart` (after editing `deploy/.env`) or `bash deploy/deploy.sh --rollback <tag>`.
- **Logs:** `dc logs -f app`, `dc logs caddy`, `dc logs cron`, `dc logs backup`.
- **Status / restart:** `dc ps`, `dc restart app`.
- **Disk:** `df -h`, `docker system df`, `docker builder prune` (deploys already keep only the 3 newest images).
- **OS updates:** security updates install automatically. Reboot about monthly with `sudo reboot`; the containers start again by themselves.
- **Rotating a secret:** edit `deploy/.env`, then `bash deploy/deploy.sh --restart`. Rotating `AUTH_SECRET` signs everyone out. Changing `POSTGRES_PASSWORD` after the first start also needs the password changed inside Postgres (`dc exec db psql -U thrift -c "ALTER USER thrift PASSWORD '<new>'"`) before the restart.
- **Changing the domain:** update DNS, set `DOMAIN`, then `bash deploy/deploy.sh --no-pull` (the site URL is baked into the build).

## 18. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Certificate error / no padlock | DNS does not point at the Elastic IP yet, or ports 80/443 are closed in the security group. `dc logs caddy` shows the reason. |
| 502 Bad Gateway | The app is starting or crashed: `dc ps`, `dc logs app`. |
| `[config] Refusing to start` in `dc logs app` | A `[required]` value in `deploy/.env` is missing or wrong; the log lists each one. Fix and `bash deploy/deploy.sh --restart`. |
| Build killed / out of memory | Swap is missing: `sudo bash deploy/setup-ec2.sh`, then deploy again. |
| Migrations failed on start | `dc logs app` shows Prisma's error. Fix and redeploy, or restore a backup (step 14). |
| Emails not arriving | Check `EMAIL_DRIVER`/`SMTP_URL`, the SES sandbox (step 11.3) and the spam folder; failed emails show as "Email failed" on the order timeline. |
| Razorpay webhook 401 | The webhook secret in the dashboard differs from `RAZORPAY_WEBHOOK_SECRET`; make them equal and `--restart`. |
| Cron 401 in `dc logs cron` | `CRON_SECRET` changed without `bash deploy/deploy.sh --restart`. |
| Photo print upload fails with 413 | A proxy in front of Caddy limits bodies below 100 MB; raise it (see the top of this page). |
