# Brahmastra Club

Membership and payment management app for Brahmastra Arts & Sports Club.

The public login page displays the 17 photos from `public/club-gallery` before sign-in. Selecting a thumbnail opens a photo viewer; keep only images approved for public viewing in that folder.

## Run the web app

Requires Node.js 20 or newer.

```powershell
npm install
Copy-Item .env.example .env
```

Set a private, random `JWT_SECRET` and a strong `INITIAL_ADMIN_PASSWORD` in `.env`, then start the server. `INITIAL_ADMIN_PASSWORD` is used only when creating the first admin account in an empty database.

```powershell
npm start
```

Open `http://localhost:4000`. The local SQLite database is stored in `server/data/club.db`.

## Email verification and password recovery

Applicants may provide an optional email address in the membership request. After approval, members can add or verify their email from **Edit Profile**. Email sign-in and the **Forgot password?** flow are enabled only after verification; password reset accepts either the registered mobile/member ID or verified email and sends a six-digit code to the verified address. Codes expire after 10 minutes, are limited to five attempts, and requests are rate-limited per account.

Configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the hosting environment (Railway Variables in production). Use a Google App Password for the sending Gmail account, not its regular password. Google requires two-step verification to create an App Password. Keep both values private and never commit them. Existing members must sign in once to add and verify their email; members who cannot sign in and have not verified an email must contact an administrator for account recovery.

If a member cannot use email recovery, an administrator can provide a temporary password. The member signs in with their registered mobile/member ID and that password, opens **Edit Profile → Change password**, and replaces it with a private password.

## Android app (Capacitor)

The Android app packages the existing `public` web interface. It sends API requests to `https://www.brahmastravakkom.in/api`. The domain must point to a deployed backend that is reachable over HTTPS before members can sign in from Android.

### Requirements

- Node.js 20 or newer
- Android Studio with the Android SDK installed
- A supported JDK installed and configured for Android Studio/Gradle
- The production API deployed on HTTPS, with persistent storage for `server/data/club.db`

### Create and open the Android project

Install the JavaScript dependencies and generate the native Android project once:

```powershell
npm install
npm run android:add
```

After making frontend changes, copy the latest web files into the Android project:

```powershell
npm run android:sync
```

Open the project in Android Studio:

```powershell
npm run android:open
```

In Android Studio, wait for Gradle sync, connect a device or start an emulator, then use **Run**. To build a debug APK from PowerShell after Android Studio has installed the SDK and Gradle wrapper:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
```

The debug APK is written to `android\app\build\outputs\apk\debug\app-debug.apk`.

### Deploy `brahmastravakkom.in` before release

1. Deploy the GitHub `main` branch to Railway with `npm install` as the build command and `npm start` as the start command.
2. Attach a Railway volume mounted at `/data` and set `DATA_DIR=/data` so SQLite data persists across deploys and restarts.
3. Set private `JWT_SECRET` and `INITIAL_ADMIN_PASSWORD` variables. Also set `CORS_ORIGINS=https://localhost,https://brahmastravakkom.in,https://www.brahmastravakkom.in`. Never commit secrets.
4. Add `www.brahmastravakkom.in` as a Railway custom domain and configure the exact CNAME and TXT records Railway displays in GoDaddy DNS. Verify the domain and HTTPS.
5. For Razorpay payments, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as Railway variables. Start with Razorpay test-mode API keys and enable automatic payment capture in the Razorpay Dashboard. Configure a `payment.captured` webhook at `https://www.brahmastravakkom.in/api/checkout/webhook` and use its generated secret as `RAZORPAY_WEBHOOK_SECRET`.
6. Test order creation, successful and failed checkout, and payment status updates in test mode before switching to live keys. The app marks dues paid only after server-side Razorpay verification or a valid captured-payment webhook.
7. Run `npm run android:sync`, build and test the Android app against the live API, then create a signed release build in Android Studio before distribution.

The API URL for native builds is configured in `public/index.html`. If the production API moves to another domain, update that URL and rebuild the Android app. Use a persistent volume and regular backups for the SQLite database.

Never commit `.env`, signing keys, or production credentials.
