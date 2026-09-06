# E-CHUNAB: Digital Election Management System

An academic / hackathon digital election prototype built using **HTML5, Vanilla CSS3, Vanilla JavaScript, and Supabase**.

---

## 1. Project Overview & Technology Stack

* **Frontend**: Semantic HTML5, Vanilla CSS3 (Custom Design System), Modern Vanilla JavaScript (ES6 Modules & Async/Await).
* **Database**: Supabase PostgreSQL.
* **Authentication**: Supabase Auth (Email & Password).
* **Storage**: Supabase Storage (Private `citizenship-docs` bucket).
* **Charts & Analytics**: Chart.js (CDN).
* **Development Environment**: Localhost (Static HTTP server).

> **Architectural Note**: As specified in the E-Chunab master prompt, this project strictly avoids React, Next.js, Node.js backend frameworks, PHP, or Laravel. The browser interacts directly with Supabase via Row Level Security (RLS) policies.

---

## 2. Project Folder & File Structure

```
e-chunab/
├── index.html                   # Public portal landing page
├── README.md                    # Project documentation & run guide
├── config/
│   └── supabase.js              # Supabase client configuration & credentials
├── database/
│   ├── schema.sql               # PostgreSQL tables, constraints, foreign keys, triggers
│   ├── policies.sql             # Row Level Security (RLS) & Storage bucket policies
│   └── seed.sql                 # Demo election, positions, candidates, and admin promo
├── assets/
│   ├── images/
│   │   └── logo.svg             # Civic emblem vector graphic
│   └── icons/
│       └── favicon.svg          # Digital ballot box favicon
├── css/
│   ├── global.css               # Shared design system, CSS variables, components
│   ├── auth.css                 # Auth & verification styling
│   ├── voter.css                # Voter portal & candidate ballot cards
│   ├── admin.css                # Commission dashboard & document inspection modal
│   └── responsive.css           # Mobile & tablet drawer breakpoints
├── js/
│   ├── utils.js                 # Toast notifications, modals, date formatters
│   ├── auth.js                  # Supabase session, role checks, route protection
│   ├── voter/
│   │   ├── dashboard.js         # Voter dashboard logic & active election check
│   │   ├── profile.js           # Voter profile view & verification summary
│   │   ├── vote.js              # Candidate selection scaffold & review modal
│   │   └── results.js           # Anonymized aggregate election tallies
│   └── admin/
│       ├── dashboard.js         # Overview metrics & commission analytics
│       ├── voters.js            # Voter table & citizenship document approval
│       ├── elections.js         # Election cycle draft, activate, complete
│       ├── candidates.js        # Position & candidate nominee management
│       └── results.js           # Turnout percentage, winner tally, Chart.js
├── auth/
│   ├── login.html               # Sign in page (routes based on role)
│   ├── register.html            # Voter registration form (forces 'voter' role)
│   └── verification.html        # Citizenship number, DOB, and ID document upload
├── voter/
│   ├── dashboard.html           # Voter home (shows active election banner)
│   ├── profile.html             # Profile details & verification status
│   ├── vote.html                # Digital ballot paper with candidate cards
│   └── results.html             # Secret ballot public tally
└── admin/
    ├── dashboard.html           # Admin metrics & quick navigation
    ├── voters.html              # Voter verification review table
    ├── elections.html           # Election lifecycle management
    ├── candidates.html          # Contestable positions & nominees
    └── results.html             # Turnout audits & official tallies
```

---

## 3. Supabase Setup Guide

### 3.1 Create Supabase Project
1. Visit [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **anon / public key** from `Project Settings -> API`.

### 3.2 Update Frontend Configuration
Open `config/supabase.js` and insert your credentials:
```javascript
const SUPABASE_URL = "https://your-project-id.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...your-public-anon-key";
```
> **Security Rule**: Never expose your `service_role` key in frontend code.

---

## 4. Database & Storage Setup

1. Navigate to **SQL Editor** in the Supabase Dashboard.
2. Run `database/schema.sql` to generate all 6 tables (`profiles`, `voters`, `elections`, `positions`, `candidates`, `votes`) and the automatic user registration trigger.
3. Run `database/policies.sql` to enable **Row Level Security (RLS)** and create storage policies.
4. Go to **Storage** -> ensure the `citizenship-docs` bucket is created and set to **Private**.
5. Run `database/seed.sql` to populate sample active election records.

---

## 5. Creating & Managing an Admin

By design, all public registrations through `auth/register.html` are strictly given the `voter` role.

To promote an administrative user:
1. Register/create an account via Supabase Auth (e.g. `admin@e-chunab.com`).
2. Run this query in Supabase SQL Editor:
```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'admin@e-chunab.com';
```
3. When this user logs in at `admin/login.html`, `js/admin/login.js` verifies their admin role and routes them to `admin/dashboard.html`.

---

## 6. How to Run Locally

You can serve the project using any standard HTTP static server:

### Option A: Python Built-in Server
```bash
python -m http.server 8000
```
Then visit: `http://localhost:8000`

### Option B: Node http-server or npx serve
```bash
npx serve .
```

### Option C: VS Code / Antigravity Live Server
Open the workspace directory and start Live Server on `index.html`.

---

## 7. Next Modules Implementation Order

* **Phase 2 & 3**: Supabase Client activation & Auth login/registration wiring.
* **Phase 4 & 5**: Voter citizenship upload to private Supabase Storage.
* **Phase 6**: Admin verification approval/rejection modal with stored reasons.
* **Phase 7, 8, 9**: Admin election, position, and candidate CRUD.
* **Phase 10**: Dynamic Voter Dashboard election detection.
* **Phase 11 & 12**: Voting ballot selection, verification eligibility check, review modal, and atomic RPC vote submission.
* **Phase 13, 14, 15**: Double-voting prevention audit, secret ballot results, and Chart.js turnout visualizations.
