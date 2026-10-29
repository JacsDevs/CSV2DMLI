package br.com.csv2dmli.dicionario;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView webView;
    // Só existe quando o app tem pacotes de mídia baixados depois da instalação (ver PonteMidias)
    private PonteMidias ponteMidias;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();

        settings.setJavaScriptEnabled(true);
        // Também dá acesso às mídias dos pacotes baixados (file:// no armazenamento interno)
        settings.setAllowFileAccess(true);
        settings.setDomStorageEnabled(true);
        // Permite áudio sem gesto explícito do utilizador (pronúncia ao clicar)
        settings.setMediaPlaybackRequiresUserGesture(false);

        ponteMidias = PonteMidias.criarSeHouverPacotes(this, webView);
        if (ponteMidias != null) webView.addJavascriptInterface(ponteMidias, "PonteMidias");

        webView.setWebViewClient(new WebViewClient());
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ponteMidias != null) {
            ponteMidias.registrar();
            // Downloads podem ter avançado com o app em segundo plano
            ponteMidias.atualizar();
        }
    }

    @Override
    protected void onPause() {
        if (ponteMidias != null) ponteMidias.desregistrar();
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
