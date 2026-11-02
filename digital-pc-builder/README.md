# Digital PC Builder - Virtual Compatibility & Simulation System

A web-based system for designing, checking and simulating custom PC builds before buying hardware.
Built with **HTML5, CSS3 and vanilla JavaScript (ES6)** on the frontend and **PHP + MySQL** on the backend. No npm, Node.js or build step is required.

## Features

| Feature | Where |
|---|---|
| Interactive builder: 8 categories, search, brand/price/compatibility filters, add / replace / remove, live virtual PC view | `pages/builder.html` |
| Compatibility engine: 7 rule groups, green / yellow / red results with explanations, quick pair checker | `pages/compatibility.html`, `js/compatibility.js` |
| Explainable rule-based recommendations: usage + budget + value scoring, bottleneck-aware, auto-complete | `js/recommendations.js` (shown in the builder and dashboard) |
| Performance simulator: workload scores, CPU/GPU utilization, bottleneck, FPS ranges, power, A/B comparison | `pages/simulator.html`, `js/performance.js` |
| Build summary: images, specs, prices, totals, power, performance; save / edit / delete / print / JSON / CSV / copy | `pages/summary.html` |
| Comparison of 2–4 components (CPU, GPU, motherboard…) or 2–4 complete builds | `pages/comparison.html` |
| Saved builds: load & edit, rename, duplicate, export, import, delete, compare | `pages/saved-builds.html` |
| Pagination in the catalog (12/24/48 per page), builder picker and saved builds | `js/components.js` (`paginate`, `pagerHtml`) |
| Home, Dashboard (with quick-start presets), Catalog, About, Privacy Policy, Terms and Conditions | `index.html`, `pages/*.html` |

## Folder structure

```
digital-pc-builder/
├── index.html                  Landing page
├── favicon.ico                 Favicon (16/32/48 px)
├── pages/                      dashboard, builder, components (catalog), compatibility,
│                               simulator, summary, comparison, saved-builds, about,
│                               privacy, terms
├── css/
│   ├── style.css               Design tokens + shared components
│   ├── builder.css             Builder page + virtual PC
│   └── responsive.css          Tablet / mobile breakpoints + print styles
├── js/
│   ├── main.js                 Namespace, utilities, layout, modals, toasts, charts
│   ├── storage.js              Data layer: catalog loading, current build, saved builds (API or localStorage)
│   ├── compatibility.js        Compatibility rule engine
│   ├── performance.js          Power + performance estimation model
│   ├── recommendations.js      Explainable recommendation engine + auto-complete
│   ├── components.js           Reusable UI (cards, detail modal, filters, check lists, save dialog)
│   └── <page>.js               One script per page (builder, catalog, simulator, …)
├── data/
│   ├── components.json         Hardware dataset (101 components, PHP prices with sources)
│   └── components.js           Same data as a script, used only when opened via file://
├── assets/images, assets/icons Category illustrations, logo, favicon.svg, apple-touch-icon.png
└── backend/
    ├── config/database.php     MySQL connection settings
    ├── api/_bootstrap.php      JSON helpers, CORS, error handling
    ├── api/health.php          Backend detection
    ├── api/components.php      GET catalog
    ├── api/builds.php          CRUD for saved builds (GET / POST / PUT / DELETE)
    └── database.sql            Schema + sample data
```

## Running the project

### Option A - Full system with XAMPP (PHP + MySQL) - recommended for the demo

1. Install [XAMPP](https://www.apachefriends.org/) and start **Apache** and **MySQL** in the XAMPP Control Panel.
2. Copy the `digital-pc-builder` folder into `C:\xampp\htdocs\`.
3. Open **http://localhost/phpmyadmin**, go to **Import**, choose `backend/database.sql` and click **Go**.
   This creates the `digital_pc_builder` database with the `components` and `builds` tables and the 101 components with their prices and price sources.
4. Open **http://localhost/digital-pc-builder/**.
   The footer should read **"Storage: PHP + MySQL database"**.

If your MySQL user or password is not the XAMPP default (`root` with no password), edit `backend/config/database.php`.

### Option B - Frontend only (VS Code Live Server or opening the file directly)

- **Live Server:** open the folder in VS Code, right-click `index.html`, then choose **Open with Live Server**.
- **Directly:** double-click `index.html`.

Every feature works. The catalog loads from `data/components.json` (or `data/components.js` under `file://`), and saved builds are kept in the browser's localStorage.
The footer shows **"Storage: browser localStorage"**. Builds saved this way can later be moved into MySQL with **Import into database** on the Saved Builds page.

### Dependencies

- A modern browser (Chrome, Edge, Firefox, Safari).
- For Option A only: XAMPP with PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+.
- Loaded from a CDN (optional): Chart.js 4.4.1. Without internet, charts fall back to built-in CSS bars. Fonts are the system fonts, so nothing else is downloaded.

## API reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `backend/api/health.php` | `{ ok, components }` used for backend detection |
| GET | `backend/api/components.php[?category=gpu \| ?id=…]` | Catalog |
| GET | `backend/api/builds.php[?id=3]` | List builds / one build |
| POST | `backend/api/builds.php` | Create: `{ name, usage, budget, resolution, notes, parts }` |
| PUT | `backend/api/builds.php?id=3` | Update |
| DELETE | `backend/api/builds.php?id=3` | Delete |

The server validates every field (name length, allowed usage/resolution values, budget range, at most 4 drives), checks that each component id exists with the right category, and recalculates the total price from the database rather than trusting the client.

## How the logic works

- **Compatibility rules** read structured attributes from each component's `specs` (socket, memory type, form factor, GPU length, cooler height and radiator size, wattage, M.2/SATA counts, drive bays). Nothing is hardcoded in the UI.
- **Power:** estimated peak = CPU max power + GPU board power + motherboard, RAM, storage, cooler and fans. Recommended PSU = peak × 1.3, rounded up to 50 W, and at least the GPU vendor's recommendation.
- **Performance model:** relative CPU and GPU indices are combined with documented resolution and preset factors. Gaming FPS = min(CPU frame capacity, GPU frame capacity), shown as a range. Workload scores are normalized so a reference build (Ryzen 5 7600 + RTX 4060 + 32 GB DDR5 + Gen4 NVMe) scores 100.
- **Recommendations:** compatible candidates are scored by usage fitness (50%), budget fit (30%) and value (20%). Warnings reduce the score, and gaming picks are penalized when the CPU would bottleneck the GPU. Every pick lists its reasons.

The full methodology is also shown on the About page.

## Disclaimers

Prices are in **Philippine pesos (PHP)** and were collected from the public product listings of DynaQuest PC, PC Express and EasyPC on 2 November 2026. Each component stores its price source (`priceSource`): an in-stock listing, an out-of-stock listing, or an estimate with its basis when the exact model had no current listing. Prices change often; they are not live. Performance indices, FPS ranges, utilization and power values are **model-based approximations**, not measured benchmarks. Product images are generic category illustrations.

## Editing the dataset

Edit `data/components.json`. Each component has the shape `{ id, category, name, brand, price, release, image, specs, priceSource }`, where `priceSource` is `{ status: "in-stock" | "out-of-stock" | "estimate", store, listing, url, basis, checked }`.
Then:
- copy the same JSON into `data/components.js` (needed only for `file://` usage), and
- re-import the data into MySQL, or add the rows to the `components` table in phpMyAdmin (`specs` is stored as JSON text).
