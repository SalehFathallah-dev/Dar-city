# DR. SALEH FATHULLAH – ORTHOPEDIC & SPORTS MEDICINE

**Orthopedic & Sports Injuries Medical System – Android app (APK), fully offline**

Sports-medicine records for the clubs and athletes under Dr. Saleh Fathullah's care: player registration,
examinations, injuries, follow-ups, treatments, rehabilitation, return-to-play, medical clearance, daily
availability, branded PDF reports, CSV exports and analytics.

- **All data stays on the phone** (app-private IndexedDB storage: records, photos and documents). No server, no internet needed.
- **Password lock** created on first launch; automatic lock after 15 minutes of inactivity.
- **Full Backup & Restore** (Export Center): one file with every record, photo and document – keep it in Google Drive.
  Restoring on a new phone brings everything back.
- PDFs and CSV files open in the phone's viewer or are shared through the Android share sheet (WhatsApp, e-mail, Drive…).

| Layer | Technology |
|---|---|
| App | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · jsPDF |
| Storage | IndexedDB on the device (`src/lib/localdb.ts`), business rules in `src/lib/api.ts` |
| Android | Capacitor 7 (`android/`), signed release APK |

## Getting the APK

Every push to the branch runs `.github/workflows/android-apk.yml`, which builds a signed APK and publishes it as a
GitHub **Release** (`Dr-Saleh-Fathullah.apk`). Open the release on the phone, download the APK and install it.
New versions install over the old one and keep all data (same signing key, increasing version code).

## Development

```bash
npm install
npm run dev          # browser preview at http://localhost:5173
npm test             # unit tests
npm run android      # build web app + sync into the Android project
cd android && ./gradlew assembleRelease   # requires the Android SDK
```
