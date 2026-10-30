package mn.achilt.driver;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.window.OnBackInvokedDispatcher;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
    private WebView web;
    private TextView status;
    private boolean changing, visible, askedWorkPermissions;
    private long lastAutoAttempt, lastPermissionReminder;
    private PermissionRequest mediaRequest;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Runnable refresh = new Runnable() {
        @Override public void run() {
            String last = DriverWorkService.lastUpload == 0 ? "" : getString(R.string.location_age, Math.max(0, (System.currentTimeMillis() - DriverWorkService.lastUpload) / 1000));
            String currentStatus = DriverWorkService.status;
            if (!DriverWorkService.running() && !notificationReady() && !DriverApi.cookie().isEmpty())
                currentStatus = "⚠ Мэдэгдэл асаана уу · Захиалга алдах эрсдэлтэй";
            status.setText(getString(R.string.work_status, currentStatus, DriverWorkService.running() ? last : ""));
            if (visible) {
                autoStartIfPossible();
                main.postDelayed(this, 1000);
            }
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(6,6,8));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setPadding(dp(12), dp(8), dp(12), dp(8));
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        TextView online = new TextView(this);
        online.setText("● ОНЛАЙН АВТОМАТ");
        online.setTextColor(Color.rgb(34,197,94));
        online.setTextSize(13);
        online.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(online, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button menu = new Button(this);
        menu.setText("⋮"); menu.setContentDescription("Тохиргоо, гарах");
        menu.setOnClickListener(this::showMenu);
        toolbar.addView(menu, new LinearLayout.LayoutParams(dp(56), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(toolbar);

        status = new TextView(this);
        status.setTextColor(Color.LTGRAY); status.setTextSize(12); status.setPadding(dp(16), dp(4), dp(16), dp(12));
        root.addView(status);
        web = new WebView(this); web.setBackgroundColor(Color.rgb(6,6,8));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setUserAgentString(settings.getUserAgentString() + " AchiltDriverAndroid/4");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        // No JavascriptInterface, message bridge, arbitrary URL intent or certificate bypass.
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) { runOnUiThread(() -> requestMedia(request)); }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (mediaRequest == request) mediaRequest = null; }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("За", (d,w) -> result.confirm()).setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { denyMedia(); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !WorkPolicy.trusted(DriverApi.ORIGIN, request.getUrl().toString());
                Uri url = request.getUrl();
                if (WorkPolicy.trusted(DriverApi.ORIGIN, url.toString())) return false;
                if (request.hasGesture() && ("https".equals(url.getScheme()) || "tel".equals(url.getScheme()))) {
                    try { startActivity(new Intent("tel".equals(url.getScheme()) ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, url)); }
                    catch (ActivityNotFoundException ignored) { message("Энэ холбоосыг нээх апп олдсонгүй."); }
                }
                return true;
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); message("Аюулгүй холболт үүссэнгүй. Утасны огноо, интернэтээ шалгана уу.");
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) message("Хуудас нээгдсэнгүй. Интернэтээ шалгаад ⋮ → Шинэчлэх дарна уу.");
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                main.postDelayed(MainActivity.this::autoStartIfPossible, 700);
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root); web.loadUrl(DriverApi.ORIGIN + "/driver");
        if (Build.VERSION.SDK_INT >= 33)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::navigateBack);
    }

    private boolean trustedMedia(PermissionRequest request) {
        if (!WorkPolicy.trusted(DriverApi.ORIGIN, request.getOrigin().toString()) || web.getUrl() == null || !WorkPolicy.trusted(DriverApi.ORIGIN, web.getUrl())) return false;
        if (request.getResources().length == 0) return false;
        for (String resource : request.getResources())
            if (!PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && !PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return false;
        return true;
    }
    private void requestMedia(PermissionRequest request) {
        if (!visible || !trustedMedia(request) || mediaRequest != null) { request.deny(); return; }
        mediaRequest = request;
        ArrayList<String> missing = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) missing.add(permission);
        }
        if (missing.isEmpty()) grantMedia();
        else requestPermissions(missing.toArray(new String[0]), 2);
    }
    private void grantMedia() {
        PermissionRequest request = mediaRequest; mediaRequest = null;
        if (request == null) return;
        if (!trustedMedia(request)) { request.deny(); return; }
        for (String resource : request.getResources()) {
            String permission = PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) { request.deny(); return; }
        }
        request.grant(request.getResources());
    }
    private void denyMedia() { if (mediaRequest != null) { mediaRequest.deny(); mediaRequest = null; } }

    private boolean notificationReady() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return getSystemService(NotificationManager.class).areNotificationsEnabled();
    }
    private void openPermissionSettings() {
        message("Мэдэгдэл болон байршлыг Зөвшөөрөх болгосны дараа Ачилт автоматаар онлайн болно.");
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
    }
    private void permissionReminder(String text) {
        long now = SystemClock.elapsedRealtime();
        status.setText(text);
        if (now - lastPermissionReminder < 25_000) return;
        lastPermissionReminder = now;
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
        try {
            if (Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager.class).getDefaultVibrator().vibrate(VibrationEffect.createOneShot(120, VibrationEffect.DEFAULT_AMPLITUDE));
            else getSystemService(Vibrator.class).vibrate(120);
        } catch (Exception ignored) {}
    }
    private void autoStartIfPossible() {
        if (!visible || changing || DriverWorkService.running() || DriverWorkService.busy()) return;
        String cookie = DriverApi.cookie();
        if (cookie.isEmpty()) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastAutoAttempt < 5_000) return;
        lastAutoAttempt = now;
        if (!notificationReady() || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            if (!askedWorkPermissions) {
                askedWorkPermissions = true;
                permissionsAndStart();
            } else permissionReminder("⚠ Мэдэгдэл, байршлын зөвшөөрлөө асаана уу. ⋮ → Зөвшөөрөл");
            return;
        }
        if (!getSystemService(LocationManager.class).isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            permissionReminder("⚠ GPS / Байршлаа асаана уу. Асаасны дараа автоматаар онлайн болно.");
            return;
        }
        permissionsAndStart();
    }
    private void permissionsAndStart() {
        ArrayList<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION); missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!missing.isEmpty()) {
            if (askedWorkPermissions && !shouldShowRequestPermissionRationale(missing.get(0))) { openPermissionSettings(); return; }
            askedWorkPermissions = true;
            requestPermissions(missing.toArray(new String[0]), 1); return;
        }
        if (!notificationReady()) { permissionReminder("⚠ Мэдэгдлээ асаана уу. ⋮ → Зөвшөөрөл"); return; }
        if (!getSystemService(LocationManager.class).isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            permissionReminder("⚠ Утасны GPS / Байршлаа асаана уу."); return;
        }
        if (changing || DriverWorkService.busy()) return;
        changing = true;
        network.execute(() -> {
            try {
                String cookie = DriverApi.cookie();
                JSONObject session = DriverApi.call("/api/driver/session", null, cookie);
                if (session.optBoolean("needsOnboarding")) throw new DriverApi.Failure(409, "Жолоочийн бүртгэлээ бүрэн дуусгана уу.");
                String id = session.getJSONObject("driver").getString("id");
                main.post(() -> {
                    changing = false;
                    if (!visible) return;
                    try {
                        DriverWorkService.lastUpload = 0;
                        startForegroundService(new Intent(this, DriverWorkService.class).putExtra("driverId", id));
                    } catch (RuntimeException error) { message("Ажил автоматаар эхэлсэнгүй. Зөвшөөрлөө шалгана уу."); }
                });
            } catch (Exception error) {
                main.post(() -> {
                    changing = false;
                    if (error instanceof DriverApi.Failure && ((DriverApi.Failure) error).status == 401) return;
                    message(error instanceof DriverApi.Failure ? error.getMessage() : "Сүлжээ саатсан. Автоматаар дахин оролдоно.");
                });
            }
        });
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        boolean allowed = grants.length > 0;
        for (int result : grants) allowed &= result == PackageManager.PERMISSION_GRANTED;
        if (code == 2) {
            if (allowed) grantMedia();
            else { denyMedia(); message("Видео дуудлагад камер, микрофоны зөвшөөрөл хэрэгтэй. ⋮ → Зөвшөөрөл хэсгээс өөрчилнө үү."); }
            return;
        }
        if (code == 1 && allowed) { askedWorkPermissions = false; permissionsAndStart(); }
        else { askedWorkPermissions = true; permissionReminder("⚠ Байршил болон мэдэгдлийн зөвшөөрөл хэрэгтэй. ⋮ → Зөвшөөрөл"); }
    }
    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add("Шинэчлэх"); menu.getMenu().add("Зөвшөөрөл"); menu.getMenu().add("Гарах");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getTitle().toString()) {
                case "Шинэчлэх": web.reload(); break;
                case "Зөвшөөрөл": openPermissionSettings(); break;
                case "Гарах": new AlertDialog.Builder(this).setMessage("Энэ төхөөрөмжөөс гарах уу?")
                    .setNegativeButton("Болих", null).setPositiveButton("Гарах", (d,w) -> logout()).show(); break;
            }
            return true;
        });
        menu.show();
    }
    private void logout() {
        if (changing) return;
        changing = true;
        DriverWorkService.stop(() -> network.execute(() -> {
            try {
                String cookie = DriverApi.cookie();
                if (!cookie.isEmpty()) DriverApi.call("/api/driver/logout", new JSONObject(), cookie);
                main.post(() -> {
                    changing = false;
                    web.clearCache(true); web.clearHistory(); WebStorage.getInstance().deleteAllData();
                    web.loadUrl(DriverApi.ORIGIN + "/driver");
                });
            } catch (Exception error) {
                main.post(() -> { changing = false; message("Гарах хүсэлт батлагдсангүй, сүлжээгээ шалгаад дахин оролдоно уу."); });
            }
        }));
    }
    private void message(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); status.setText(text); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    @Override protected void onResume() {
        super.onResume(); visible = true; main.removeCallbacks(refresh); main.post(refresh); web.onResume();
        main.postDelayed(this::autoStartIfPossible, 600);
    }
    @Override protected void onPause() { visible = false; main.removeCallbacks(refresh); CookieManager.getInstance().flush(); web.onPause(); super.onPause(); }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); web.loadUrl(DriverApi.ORIGIN + "/driver"); }
    // Android 13+ uses the registered platform callback above, including Android 16 gestures.
    // This override is retained only for Android 8–12; no AndroidX dependency is needed.
    @SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { navigateBack(); }
    private void navigateBack() {
        if (web.canGoBack()) web.goBack();
        else if (web.getUrl() == null || !web.getUrl().contains("/start")) web.loadUrl(DriverApi.ORIGIN + "/start");
    }
    @Override protected void onDestroy() { denyMedia(); main.removeCallbacks(refresh); web.destroy(); network.shutdown(); super.onDestroy(); }
}
