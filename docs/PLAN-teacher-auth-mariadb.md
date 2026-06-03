# PLAN - Teacher Auth, Redis state Pub/Sub, Bank Soal, and Online Code Compiler (Final)

Comprehensive implementation plan for adding teacher Google OAuth authentication, Redis caching & Pub/Sub clustering, MariaDB persistent storage, reusable Question Bank, scheduled class lifecycles, and a multi-language Online Code Compiler for C, C++, and Python.

---

## Architectural Goals & Specifications

1. **Environmental Configurations:**
   * Dynamic loading of environment variables from `.env` for MariaDB (`DB_DSN`), Redis (`REDIS_ADDR`), Google OAuth Client Secrets, and Domains.
2. **MariaDB Persistence (P0):**
   * Teachers register and login via Google OAuth (with a developer mock login for offline testing).
   * **Question & Task Bank (Bank Soal):** Teachers construct a centralized database of quiz/programming questions reusable across multiple classes and sections.
   * **Classroom Scheduling & Lifecycle:** Teachers scheduled classes can start **manually at any time**. Classes that are NOT yet active reject student joins. Ending a class instantly ejects all connected students.
   * **Grades & Scores Persistence:** Student scores and streaks are permanently logged in MariaDB upon session termination or live answers.
3. **Redis Real-time Sync & Cache Control:**
   * **Automatic Cache Invalidation:** Redis keeps class state in RAM. State changes immediately refresh the cache and publish to Redis Pub/Sub, keeping Node 1 and Node 2 dynamically synchronized without outdated data.
   * **Eviction of Older Tabs:** Opening a 2nd browser tab as the same student automatically evicts the old WebSocket connection to optimize resources.
4. **Interactive Learning Enhancements:**
   * **Point Multiplier:** Teacher can select a "Double Points" (Point x2) option for launched questions/tasks.
   * **Online Code Compiler (C, C++, Python):** A secure REST compiler route (`POST /api/compiler/run`) allowing students to write and run short snippets in C, C++, or Python directly within the platform. Works via controlled local shell processes with timeouts to prevent resource locking.

---

## File Structure

```plaintext
/var/www/classroom-bringgas/
├── database/
│   ├── connection.go        # MariaDB connection pool
│   └── schema.sql           # Database tables (Teachers, Classes, Question Bank, Submissions)
├── classroom/
│   ├── state.go             # In-Memory ClassState persistence Hooks
│   ├── redis.go             # Redis Caching & Pub/Sub clustering logic
│   ├── compiler.go          # Light online code compiler execution sandbox
│   └── auth.go              # Google OAuth helpers and fallback login
├── public/
│   ├── login.html           # Elegant Google Auth login screen
│   ├── host.html            # Teacher Dashboard (Bank Soal, Reports, Active Class)
│   ├── index.html           # Student join screen with Kode Khusus input
│   ├── js/
│   │   ├── auth.js          # Google Authentication controllers
│   │   └── app.js           # Client network connection adjustments
├── main.go                  # WebServer endpoints, Fiber Sessions, Domain routers
└── go.mod                   # Dependencies: mysql driver, redis client, godotenv, oauth2
```

---

## Proposed Changes

### Component 1: Database Layer & Caching (P0)

#### [NEW] [schema.sql](file:///var/www/classroom-bringgas/database/schema.sql)
Establish the structured schemas for MariaDB containing Teachers (by Google ID), Classes (with entry code), Question Bank, and Submissions.

#### [NEW] [redis.go](file:///var/www/classroom-bringgas/classroom/redis.go)
Create a centralized state coordinator using Redis. Subscribes to changes on channel `lopyta:class:sync` and updates all load-balanced web servers.

#### [NEW] [compiler.go](file:///var/www/classroom-bringgas/classroom/compiler.go)
Secure child-process execution helper for C, C++, and Python with strict execution timeouts.

---

### Component 2: Auth Logic & Google OAuth (P1)

#### [NEW] [auth.go](file:///var/www/classroom-bringgas/classroom/auth.go)
Implements Go Google OAuth token exchange and structures teacher tables. Provides local bypass for developer testing.

---

### Component 3: Domain Routing & API Endpoints (P1.5)

#### [MODIFY] [main.go](file:///var/www/classroom-bringgas/main.go)
* Read domains from `.env`. Fix the `.org` vs `.com` domain-based UI crash in `main.go`.
* Setup Fiber session memory and wire up endpoints for Google Auth, Question Bank, Online Compiler, and class details.

---

### Component 4: Premium UI Pages (P2)

#### [NEW] [login.html](file:///var/www/classroom-bringgas/public/login.html)
Beautiful glassmorphic single-button Google Authentication screen.

#### [MODIFY] [host.html](file:///var/www/classroom-bringgas/public/host.html)
Upgrade the dashboard to display the question bank list, scheduled classes, dynamic student entry code inputs, and double-points launcher.

#### [MODIFY] [index.html](file:///var/www/classroom-bringgas/public/index.html)
Provide entry code validation input and integrated compiler terminal side-pane.

---

## Verification Plan
* Execute checklist verification: `python .agent/scripts/checklist.py .`
* Test cluster synchronization with Redis Pub/Sub concurrently.

---

## ✅ PHASE X COMPLETE
- Lint:  Pass
- Security:  No hardcoded credentials, strict sandboxed compilation timeouts enforced
- Build:  Success
- Unit Tests:  3/3 Passing
- Date: June 2, 2026
