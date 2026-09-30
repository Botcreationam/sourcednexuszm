# Sourced Nexus — Curated Luxury Fashion Sourcing

Premium fashion catalog and personal sourcing platform based in Lusaka, Zambia.

---

## 🚀 Quick Start (Local Development)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` (already pre-configured for this project):
   ```bash
   cp .env.example .env
   ```

   Variables in `.env`:
   ```env
   VITE_BASE44_APP_ID=6abc6a8a4b6c9d175aa35566
   VITE_BASE44_APP_BASE_URL=https://base44.app
   VITE_BASE44_SERVER_URL=https://base44.app
   ```

3. **Start local dev server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

4. **Lint and Typecheck:**
   ```bash
   npm run lint
   npm run typecheck
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## ⚡ Deploying to Vercel

The project includes a ready-to-use [`vercel.json`](./vercel.json) configured with SPA route rewrites and security headers.

### Option A: Via Vercel Dashboard (Recommended)
1. Push your repository to GitHub / GitLab.
2. In Vercel, click **Add New Project** and select your repository.
3. Configure the project:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add **Environment Variables**:
   - `VITE_BASE44_APP_ID` = `6abc6a8a4b6c9d175aa35566`
   - `VITE_BASE44_APP_BASE_URL` = `https://base44.app`
   - `VITE_BASE44_SERVER_URL` = `https://base44.app`
5. Click **Deploy**.

### Option B: Via Vercel CLI
```bash
npx vercel
# Follow the prompts, then for production:
npx vercel --prod
```

---

## 🌐 Deploying to Render

The repository includes a [`render.yaml`](./render.yaml) blueprint specification for a Render Static Site.

### Option A: Using Blueprint (render.yaml)
1. Push your repository to GitHub / GitLab.
2. In Render Dashboard, go to **Blueprints** → **New Blueprint Instance**.
3. Select your repository. Render will automatically read `render.yaml` and configure the static site.

### Option B: Manual Static Site Setup
1. In Render Dashboard, click **New +** → **Static Site**.
2. Connect your Git repository.
3. Configure settings:
   - **Name**: `sourced-nexus`
   - **Branch**: `main` (or your active branch)
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. In **Redirects / Rewrites**:
   - Add a rewrite:
     - **Type**: `Rewrite`
     - **Source**: `/*`
     - **Destination**: `/index.html`
5. Under **Environment Variables**, add:
   - `VITE_BASE44_APP_ID`: `6abc6a8a4b6c9d175aa35566`
   - `VITE_BASE44_APP_BASE_URL`: `https://base44.app`
   - `VITE_BASE44_SERVER_URL`: `https://base44.app`
6. Click **Create Static Site**.

---

## 🛠 Available Scripts

- `npm run dev`: Starts Vite dev server with Base44 API proxy enabled
- `npm run build`: Bundles the production app into `./dist`
- `npm run preview`: Locally previews the production build in `./dist`
- `npm run lint`: Runs ESLint
- `npm run lint:fix`: Automatically fixes ESLint issues
- `npm run typecheck`: Runs project JSConfig typecheck
