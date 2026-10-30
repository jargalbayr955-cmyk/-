package mn.achilt.driver;

import android.Manifest;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Restores the driver's foreground work service after a reboot or app update when it is safe to do so. */
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        if (!DriverWorkState.enabled(context)) return;
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 29
            && context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 33
            && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (notifications == null || !notifications.areNotificationsEnabled()) return;

        String driverId = DriverWorkState.driverId(context);
        if (driverId.isEmpty()) {
            DriverWorkState.clear(context);
            return;
        }
        try {
            Intent work = new Intent(context, DriverWorkService.class)
                .putExtra("driverId", driverId)
                .putExtra("recovered", true);
            context.startForegroundService(work);
        } catch (RuntimeException ignored) {
            // Android may temporarily block a background foreground-service start.
            // The next normal app open revalidates the session and starts work again.
        }
    }
}
