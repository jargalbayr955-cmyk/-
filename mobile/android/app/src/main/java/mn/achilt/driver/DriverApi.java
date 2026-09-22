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

/** Native transport shares the WebView's HttpOnly cookie, never the driver's PIN. */
final class DriverApi {
    static final String ORIGIN = BuildConfig.SITE_ORIGIN;
    static final class Failure extends Exception {
        final int status;
        Failure(int status, String message) { super(message); this.status = status; }
    }
    static String cookie() { return WorkPolicy.driverCookie(CookieManager.getInstance().getCookie(ORIGIN)); }
    static JSONObject call(String path, JSONObject body, String expectedCookie) throws Exception {
        if (!path.startsWith("/api/driver/") || path.contains("..") || path.contains("?")) throw new IllegalArgumentException("API path");
        if (expectedCookie.isEmpty() || !expectedCookie.equals(cookie())) throw new Failure(401, "Дахин нэвтэрч, ажлаа эхлүүлнэ үү.");
        HttpURLConnection connection = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(10_000);
        connection.setRequestProperty("Cookie", expectedCookie);
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
            if (code < 200 || code >= 300) throw new Failure(code, result.optString("error", "Сервертэй холбогдсонгүй."));
            // Do not let an old request restore a cookie after logout or another login.
            if (!expectedCookie.equals(cookie())) throw new Failure(401, "Нэвтрэлт өөрчлөгдсөн байна.");
            // The visible web session owns renewal. A background response must never
            // restore an old account's cookie during an account switch or logout.
            for (Map.Entry<String,List<String>> entry : connection.getHeaderFields().entrySet()) {
                if (path.equals("/api/driver/logout") && "set-cookie".equalsIgnoreCase(entry.getKey())) {
                    for (String value : entry.getValue()) {
                        if (value.startsWith("achilt_driver_session=")) CookieManager.getInstance().setCookie(ORIGIN, value);
                    }
                }
            }
            CookieManager.getInstance().flush();
            return result;
        } finally { connection.disconnect(); }
    }
}
