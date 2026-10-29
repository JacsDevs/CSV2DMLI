package br.com.csv2dmli.nativo

import android.app.Activity
import android.net.Uri
import android.os.StatFs
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import com.google.android.play.core.assetpacks.AssetPackException
import com.google.android.play.core.assetpacks.AssetPackManager
import com.google.android.play.core.assetpacks.AssetPackManagerFactory
import com.google.android.play.core.assetpacks.AssetPackState
import com.google.android.play.core.assetpacks.AssetPackStateUpdateListener
import com.google.android.play.core.assetpacks.model.AssetPackErrorCode
import com.google.android.play.core.assetpacks.model.AssetPackStatus
import org.json.JSONObject
import java.io.File

/** Pacote de mídia baixado depois da instalação, como descrito no midias-index.json. */
data class PacoteMidia(val nome: String, val entrega: String, val rotulo: String, val tamanho: Long)

/** Estado de um pacote (AssetPackStatus / AssetPackErrorCode). */
data class EstadoPacote(val status: Int, val erro: Int = 0, val baixado: Long = 0, val total: Long = 0)

/**
 * Mídias de pacotes da Google Play (Play Asset Delivery), mesmo comportamento da ponte do
 * template WebView (android-template/.../PonteMidias.java): o gerador grava em
 * assets/midias-index.json os pacotes fast-follow/on-demand e o pacote de cada arquivo; os
 * pacotes baixados ficam no armazenamento interno, e o caminho só é conhecido depois do
 * download. Sem o índice, todas as mídias estão nos assets e nada aqui é usado.
 */
class MidiasOffline(private val activity: Activity) : AssetPackStateUpdateListener {

    val pacotes: List<PacoteMidia>
    private val arquivos: Map<String, String>   // caminho → nome do pacote
    val ativo: Boolean get() = pacotes.isNotEmpty()

    val estados = mutableStateMapOf<String, EstadoPacote>()
    /** Pacote da mídia que o usuário tentou abrir sem estar baixada (pedido de download). */
    val pedido = mutableStateOf<PacoteMidia?>(null)
    /** Mensagem curta para a interface (erros e downloads concluídos). */
    val aviso = mutableStateOf<String?>(null)

    private val gerente: AssetPackManager?
    private val esperando = mutableSetOf<String>()
    private var confirmacaoAberta = false

    init {
        val indice = runCatching {
            activity.assets.open(ARQUIVO_INDICE).bufferedReader().use { JSONObject(it.readText()) }
        }.getOrNull()
        val lista = indice?.optJSONArray("pacotes")
        pacotes = if (lista == null) emptyList() else (0 until lista.length()).map {
            val p = lista.getJSONObject(it)
            PacoteMidia(p.getString("nome"), p.optString("entrega"), p.optString("rotulo", p.getString("nome")), p.optLong("tamanho"))
        }
        val mapa = mutableMapOf<String, String>()
        indice?.optJSONObject("arquivos")?.let { o -> o.keys().forEach { k -> mapa[k] = o.getJSONArray(k).getString(0) } }
        arquivos = mapa
        gerente = if (pacotes.isEmpty()) null else AssetPackManagerFactory.getInstance(activity.applicationContext)
    }

    fun registrar() {
        gerente?.registerListener(this)
        atualizar()
    }

    fun desregistrar() {
        gerente?.unregisterListener(this)
    }

    fun atualizar() {
        val g = gerente ?: return
        g.getPackStates(pacotes.map { it.nome })
            .addOnSuccessListener { e -> e.packStates().values.forEach(::onStateUpdate) }
    }

    // ─── Endereço das mídias ───────────────────────────────────────────────────

    /**
     * URI tocável/legível de uma mídia: http(s) como está, arquivo de pacote baixado
     * (file://), ou asset:/// (módulo base e pacotes install-time). Null se a mídia é de um
     * pacote ainda não baixado — nesse caso abre o pedido de download.
     */
    fun uri(caminho: String, pedirSeFaltar: Boolean = true): Uri? {
        if (caminho.startsWith("http://") || caminho.startsWith("https://")) return Uri.parse(caminho)
        val nome = arquivos[caminho] ?: return Uri.parse("asset:///" + caminho.split('/').joinToString("/") { Uri.encode(it) })
        val pasta = gerente?.getPackLocation(nome)?.assetsPath()
        if (pasta != null) return Uri.fromFile(File(pasta, caminho))
        if (pedirSeFaltar) pedirDownload(nome)
        return null
    }

    private val existentes = HashMap<String, Boolean>()

    /**
     * Se a mídia existe no app: endereço remoto, arquivo de pacote (baixado ou não) ou asset.
     * Projetos podem citar arquivos que não foram incluídos; esses botões e imagens não aparecem.
     */
    fun existe(caminho: String): Boolean {
        if (caminho.isBlank()) return false
        if (caminho.startsWith("http://") || caminho.startsWith("https://") || caminho in arquivos) return true
        return synchronized(existentes) {
            existentes.getOrPut(caminho) { runCatching { activity.assets.open(caminho).close() }.isSuccess }
        }
    }

    fun pacoteDe(caminho: String): PacoteMidia? = arquivos[caminho]?.let { n -> pacotes.find { it.nome == n } }

    fun baixado(nome: String): Boolean = estados[nome]?.status == AssetPackStatus.COMPLETED

    fun emAndamento(nome: String): Boolean = estados[nome]?.status in EM_ANDAMENTO

    // ─── Downloads ─────────────────────────────────────────────────────────────

    private fun pedirDownload(nome: String) {
        val p = pacotes.find { it.nome == nome } ?: return
        if (emAndamento(nome)) {
            esperando.add(nome)
            aviso.value = "\"${p.rotulo}\" está sendo baixado. Tente de novo quando terminar."
            return
        }
        pedido.value = p
    }

    fun baixar(nomes: List<String>) {
        val g = gerente ?: return
        val faltam = nomes.filter { !baixado(it) && !emAndamento(it) }
        if (faltam.isEmpty()) return
        esperando.addAll(faltam)
        faltam.forEach { estados[it] = EstadoPacote(AssetPackStatus.PENDING) }
        val bytes = pacotes.filter { it.nome in faltam }.sumOf { it.tamanho }
        // Margem para a extração do pacote depois do download
        if (bytes * 2 > StatFs(activity.filesDir.absolutePath).availableBytes) {
            falhar(faltam, AssetPackErrorCode.INSUFFICIENT_STORAGE)
            return
        }
        g.fetch(faltam).addOnFailureListener { e -> falhar(faltam, codigo(e)) }
    }

    fun baixarTudo() = baixar(pacotes.map { it.nome })

    fun cancelar(nome: String) {
        gerente?.cancel(listOf(nome))?.packStates()?.values?.forEach(::onStateUpdate)
    }

    fun remover(nome: String) {
        gerente?.removePack(nome)?.addOnCompleteListener { atualizar() }
    }

    fun removerTudo() = pacotes.filter { baixado(it.nome) }.forEach { remover(it.nome) }

    private fun falhar(nomes: List<String>, codigo: Int) {
        activity.runOnUiThread {
            nomes.forEach { estados[it] = EstadoPacote(AssetPackStatus.FAILED, codigo) }
            esperando.removeAll(nomes.toSet())
            aviso.value = mensagemErro(codigo)
        }
    }

    private fun codigo(e: Exception): Int =
        if (e is AssetPackException) e.errorCode else AssetPackErrorCode.INTERNAL_ERROR

    override fun onStateUpdate(estado: AssetPackState) {
        val status = estado.status()
        if (status == AssetPackStatus.REQUIRES_USER_CONFIRMATION || status == AssetPackStatus.WAITING_FOR_WIFI) {
            pedirConfirmacao()
        }
        activity.runOnUiThread {
            val anterior = estados[estado.name()]?.status
            estados[estado.name()] = EstadoPacote(status, estado.errorCode(), estado.bytesDownloaded(), estado.totalBytesToDownload())
            val rotulo = pacotes.find { it.nome == estado.name() }?.rotulo ?: estado.name()
            if (status == AssetPackStatus.COMPLETED && esperando.remove(estado.name())) {
                aviso.value = "Mídias baixadas: $rotulo"
            }
            if (status == AssetPackStatus.FAILED && anterior != AssetPackStatus.FAILED) {
                esperando.remove(estado.name())
                aviso.value = mensagemErro(estado.errorCode())
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun pedirConfirmacao() {
        activity.runOnUiThread {
            if (confirmacaoAberta || activity.isFinishing) return@runOnUiThread
            confirmacaoAberta = true
            gerente?.showConfirmationDialog(activity)?.addOnCompleteListener { confirmacaoAberta = false }
        }
    }

    companion object {
        const val ARQUIVO_INDICE = "midias-index.json"

        private val EM_ANDAMENTO = setOf(
            AssetPackStatus.PENDING, AssetPackStatus.DOWNLOADING, AssetPackStatus.TRANSFERRING,
            AssetPackStatus.WAITING_FOR_WIFI, AssetPackStatus.REQUIRES_USER_CONFIRMATION,
        )

        fun mensagemErro(codigo: Int): String = when (codigo) {
            AssetPackErrorCode.APP_UNAVAILABLE -> "O app não foi encontrado na Google Play."
            AssetPackErrorCode.PACK_UNAVAILABLE -> "Este pacote não está disponível na Google Play."
            AssetPackErrorCode.API_NOT_AVAILABLE -> "A versão da Google Play deste aparelho não permite o download."
            AssetPackErrorCode.NETWORK_ERROR -> "Sem conexão com a internet."
            AssetPackErrorCode.ACCESS_DENIED -> "Download bloqueado. Abra o app e tente de novo."
            AssetPackErrorCode.INSUFFICIENT_STORAGE -> "Espaço insuficiente no aparelho."
            -11 /* Play Store ausente */ -> "A Google Play não está instalada neste aparelho."
            -12 /* rede sem Wi-Fi */ -> "Conecte-se a uma rede Wi-Fi ou autorize o uso de dados móveis."
            AssetPackErrorCode.APP_NOT_OWNED, AssetPackErrorCode.UNRECOGNIZED_INSTALLATION ->
                "Instale o app pela Google Play para baixar as mídias."
            else -> "Não foi possível baixar (código $codigo)."
        }

        fun formatarBytes(b: Long): String = when {
            b >= 1_000_000_000 -> "%.2f GB".format(b / 1e9).replace('.', ',')
            b >= 1_000_000 -> "%.1f MB".format(b / 1e6).replace('.', ',')
            b > 0 -> "${maxOf(1, b / 1000)} KB"
            else -> "0 MB"
        }
    }
}
