# Brahmastra Club Web App Architecture

This document describes the current web and Android app, its backend, and the main data flows.

## System overview

```mermaid
flowchart LR
    subgraph Clients
        Browser["Mobile or desktop browser<br/>public/index.html + app.js"]
        Android["Android app<br/>Capacitor WebView + bundled public assets"]
    end

    subgraph Hosting["Express application (Node.js 20+)"]
        Static["Static web assets<br/>login, member/admin dashboards, gallery"]
        Middleware["JSON parsing + CORS"]
        Auth["Authentication middleware<br/>JWT verification + admin role checks"]
        Routes["API route groups<br/>auth · members · registrations · payments<br/>checkout · expenses · dashboard · game"]
        Services["Backend services<br/>OTP + email · SMS · Razorpay"]
        SqlJs["sql.js database adapter<br/>SQLite-compatible synchronous API"]
    end

    subgraph Storage["Persistent storage"]
        SQLite[("SQLite database<br/>members, registrations, payments,<br/>orders, OTPs, expenses, donations, scores")]
        Volume["Persistent filesystem / Railway volume<br/>DATA_DIR"]
    end

    subgraph External["External services"]
        Gmail["Gmail SMTP<br/>email verification + password-reset OTP"]
        Fast2SMS["Fast2SMS<br/>optional SMS notifications"]
        Razorpay["Razorpay<br/>online dues checkout + captured-payment webhook"]
    end

    Browser -->|"GET app + assets"| Static
    Static --> Browser
    Browser -->|"JSON API requests<br/>relative /api URL; Bearer JWT after sign-in"| Middleware
    Android -->|"bundled UI; JSON API requests<br/>HTTPS production API URL"| Middleware
    Middleware --> Auth
    Auth --> Routes
    Routes --> SqlJs
    SqlJs <-->|"load / persist database file"| SQLite
    SQLite --- Volume
    Routes --> Services
    Services --> Gmail
    Services --> Fast2SMS
    Services --> Razorpay
    Razorpay -->|"payment.captured webhook"| Middleware
```

The Express server serves the browser interface and API from the same application. The Android app bundles the same `public` interface with Capacitor and calls the configured HTTPS production API. Signed-in requests carry a JWT in the `Authorization: Bearer ...` header. Protected routes verify the token; administrative routes also check the user's role.

## Main workflows

```mermaid
flowchart TD
    Visitor["Visitor"] --> UI["Public login and membership request<br/>17-photo club gallery"]
    UI -->|"/api/auth/register"| Pending[("Pending registration")]
    Admin["Administrator"] --> AdminUI["Admin dashboard<br/>members · registrations · dues · expenses"]
    AdminUI -->|"/api/registrations"| Pending
    AdminUI -->|approve request| Approval["Approval route<br/>hash password + create member"]
    Pending --> Approval
    Approval --> Members[("Member account")]
    Approval --> SMS["Optional approval SMS"]

    Member["Member"] --> Login["Sign in with mobile/member ID<br/>or verified email"]
    Login -->|"/api/auth/login"| JWT["JWT session"]
    JWT --> Profile["Profile, payment history,<br/>directory and game"]
    Profile -->|email verification / password reset| OTP["OTP challenge"]
    OTP --> Email["Gmail SMTP"]

    AdminUI -->|monthly and yearly dues APIs| Payments[("Monthly payment status")]
    Profile -->|create order| Checkout["Checkout API"]
    Checkout --> Razorpay["Razorpay checkout"]
    Razorpay -->|signed payment verification| Checkout
    Razorpay -->|captured event webhook| Checkout
    Checkout -->|verified captured payment only| Payments
    AdminUI -->|manual paid/unpaid update| Payments

    AdminUI --> ExpenseAPI["Expenses API"]
    ExpenseAPI --> Expenses[("Expenses and donations")]
    AdminUI --> DashboardAPI["Dashboard summary API"]
    DashboardAPI --> Payments
    DashboardAPI --> Expenses
```

Manual admin dues updates only record a status; they do not collect funds. Online member dues are marked paid only after successful server-side verification of a captured Razorpay payment.

## Data model

```mermaid
erDiagram
    MEMBERS ||--o{ PAYMENTS : "has monthly dues"
    MEMBERS ||--o{ PAYMENT_ORDERS : "starts checkout"
    MEMBERS ||--o{ OTP_CHALLENGES : "requests verification or reset"
    MEMBERS ||--o{ GAME_SCORES : "earns scores"
    EXPENSES ||--o{ DONATIONS : "groups donations"

    MEMBERS {
        string member_id PK
        string name
        string mobile
        string email
        string email_verified_at
        string password_hash
        string role
    }
    REGISTRATIONS {
        integer id PK
        string name
        string mobile
        string email
        string status
    }
    PAYMENTS {
        integer id PK
        string member_id FK
        integer month
        integer year
        integer amount
        string status
        string paid_at
    }
    PAYMENT_ORDERS {
        string order_id PK
        string member_id FK
        integer month
        integer year
        integer amount
        string status
        string payment_id
    }
    OTP_CHALLENGES {
        integer id PK
        string member_id FK
        string purpose
        string email
        string code_hash
        integer expires_at
        integer attempts
    }
    EXPENSES {
        integer id PK
        integer month
        integer year
        real total_expense
    }
    DONATIONS {
        integer id PK
        integer expense_id FK
        string purpose
        real amount
    }
    GAME_SCORES {
        integer id PK
        string member_id FK
        integer score
        string game
    }
```

Registration requests remain in `REGISTRATIONS` until an administrator approves them. Approval creates a row in `MEMBERS` and updates the request status; registrations are not linked by a foreign key to member accounts.

## Repository map

- `public/index.html`, `public/app.js`: single-page interface and API client.
- `server/index.js`: Express startup, CORS, API mounting, and static-file serving.
- `server/routes/`: authentication, member/profile, registration, dues/payment checkout, expenses, dashboard, and game APIs.
- `server/middleware/auth.js`: JWT authentication and administrator authorization.
- `server/services/`: OTP/email, SMS, and Razorpay integrations.
- `server/db.js`: database schema/migrations and the sql.js-backed SQLite adapter.
- `android/` and `capacitor.config.json`: native Android wrapper configuration.

## Runtime and configuration

- Run locally with Node.js 20+, `.env` configured, and `npm start`; the default port is `4000`.
- Local data is stored at `server/data/club.db`. Set `DATA_DIR` to a mounted persistent directory in production.
- Set secrets such as `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, email/SMS credentials, and Razorpay credentials in the deployment environment, not source control.
- `public/index.html` selects `/api` for a browser and `https://www.brahmastravakkom.in/api` for a Capacitor native build.
