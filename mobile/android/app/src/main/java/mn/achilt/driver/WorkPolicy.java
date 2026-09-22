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
    static String driverCookie(String header) {
        if (header == null) return "";
        for (String part : header.split(";")) {
            String cookie = part.trim();
            if (cookie.startsWith("achilt_driver_session=") && cookie.length() > "achilt_driver_session=".length()) return cookie;
        }
        return "";
    }
}
