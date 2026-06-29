// Digital Asset Links — required for a Trusted Web Activity (TWA) to verify
// the Android app is authorized to open this site fullscreen (no URL bar).
//
// Set these env vars (in your hosting/Next env) AFTER your first Bubblewrap build:
//   TWA_PACKAGE_NAME        e.g. com.evertahumanics.sefine   (your Android applicationId)
//   TWA_SHA256_FINGERPRINT  the signing cert fingerprint Bubblewrap prints
// Reference: https://developers.google.com/digital-asset-links

const PACKAGE = process.env.TWA_PACKAGE_NAME || "com.evertahumanics.sefine";
const FINGERPRINT =
  process.env.TWA_SHA256_FINGERPRINT ||
  "PASTE_YOUR_SHA256_FINGERPRINT_FROM_BUBBLEWRAP_BUILD";

export async function GET() {
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PACKAGE,
        sha256_cert_fingerprints: [FINGERPRINT],
      },
    },
  ];
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
