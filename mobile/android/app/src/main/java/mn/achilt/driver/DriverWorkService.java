package mn.achilt.driver;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** User-started, visible location service. No boot receiver or hidden auto-start. */
public final class DriverWorkService extends Service implements LocationListener {
    static volatile DriverWorkService instance;
    static volatile String status = "Амарч байна · Байршил илгээхгүй";
    static volatile long lastUpload;
    private static final String WORK = "achilt_work", ORDERS = "achilt_orders";
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<String> seen = new HashSet<>();
    private LocationManager locations;
    private NotificationManager notifications;
    private PowerManager.WakeLock wake;
    private volatile Location latest;
    private volatile boolean stopping;
    private boolean starting = true;
    private String cookie, driverId;
    private long startedAt, sessionCheckedAt;

    static boolean running() { return instance != null && !instance.stopping; }
    static boolean busy() { return instance != null; }
    static void stop(Runnable after) {
        DriverWorkService current = instance;
        if (current == null) { if (after != null) after.run(); return; }
        current.finish("Амарч байна · Байршил илгээхгүй", true, after);
    }

    @Override public void onCreate() {
        super.onCreate();
        locations = getSystemService(LocationManager.class);
        notifications = getSystemService(NotificationManager.class);
        NotificationChannel work = new NotificationChannel(WORK, "Ажлын байршил", NotificationManager.IMPORTANCE_LOW);
        work.setDescription("Ажиллаж байх үед байршил илгээж байгааг харуулна.");
        notifications.createNotificationChannel(work);
        NotificationChannel orders = new NotificationChannel(ORDERS, "Шинэ захиалга", NotificationManager.IMPORTANCE_HIGH);
        orders.enableVibration(true);
        notifications.createNotificationChannel(orders);
        wake = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Achilt:DriverWork");
        wake.setReferenceCounted(false);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        if ("STOP".equals(intent.getAction())) { stop(null); return START_NOT_STICKY; }
        if (instance != null) return START_NOT_STICKY;
        instance = this;
        cookie = DriverApi.cookie();
        driverId = intent.getStringExtra("driverId");
        startedAt = SystemClock.elapsedRealtime();
        status = "GPS байршил тогтоож байна…";
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(1, workNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(1, workNotification());
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                throw new SecurityException();
            // Started from the visible activity, so a location FGS retains access when the screen locks.
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15_000, 0, this, Looper.getMainLooper());
            if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000, 0, this, Looper.getMainLooper());
            worker.scheduleWithFixedDelay(this::tick, 0, 20, TimeUnit.SECONDS);
        } catch (Exception error) { finish("GPS зөвшөөрлөө шалгаад дахин эхлүүлнэ үү.", true, null); }
        return START_NOT_STICKY;
    }

    @Override public void onLocationChanged(Location location) {
        Location old = latest;
        if (old == null || location.getElapsedRealtimeNanos() >= old.getElapsedRealtimeNanos()) latest = new Location(location);
    }
    @Override public void onProviderDisabled(String provider) {
        if (LocationManager.GPS_PROVIDER.equals(provider)) finish("GPS унтарсан тул ажил зогслоо.", true, null);
    }
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void tick() {
        if (stopping) return;
        // A bounded lock keeps each work interval alive; cleanup always releases it.
        wake.acquire(90_000);
        try {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                || !notifications.areNotificationsEnabled()
                || notifications.getNotificationChannel(ORDERS).getImportance() == NotificationManager.IMPORTANCE_NONE) {
                finish("Байршил, мэдэгдлийн зөвшөөрлөө шалгана уу.", true, null); return;
            }
            if (!Objects.equals(cookie, DriverApi.cookie())) {
                finish("Нэвтрэлт өөрчлөгдсөн. Аппаа нээгээд дахин эхлүүлнэ үү.", false, null); return;
            }
            long now = SystemClock.elapsedRealtime();
            if (sessionCheckedAt == 0 || now - sessionCheckedAt >= 60 * 60_000) {
                JSONObject session = DriverApi.call("/api/driver/session", null, cookie);
                if (!Objects.equals(driverId, session.getJSONObject("driver").getString("id"))) {
                    finish("Нэвтрэлт өөрчлөгдсөн байна.", false, null); return;
                }
                sessionCheckedAt = now;
            }
            if (stopping) return;
            JSONObject orders = DriverApi.call("/api/driver/orders", null, cookie);
            boolean accepted = orders.optJSONObject("acceptedOrder") != null;
            boolean unpaid = orders.optJSONObject("pendingPayment") != null;
            if (unpaid || (!starting && !WorkPolicy.keepWorking(orders.optBoolean("available"), accepted, false))) {
                finish(unpaid ? "Төлбөр хүлээгдэж байна · Байршил зогссон" : "Амарч байна · Байршил зогссон", false, null); return;
            }
            if (stopping) return;
            Location position = latest;
            long age = position == null ? Long.MAX_VALUE : (SystemClock.elapsedRealtimeNanos() - position.getElapsedRealtimeNanos()) / 1_000_000;
            if (position == null || !WorkPolicy.freshLocation(age, position.getAccuracy(), position.getLatitude(), position.getLongitude())) {
                status = "GPS хүлээж байна · Шинэ байршил илгээгээгүй";
                if (now - startedAt > 120_000 && (lastUpload == 0 || System.currentTimeMillis() - lastUpload > 120_000)) {
                    finish("GPS олдсонгүй. Ил задгай газар дахин эхлүүлнэ үү.", true, null); return;
                }
            } else {
                JSONObject body = new JSONObject().put("lat", position.getLatitude()).put("lng", position.getLongitude());
                // Only the initial explicit start may make the driver available. Heartbeats never do.
                if (starting && !accepted) body.put("available", true);
                JSONObject result = DriverApi.call("/api/driver/location", body, cookie);
                if (starting && !accepted && !result.optBoolean("available")) {
                    finish("Идэвхтэй ажил эсвэл төлбөрөө шалгана уу.", false, null); return;
                }
                starting = false;
                lastUpload = System.currentTimeMillis();
                status = accepted ? "Захиалга гүйцэтгэж байна · GPS ажиллаж байна" : "Ажиллаж байна · GPS ажиллаж байна";
            }
            if (!stopping) alertOrders(orders);
        } catch (DriverApi.Failure error) {
            if (error.status == 401 || error.status == 403) finish("Нэвтрэх эрх дууссан. Дахин нэвтэрнэ үү.", false, null);
            else status = error.status == 409 ? error.getMessage() : "Холболт саатсан · Дахин холбогдож байна";
            if (error.status == 409) finish(error.getMessage(), true, null);
        } catch (Exception error) { status = "Сүлжээ тасарсан · Байршил шинэчлэгдээгүй"; }
        finally { if (!stopping) notifications.notify(1, workNotification()); }
    }

    private void alertOrders(JSONObject body) throws JSONException {
        JSONArray orders = body.optJSONArray("orders");
        Set<String> live = new HashSet<>();
        if (orders != null) for (int i = 0; i < orders.length(); i++) {
            JSONObject order = orders.getJSONObject(i);
            String id = order.getString("id");
            live.add(id);
            if (!order.optBoolean("has_offered") && seen.add(id)) {
                notifyOrder(id, "Шинэ ачилтын захиалга", "Үнийн санал өгөхийн тулд нээнэ үү.");
            }
        }
        JSONObject accepted = body.optJSONObject("acceptedOrder");
        if (accepted != null) {
            String id = "accepted:" + accepted.getString("id");
            live.add(id);
            if (seen.add(id)) notifyOrder(id, "Таны саналыг сонголоо", "Захиалгаа нээж дэлгэрэнгүйг харна уу.");
        }
        for (String old : new HashSet<>(seen)) if (!live.contains(old)) { notifications.cancel(old, 2); seen.remove(old); }
    }
    private PendingIntent openApp() {
        return PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification workNotification() {
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, DriverWorkService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, WORK).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Ачилт Жолооч").setContentText(status).setContentIntent(openApp())
            .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
            .addAction(new Notification.Action.Builder(null, "Амарч эхлэх", stop).build()).build();
    }
    private void notifyOrder(String id, String title, String text) {
        notifications.notify(id, 2, new Notification.Builder(this, ORDERS).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(text).setContentIntent(openApp()).setAutoCancel(true)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setTimeoutAfter(600_000).build());
    }

    private synchronized void finish(String message, boolean offline, Runnable after) {
        if (stopping) { if (after != null) worker.execute(() -> main.post(after)); return; }
        stopping = true;
        status = message;
        main.post(() -> locations.removeUpdates(this));
        worker.execute(() -> {
            if (offline) try { DriverApi.call("/api/driver/availability", new JSONObject().put("available", false), cookie); }
            catch (Exception error) { status = message + " · Серверт төлөв батлагдаагүй; байршил хуучирмагц шинэ захиалга ирэхгүй."; }
            main.post(() -> {
                stopForeground(STOP_FOREGROUND_REMOVE);
                for (String id : seen) notifications.cancel(id, 2);
                stopSelf();
                if (after != null) after.run();
            });
        });
    }
    @Override public void onDestroy() {
        stopping = true;
        locations.removeUpdates(this);
        worker.shutdownNow();
        if (wake.isHeld()) wake.release();
        if (instance == this) instance = null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
