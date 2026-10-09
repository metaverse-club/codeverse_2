# CodeVerse 2.0 — Team Registration & Payment Module

Welcome to the **CodeVerse 2.0** official Team Registration and Payment Verification system.

---

## 🌟 Key Features

### 1. Team Registration Wizard (Exactly 4 Members)
* **Team Leader First**: The Team Leader enters their details first as the designated primary contact person.
* **Strict 4 Member Rule**: Real-time counter badge and dynamic Add/Remove member controls enforce the hackathon requirement of **exactly 4 members**.
* **Per-Member Data Collection**:
  * Full Name
  * College Registration Number / Roll No.
  * College / Institutional Email Address
  * WhatsApp / Phone Number
* **Team-Level Metadata**: Unique Team Name, Innovation Track selector, and optional project problem statement.

### 2. Dual Payment Methods & Dynamic UPI QR
* **UPI**:
  * Generated on-the-fly scannable QR code (`upi://pay?...`) with pre-filled amount (₹400) and payee details.
  * UPI ID with 1-click clipboard copy and tooltip feedback.
* **Bank Transfer (NEFT / IMPS / RTGS)**:
  * Account Holder Name, Bank Name, Account Number, IFSC Code, Branch, and Account Type with 1-click copy buttons.
* **Zero-Credential Security Guarantee**: Prominently informs students that passwords, PINs, or OTPs are **never** requested.

### 3. Payment Verification & Receipt
* **UTR & Screenshot Submission**:
  * Payment method selector (UPI vs Bank Transfer).
  * 12-digit Transaction ID / UTR Number.
  * Transaction Date picker.
  * Drag & drop screenshot/receipt proof upload (JPG, PNG, WEBP, PDF up to 10MB).
* **Final Confirmation Receipt**:
  * Displays unique **Registration ID** (`CV26-TM-XXXXX`).
  * Team Name, Team Leader, Total Members, and Payment Status (`Payment Pending / Verification Pending`).
  * 1-click **Print / Download PDF Receipt** button with print-tailored stylesheet.

### 4. Admin & Organizer Dashboard (`/admin.html`)
* **Real-time Metrics**: Total Teams, Pending Verification, Verified Teams, Rejected Teams, and Total Verified Revenue.
* **Live Search & Filter**: Instant filtering by status (`PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, `PENDING_PAYMENT`) and search by Team Name, Registration ID, or UTR.
* **Team Inspection Modal**: Deep-dive view of full rosters (all 4 member details), transaction references, and zoomable proof screenshot preview lightbox.
* **One-Click Decision Updates**: Mark teams as `Verified` or `Rejected` with organizer audit notes.
* **CSV Export**: One-click download of the complete roster and payment ledger formatted for Excel.
* **Seed Demo Data**: Convenient button to populate test teams for demonstration.

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js** (v18 or higher; Node.js v24.13.0 tested with native `node:sqlite`)
* **npm**

### 2. Running Locally
```bash
# Start the production server
npm start

# Or start in development mode with auto-reload
npm run dev
```

### 3. Accessing the Applications
* **Student Registration Portal**: [http://localhost:3000](http://localhost:3000)
* **Organizer Admin Dashboard**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## 🗄️ Database Schema & Architecture

The database is powered by high-performance SQLite (`data/codeverse.db`) in WAL mode with foreign key enforcement:

* **`teams`**: Stores team ID, unique registration ID (`CV26-TM-XXXXX`), team name, track, project title, member count, and status.
* **`team_members`**: Foreign key to `teams(id)`. Stores full name, registration number, college email, phone number, and leader flag.
* **`payments`**: 1-to-1 foreign key to `teams(id)`. Stores payment method, UTR number, transaction date, amount, uploaded proof path, status, and admin notes.
