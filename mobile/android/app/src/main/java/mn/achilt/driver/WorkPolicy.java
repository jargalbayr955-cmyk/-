package mn.achilt.driver;

import java.net.URI;

/** Pure decisions shared by the UI/service and covered by JVM tests. */
final class WorkPolicy {
    static boolean trusted(String origin, String url) {
        try {
            URI base = URI.create(origin), target = URI.create(url);
            return "https".equals(target.getScheme()) && base.getHost().equals(target.getHost())
                && target.getUserInfo() == null && (target.getPort() == -1 || target.getPort() == 443);
        } catch (RuntimeException error) { return false; }
    }
    static boolean freshLocation(long ageMs, float accuracy, double lat, double lng) {
        return ageMs >= 0 && ageMs <= 60_000 && Float.isFinite(accuracy) && accuracy > 0 && accuracy <= 150
            && Double.isFinite(lat) && Double.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }
    static boolean keepWorking(boolean available, boolean accepted, boolean unpaid) {
        return !unpaid && (available || accepted);
    }
    private static String namedCookie(String header, String name) {
        if (header == null) return "";
        String prefix = name + "=";
        for (String part : header.split(";")) {
            String cookie = part.trim();
            if (cookie.startsWith(prefix) && cookie.length() > prefix.length()) return cookie;
        }
        return "";
    }
    /** Active API session cookie. This is the only credential sent to normal driver APIs. */
    static String driverCookie(String header) {
        return namedCookie(header, "achilt_driver_session");
    }
    /** Long-lived signed device proof. It is used only to restore / clear a driver session. */
    static String driverTrustCookie(String header) {
        return namedCookie(header, "achilt_driver_trust");
    }
    /** Stable local proof used to detect account switches while native requests are running. */
    static String driverProof(String header) {
        String trusted = driverTrustCookie(header);
        return trusted.isEmpty() ? driverCookie(header) : trusted;
    }
    /** Forward only driver-role cookies and never admin/customer cookies. */
    static String driverAuthHeader(String header) {
        String session = driverCookie(header), trusted = driverTrustCookie(header);
        if (session.isEmpty()) return trusted;
        if (trusted.isEmpty()) return session;
        return session + "; " + trusted;
    }
}
