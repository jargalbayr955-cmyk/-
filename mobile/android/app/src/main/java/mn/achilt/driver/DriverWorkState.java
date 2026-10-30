package mn.achilt.driver;

import android.content.Context;
import android.content.SharedPreferences;

/** Small device-local marker used only to decide whether driver work may auto-recover. */
final class DriverWorkState {
    private static final String PREFS = "achilt_driver_work";
    private static final String ENABLED = "enabled";
    private static final String DRIVER_ID = "driver_id";
    private static final String BACKGROUND_PROMPTED = "background_prompted";

    private DriverWorkState() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void remember(Context context, String driverId) {
        if (driverId == null || driverId.trim().isEmpty()) return;
        prefs(context).edit()
            .putBoolean(ENABLED, true)
            .putString(DRIVER_ID, driverId)
            .apply();
    }

    static boolean enabled(Context context) {
        return prefs(context).getBoolean(ENABLED, false);
    }

    static String driverId(Context context) {
        String value = prefs(context).getString(DRIVER_ID, "");
        return value == null ? "" : value;
    }

    static boolean backgroundPrompted(Context context) {
        return prefs(context).getBoolean(BACKGROUND_PROMPTED, false);
    }

    static void markBackgroundPrompted(Context context) {
        prefs(context).edit().putBoolean(BACKGROUND_PROMPTED, true).apply();
    }

    static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
