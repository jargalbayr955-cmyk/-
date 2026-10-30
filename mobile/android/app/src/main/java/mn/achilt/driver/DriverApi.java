package mn.achilt.driver;

import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Native transport shares signed WebView auth cookies, never the driver's PIN or OTP. */
final class DriverApi {
    static final String ORIGIN = BuildConfig.SITE_ORIGIN;
    static final class Failure extends Exception {
        final int status;
        Failure(int status, String message) { super(message); this.status = status; }
    }
    private static String allCookies() { return CookieManager.getInstance().getCookie(ORIGIN); }
    /** Stable device/session proof used by the service to detect logout or account switching. */
    static String cookie() { return WorkPolicy.driverProof(allCookies()); }
    private static boolean sessionEndpoint(String path) { return "/api/driver/session".equals(path); }
    private static boolean logoutEndpoint(String path) { return "/api/driver/logout".equals(path); }
    private static void applyDriverAuthCookies(HttpURLConnection connection) {
        for (Map.Entry<String,List<String>> entry : connection.getHeaderFields().entrySet()) {
            if (!"set-cookie".equalsIgnoreCase(entry.getKey()) || entry.getValue() == null) continue;
            for (String raw : entry.getValue()) {
                if (raw == null) continue;
                String value = raw.trim();
                if (value.startsWith("achilt_driver_session=") || value.startsWith("achilt_driver_trust="))
                    CookieManager.getInstance().setCookie(ORIGIN, value);
            }
        }
    }
    static JSONObject call(String path, JSONObject body, String expectedProof) throws Exception {
        if (!path.startsWith("/api/driver/") || path.contains("..") || path.contains("?")) throw new IllegalArgumentException("API path");
        String before = allCookies();
        if (expectedProof == null || expectedProof.isEmpty() || !expectedProof.equals(WorkPolicy.driverProof(before)))
            throw new Failure(401, "Дахин нэвтэрч, ажлаа эхлүүлнэ үү.");

        boolean session = sessionEndpoint(path), logout = logoutEndpoint(path);
        String requestCookie = (session || logout) ? WorkPolicy.driverAuthHeader(before) : WorkPolicy.driverCookie(before);
        // A remembered-device proof may bootstrap /session or clear itself on /logout, but it is never enough for GPS/orders/chat APIs.
        if (requestCookie.isEmpty() || (!session && !logout && WorkPolicy.driverCookie(before).isEmpty()))
            throw new Failure(401, "Нэвтрэх session сэргээгүй байна.");

        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setRequestProperty("Cookie", requestCookie);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");
        try {
            if (body != null) {
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (var output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int code = connection.getResponseCode();
            JSONObject result;
            try (InputStream input = code < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while (input != null && (count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 262_144) throw new IllegalStateException("Response too large");
                    bytes.write(buffer, 0, count);
                }
                result = bytes.size() == 0 ? new JSONObject() : new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            }

            // Never apply a late response after logout or another account has replaced this device proof.
            if (!expectedProof.equals(cookie())) throw new Failure(401, "Нэвтрэлт өөрчлөгдсөн байна.");

            // A trusted-device session bootstrap must accept the server-issued active session.
            // Logout must accept both session/trust expiry cookies. With a legacy session that has
            // no trust proof, preserve the previous native behavior and let the visible WebView own renewal.
            boolean hasTrust = !WorkPolicy.driverTrustCookie(before).isEmpty();
            if (logout || (session && hasTrust)) {
                applyDriverAuthCookies(connection);
                CookieManager.getInstance().flush();
            }

            if (code < 200 || code >= 300) throw new Failure(code, result.optString("error", "Сервертэй холбогдсонгүй."));
            return result;
        } finally { connection.disconnect(); }
    }
}
