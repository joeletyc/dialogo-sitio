# Diálogo website: setup guide

This repository is the whole website for **dialogomx.com**. Once it is set up, nobody uploads anything by hand: every 30 minutes GitHub reads the Diálogo Facebook page, saves any new posts (text, photos, videos, links), rebuilds the site and publishes it.

```
Facebook page ──(Graph API, every 30 min)──> GitHub Actions ──> data/posts.json + photos
                                                   │
                                                   └──> builds the site ──> GitHub Pages ──> dialogomx.com
```

## What it costs

| Item | Provider | Cost |
|---|---|---|
| Domain `dialogomx.com` | Cloudflare Registrar (sells at wholesale price) | about US$10.46 per year |
| Hosting | GitHub Pages | free |
| Automation | GitHub Actions (free for public repositories) | free |
| Facebook access | Meta Graph API | free |

Total: the domain only. **Turn on auto-renew for the domain** so it never lapses again.

## Step 1. Get the domain back

1. Go to <https://domains.cloudflare.com> and search `dialogomx.com`.
2. **If it is available**: create a free Cloudflare account, buy it (1 year or more), and turn on **Auto-renew** with a saved card.
3. **If it shows as taken**: the old registrar may still be holding it. After a .com expires there is usually a grace period, then about 30 days of "redemption" where only the previous owner can get it back, normally for an extra fee. Contact the company you originally bought it from and ask to restore it. After that it is released to the public.
4. If someone else bought it, pick another name and change `site.url` and `site.domain` in `config.json`.

## Step 2. Put this code on GitHub

1. Create a free account at <https://github.com> (if you don't have one).
2. Create a **new repository**, for example `dialogo-sitio`. It must be **Public** (GitHub Pages is free only for public repositories). Nothing private is stored in it: the Facebook token goes in an encrypted secret, not in the code.
3. Upload these files. The easiest way is **GitHub Desktop** (<https://desktop.github.com>): *File → Clone repository* → your new repo → copy all the files from this folder into the cloned folder → *Commit to main* → *Push origin*.
   - Make sure the hidden `.github` folder is included. The web uploader sometimes skips it, which is why GitHub Desktop is recommended.
   - Don't upload `node_modules` or `dist` if they exist (the `.gitignore` file already excludes them).

## Step 3. Get the Facebook page token

You need a Facebook account that is an **admin of the Diálogo page**. This creates a token that lets the site read the page's posts. Done right, it does not expire.

1. Go to <https://developers.facebook.com>, log in, and accept the developer terms if asked.
2. **My Apps → Create App.** Name it `Diálogo sitio`. When asked for a use case, choose the one about managing a Page, or **Other**; if asked for an app type, choose **Business**. Leave the app in **Development** mode. It does not need to be published or reviewed, because it only reads your own page.
3. Open **Tools → Graph API Explorer** (<https://developers.facebook.com/tools/explorer>).
   - In **Meta App**, select `Diálogo sitio`.
   - In **User or Page**, choose **Get User Access Token**.
   - In **Permissions**, add: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`.
   - Click **Generate Access Token**. In the Facebook window, select the **Diálogo** page and allow everything.
4. Copy the token that appears. Open **Tools → Access Token Debugger** (<https://developers.facebook.com/tools/debug/accesstoken>), paste it, click **Debug**, then at the bottom click **Extend Access Token**. Copy the new, longer token.
5. Back in the Graph API Explorer, paste that long token in the **Access Token** box. In the query field type:
   ```
   me/accounts?fields=name,access_token
   ```
   and click **Submit**. Copy the `access_token` value next to `"name": "Diálogo"`. **That is the page token.**
6. Check it: paste it in the Access Token Debugger. It should say **Type: Page** and **Expires: Never**.

Alternative if you have Node.js installed: run `npm install` then `npm run token`, and paste your App ID, App Secret (App settings → Basic) and the token from point 3. It prints the page token and confirms it never expires.

**The token stops working if** you change your Facebook password, stop being an admin of the page, delete the app, or Facebook forces a security logout. If that happens, GitHub emails you that the update failed; repeat points 3 to 6 and replace the secret (Step 4.1).

## Step 4. Turn on the automation

In your repository on github.com:

1. **Settings → Secrets and variables → Actions → New repository secret.** Name: `FB_PAGE_TOKEN`. Value: the page token. Save.
2. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
3. **Settings → Actions → General → Workflow permissions:** choose **Read and write permissions** and save.
4. **Actions** tab → if asked, click **I understand my workflows, go ahead and enable them**. Click **Actualizar sitio → Run workflow**.

The run that started automatically when you uploaded the code will have failed because the token wasn't saved yet. That one is expected; ignore it.

The first successful run imports the page history (up to about 600 posts) and downloads the photos. It can take several minutes and may continue over the next few runs. When it finishes, the site is live at `https://YOUR-USER.github.io/dialogo-sitio/`.

## Step 5. Connect dialogomx.com

1. In GitHub: **Settings → Pages → Custom domain**, type `dialogomx.com` and save.
2. In Cloudflare: **your domain → DNS → Records**. Add these records with **Proxy status: DNS only** (grey cloud):

   | Type | Name | Content |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `YOUR-USER.github.io` |

3. Wait until GitHub shows the DNS check as successful (minutes to a few hours), then tick **Enforce HTTPS**.
4. Recommended: in your GitHub **account** settings → **Pages → Add a domain**, verify `dialogomx.com`. It adds one TXT record in Cloudflare and stops anyone else from using your domain on GitHub.
5. Optional: **Settings → Secrets and variables → Actions → Variables → New variable**: `SITE_URL` = `https://dialogomx.com`. The site already detects the domain, this just makes it explicit.

## Day to day

Nothing. Post on Facebook as usual. The post shows up on the site within about 30 to 60 minutes (GitHub sometimes delays scheduled runs when it is busy). Edits made on Facebook are copied over; posts deleted on Facebook are removed from the site after three consecutive checks.

To force an update right away: **Actions → Actualizar sitio → Run workflow**.

## Changing the site

Everything editable is in **`config.json`**. Edit it directly on github.com (pencil icon) and commit; the site rebuilds by itself.

| Setting | What it does |
|---|---|
| `site.tagline`, `site.description` | Text under the logo and the description Google shows |
| `site.logo` | Leave empty to use the red speech-bubble wordmark. To use a logo image, upload it to `assets/img/` and put its path, e.g. `"assets/img/logo.png"` |
| `contact.*` | Email, phone, WhatsApp and address shown on the Contact page |
| `social.*` | Links to other social networks (empty ones are hidden) |
| `about` | Paragraphs of the "Nosotros" page |
| `ads.show_placeholders` | `true` shows the gray "Espacio publicitario" boxes; `false` hides them |
| `ads.slots.*` | Paste an ad code (for example from Google AdSense) into `header`, `home_mid`, `sidebar`, `article_top` or `article_bottom` |
| `analytics.head_html` | Code that must go in the page `<head>` (AdSense loader script, Google Analytics, etc.) |
| `facebook.exclude_hashtags` | Posts containing any of these hashtags are not copied to the site, e.g. `["#nopublicar"]` |
| `facebook.media_budget_mb` | Maximum space for photos (default 800 MB). When it is reached, the oldest photos are shrunk automatically; recent ones keep full quality |
| `layout.posts_per_page` | How many news items per page |

## Limits to know about

- **Space:** GitHub Pages allows a 1 GB site. Photos are compressed when downloaded, and the site keeps them under 800 MB on its own: when the limit is reached, the oldest photos are reduced first (to a smaller size, and later to the thumbnail only). Recent news always keeps full-quality photos. Each run reports the current size in its summary.
- **History:** Facebook's API returns roughly the last ~600 posts per year of history on the first import. Older posts are not imported.
- **Reels and stories** may not be returned by Facebook's posts endpoint. Regular posts, photos, albums, videos and shared links are.
- **Videos** are not copied; the site shows the thumbnail and plays the video from Facebook when the reader presses play.
- **Reaction counts** ("Lo más comentado de la semana") need the `pages_read_engagement` permission. If Facebook refuses them, the site keeps working and hides that box.
- **GitHub's rules:** scheduled workflows pause after 60 days without commits. The workflow commits a small heartbeat file every 45 days to prevent that.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Email from GitHub "Run failed", log says `El token de Facebook no es válido o expiró` | Token invalidated | Step 3, then update the `FB_PAGE_TOKEN` secret |
| Log says `(#10) ... requires ... permission` | Token was made without the permissions | Step 3 again, making sure the three permissions are selected and the Diálogo page is ticked |
| Site shows old content | Run hasn't happened yet or failed | Actions tab: check the last run, or press Run workflow |
| Site at the domain shows a GitHub 404 | DNS not finished or custom domain not saved | Step 5; wait up to 24 h for DNS |
| Styles missing at `github.io/...` address | Site built before Pages was configured | Run the workflow again |

## For developers

```
npm install            # installs sharp (image processing)
npm run fetch          # needs FB_PAGE_TOKEN in the environment
npm run build          # writes the site to dist/
npm run preview        # serves dist/ at http://localhost:8080
```

`dev/` has a fake Graph API (`mock-graph.mjs`) and sample data generator (`make-fixtures.py`) used to test the pipeline without Facebook. Photos are stored on the `media` branch as a single commit that is replaced each time, so repository history does not grow with images.
