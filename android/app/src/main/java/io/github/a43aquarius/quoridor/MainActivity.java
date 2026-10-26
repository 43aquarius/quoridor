package io.github.a43aquarius.quoridor;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * 步步为营 · Quoridor —— Android 壳。
 *
 * 以 WebView 加载线上对弈站，配合站点内的 window.AndroidBridge 原生桥：
 * - 棋谱海报下载：页面把 canvas blob 转 base64 调 {@link PosterBridge#savePoster}，
 *   原生侧经 MediaStore / 公共下载目录落盘（WebView 自身无法下载 blob: 链接）。
 * - 站内链接继续在壳内浏览；外域链接（如 GitHub 仓库页）唤起系统浏览器。
 * - 主框架网络错误回落到 assets/offline.html（纸面风格离线页，自动重连）。
 */
public class MainActivity extends Activity {

    private static final String TARGET_URL = "https://d1n1c9rzwhe0-d.space.zhipuaidemo.cn/";
    private static final String TARGET_HOST = "d1n1c9rzwhe0-d.space.zhipuaidemo.cn";
    private static final String OFFLINE_URL = "file:///android_asset/offline.html";

    private WebView webView;
    private ProgressBar progress;
    private long lastBackAt = 0L;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        // 对局时间动辄数十分钟：保持屏幕常亮
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = findViewById(R.id.webview);
        progress = findViewById(R.id.progress);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                        // localStorage 存档/续读
        s.setMediaPlaybackRequiresUserGesture(false);        // AI 应手音效免手势
        s.setSupportZoom(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                                  // 免系统字体缩放破坏排版
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                // 站点为纸白亮色主题，禁用系统强制的暗色反转
                s.setForceDark(WebSettings.FORCE_DARK_OFF);
            } catch (Throwable ignored) {
            }
        }

        webView.addJavascriptInterface(new PosterBridge(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) {
                    return false;
                }
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null
                        ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
                if (("http".equals(scheme) || "https".equals(scheme))
                        && TARGET_HOST.equals(uri.getHost())) {
                    return false; // 站内导航继续走壳内
                }
                openExternally(uri);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.loadUrl(OFFLINE_URL);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progress.setVisibility(View.VISIBLE);
                    progress.setProgress(newProgress);
                } else {
                    progress.setVisibility(View.GONE);
                }
            }
        });

        webView.loadUrl(TARGET_URL);
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Throwable ignored) {
            // 无可处理的应用，忽略
        }
    }

    /* 返回键：站内可回退则回退，否则双击退出 */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000) {
            super.onBackPressed();
        } else {
            lastBackAt = now;
            Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            try {
                webView.loadUrl("about:blank");
            } catch (Throwable ignored) {
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /* 棋谱海报原生保存桥：页面 JS 将 blob 转 data URL 后调用 */
    private class PosterBridge {

        @JavascriptInterface
        public void savePoster(final String dataUrl, final String fileName) {
            new Thread(() -> {
                String msg;
                try {
                    byte[] png = decodeDataUrl(dataUrl);
                    Uri saved = saveToDownloads(sanitize(fileName), png);
                    msg = saved != null
                            ? getString(R.string.poster_saved)
                            : getString(R.string.poster_failed);
                } catch (Exception e) {
                    msg = getString(R.string.poster_failed);
                }
                final String m = msg;
                runOnUiThread(() ->
                        Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show());
            }).start();
        }

        private byte[] decodeDataUrl(String dataUrl) throws IllegalArgumentException {
            if (dataUrl == null || !dataUrl.startsWith("data:")) {
                throw new IllegalArgumentException("not a data url");
            }
            int comma = dataUrl.indexOf(',');
            if (comma < 0) {
                throw new IllegalArgumentException("malformed data url");
            }
            return Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
        }

        private String sanitize(String name) {
            if (name == null || name.trim().isEmpty()) {
                return "quoridor-poster.png";
            }
            return name.replaceAll("[\\\\/:*?\"<>|\\s]", "_");
        }

        private Uri saveToDownloads(String name, byte[] png) throws Exception {
            if (Build.VERSION.SDK_INT >= 29) {
                // Android 10+：MediaStore 无需任何权限
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "image/png");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver()
                        .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) {
                    return null;
                }
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) {
                        return null;
                    }
                    os.write(png);
                    os.flush();
                }
                return uri;
            } else {
                // Android 7-9：优先公共下载目录（需写权限），失败退回应用外部私有目录（免权限）
                try {
                    File dir = Environment
                            .getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        dir.mkdirs();
                    }
                    return writeBytes(new File(dir, name), png);
                } catch (Exception e) {
                    File priv = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (priv == null) {
                        priv = getFilesDir();
                    }
                    //noinspection ResultOfMethodCallIgnored
                    priv.mkdirs();
                    return writeBytes(new File(priv, name), png);
                }
            }
        }

        private Uri writeBytes(File out, byte[] png) throws Exception {
            try (OutputStream os = new FileOutputStream(out)) {
                os.write(png);
                os.flush();
            }
            return Uri.fromFile(out);
        }
    }
}
