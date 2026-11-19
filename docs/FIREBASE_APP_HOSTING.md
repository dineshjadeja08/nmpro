# Firebase App Hosting from nmpro

Use the existing Firebase project `nammapro-api` and connect the GitHub repository `dineshjadeja08/nmpro` on branch `main`.

| App | App Hosting root directory |
| --- | --- |
| Customer web | `apps/web` |
| Admin | `apps/admin` |

Each app has its own `package-lock.json` and `apphosting.yaml`. The web app's shared packages are inside `apps/web/packages`, so the App Hosting Next.js adapter can find its standalone route manifest. Both apps use Next.js 16.4.6.

The web App Hosting configuration sets the public Firebase client identifiers and the Cloud Run API URL. The admin configuration sets the API URL. Set `NEXT_PUBLIC_SITE_URL` for the web app to its final HTTPS domain in the App Hosting environment settings. Add the deployed web and admin domains to the API's CORS and CSRF allowlists.

The existing backend currently has phone authentication disabled, so customer OTP login will remain unavailable until Firebase Phone Authentication and backend token verification are enabled.

To check builds locally, run `npm ci` and `npm run build` from each app directory. The backend Cloud Run workflow runs only when `services/api` or its Dockerfile changes; frontend commits do not trigger an API redeployment.
