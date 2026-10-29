package br.com.csv2dmli.dicionario;

import android.app.Activity;
import android.net.Uri;
import android.os.StatFs;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.play.core.assetpacks.AssetPackException;
import com.google.android.play.core.assetpacks.AssetPackLocation;
import com.google.android.play.core.assetpacks.AssetPackManager;
import com.google.android.play.core.assetpacks.AssetPackManagerFactory;
import com.google.android.play.core.assetpacks.AssetPackState;
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener;
import com.google.android.play.core.assetpacks.AssetPackStates;
import com.google.android.play.core.assetpacks.model.AssetPackErrorCode;
import com.google.android.play.core.assetpacks.model.AssetPackStatus;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Ponte entre o HTML e o Play Asset Delivery, exposta como window.PonteMidias.
 *
 * O gerador (packages/android/limitesTamanho.js) grava em assets/midias-index.json os
 * pacotes de mídia baixados depois da instalação (fast-follow e on-demand). Esses pacotes
 * não ficam em file:///android_asset/: são extraídos no armazenamento interno, e o caminho
 * só é conhecido depois do download (getPackLocation). O HTML abre as mídias direto por
 * esse caminho (file://), o que mantém o avanço/retrocesso dos vídeos funcionando.
 *
 * Os métodos rodam na thread da ponte do WebView; os resultados voltam ao HTML como
 * eventos, por window.__midiasPacotesEvento(json), sempre na thread principal. Status e
 * códigos de erro vão como números (AssetPackStatus / AssetPackErrorCode): as mensagens
 * ficam no HTML.
 */
public class PonteMidias implements AssetPackStateUpdateListener {

    static final String ARQUIVO_INDICE = "midias-index.json";
    private static final String TAG = "PonteMidias";

    private final Activity activity;
    private final WebView webView;
    private final AssetPackManager gerente;
    private final String indice;
    private final List<String> pacotes = new ArrayList<>();
    private boolean confirmacaoAberta = false;

    /** Lê o índice dos assets; devolve null se o app não tem pacotes baixados depois da instalação. */
    static PonteMidias criarSeHouverPacotes(Activity activity, WebView webView) {
        String indice = lerAsset(activity, ARQUIVO_INDICE);
        if (indice == null) return null;
        try {
            return new PonteMidias(activity, webView, indice);
        } catch (JSONException e) {
            return null;
        }
    }

    private PonteMidias(Activity activity, WebView webView, String indice) throws JSONException {
        this.activity = activity;
        this.webView = webView;
        this.indice = indice;
        JSONArray lista = new JSONObject(indice).getJSONArray("pacotes");
        for (int i = 0; i < lista.length(); i++) pacotes.add(lista.getJSONObject(i).getString("nome"));
        this.gerente = AssetPackManagerFactory.getInstance(activity.getApplicationContext());
    }

    void registrar() {
        gerente.registerListener(this);
    }

    void desregistrar() {
        gerente.unregisterListener(this);
    }

    // ─── Métodos chamados pelo HTML ────────────────────────────────────────────

    @JavascriptInterface
    public String indice() {
        return indice;
    }

    /** URL file:// da pasta assets/ do pacote já baixado, terminada em "/", ou "" se ainda não está disponível. */
    @JavascriptInterface
    public String local(String pacote) {
        AssetPackLocation local = gerente.getPackLocation(pacote);
        if (local == null || local.assetsPath() == null) return "";
        return Uri.fromFile(new File(local.assetsPath())).toString() + "/";
    }

    /** Pede o estado de todos os pacotes; cada um volta como evento "estado". */
    @JavascriptInterface
    public void atualizar() {
        gerente.getPackStates(pacotes)
            .addOnSuccessListener(estados -> {
                for (AssetPackState estado : estados.packStates().values()) onStateUpdate(estado);
            })
            .addOnFailureListener(e -> enviarErro("atualizar", e, pacotes));
    }

    /** Baixa os pacotes (JSON com a lista de nomes), conferindo antes o espaço livre. */
    @JavascriptInterface
    public void baixar(String nomesJson) {
        List<String> nomes = lerNomes(nomesJson);
        if (nomes.isEmpty()) return;
        gerente.getPackStates(nomes)
            .addOnSuccessListener(estados -> {
                long faltam = 0;
                for (AssetPackState estado : estados.packStates().values()) {
                    if (estado.status() != AssetPackStatus.COMPLETED) {
                        faltam += estado.totalBytesToDownload() - estado.bytesDownloaded();
                    }
                }
                // Margem para a extração do pacote depois do download
                long livre = new StatFs(activity.getFilesDir().getAbsolutePath()).getAvailableBytes();
                if (faltam * 2 > livre) {
                    enviarErro("baixar", AssetPackErrorCode.INSUFFICIENT_STORAGE, nomes);
                    return;
                }
                gerente.fetch(nomes).addOnFailureListener(e -> enviarErro("baixar", e, nomes));
            })
            .addOnFailureListener(e -> enviarErro("baixar", e, nomes));
    }

    @JavascriptInterface
    public void cancelar(String nomesJson) {
        List<String> nomes = lerNomes(nomesJson);
        if (nomes.isEmpty()) return;
        AssetPackStates estados = gerente.cancel(nomes);
        for (AssetPackState estado : estados.packStates().values()) onStateUpdate(estado);
    }

    @JavascriptInterface
    public void remover(String nome) {
        List<String> nomes = new ArrayList<>();
        nomes.add(nome);
        gerente.removePack(nome)
            .addOnSuccessListener(nada -> atualizar())
            .addOnFailureListener(e -> enviarErro("remover", e, nomes));
    }

    // ─── Eventos para o HTML ───────────────────────────────────────────────────

    @Override
    public void onStateUpdate(AssetPackState estado) {
        int status = estado.status();
        // Download grande por dados móveis: a Play pede a confirmação do usuário
        if (status == AssetPackStatus.REQUIRES_USER_CONFIRMATION || status == AssetPackStatus.WAITING_FOR_WIFI) {
            pedirConfirmacao();
        }
        try {
            JSONObject evento = new JSONObject();
            evento.put("tipo", "estado");
            evento.put("nome", estado.name());
            evento.put("status", status);
            evento.put("erro", estado.errorCode());
            evento.put("baixado", estado.bytesDownloaded());
            evento.put("total", estado.totalBytesToDownload());
            evento.put("local", status == AssetPackStatus.COMPLETED ? local(estado.name()) : "");
            enviar(evento);
        } catch (JSONException ignorado) {
            // Os valores são sempre números e textos simples
        }
    }

    @SuppressWarnings("deprecation")
    private void pedirConfirmacao() {
        activity.runOnUiThread(() -> {
            if (confirmacaoAberta || activity.isFinishing()) return;
            confirmacaoAberta = true;
            gerente.showConfirmationDialog(activity)
                .addOnCompleteListener(t -> confirmacaoAberta = false);
        });
    }

    private void enviarErro(String acao, Exception e, List<String> nomes) {
        Log.w(TAG, "Falha em " + acao + " " + nomes, e);
        int codigo = (e instanceof AssetPackException)
            ? ((AssetPackException) e).getErrorCode()
            : AssetPackErrorCode.INTERNAL_ERROR;
        enviarErro(acao, codigo, String.valueOf(e), nomes);
    }

    private void enviarErro(String acao, int codigo, List<String> nomes) {
        enviarErro(acao, codigo, "", nomes);
    }

    private void enviarErro(String acao, int codigo, String mensagem, List<String> nomes) {
        try {
            JSONObject evento = new JSONObject();
            evento.put("tipo", "erro");
            evento.put("acao", acao);
            evento.put("erro", codigo);
            evento.put("mensagem", mensagem);
            evento.put("nomes", new JSONArray(nomes));
            enviar(evento);
        } catch (JSONException ignorado) {
            // Idem
        }
    }

    private void enviar(JSONObject evento) {
        final String js = "window.__midiasPacotesEvento && window.__midiasPacotesEvento(" + evento + ");";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    // ─── Utilitários ───────────────────────────────────────────────────────────

    private static List<String> lerNomes(String json) {
        List<String> nomes = new ArrayList<>();
        try {
            JSONArray lista = new JSONArray(json);
            for (int i = 0; i < lista.length(); i++) nomes.add(lista.getString(i));
        } catch (JSONException ignorado) {
            // Lista inválida: nada a fazer
        }
        return nomes;
    }

    private static String lerAsset(Activity activity, String nome) {
        try (InputStream in = activity.getAssets().open(nome)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            return null;
        }
    }
}
