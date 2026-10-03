# Brahmastra Club

Membership and payment management app for Brahmastra Arts & Sports Club.

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

## Android app (Capacitor)

The Android app packages the existing `public` web interface. It sends API requests to `https://brahmastravakkom.in/api`. The domain must point to a deployed backend that is reachable over HTTPS before members can sign in from Android.

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

1. Create a Render Web Service from the GitHub repository and deploy the `main` branch. Use `npm install` as the build command and `npm start` as the start command.
2. Attach a persistent disk to the service at `/var/data`. Render requires a paid web service for persistent disks. Set `DATA_DIR=/var/data` so the SQLite database survives deploys and restarts.
3. Set `JWT_SECRET` to a private random value, `INITIAL_ADMIN_PASSWORD` to a strong password you will use for the initial `brahmastra01` login, and `CORS_ORIGINS=https://localhost,https://brahmastravakkom.in,https://www.brahmastravakkom.in` in the hosting environment. Never commit these secrets.
4. Wait for a successful deployment and test the generated `onrender.com` address. In the Render service settings, add `brahmastravakkom.in` as a custom domain and follow the DNS records Render displays.
5. In GoDaddy DNS, add the records Render specifies for the root domain and (if desired) `www`. Remove conflicting `AAAA` records, then verify the domain in Render and wait for HTTPS to activate.
6. Run `npm run android:sync`, build and test the Android app against the live API, then create a signed release build in Android Studio before distribution.

The API URL for native builds is configured in `public/index.html`. If the production API moves to another domain, update that URL and rebuild the Android app. Use a persistent volume and regular backups for the SQLite database.

Never commit `.env`, signing keys, or production credentials.
