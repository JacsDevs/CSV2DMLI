package br.com.csv2dmli.nativo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.compose.runtime.mutableStateOf
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream

/**
 * Um único áudio por vez (pronúncias e exemplos). Tocar o mesmo áudio de novo para; tocar outro
 * troca. O vídeo usa um player próprio (TelaVideo) e pausa este ao abrir.
 */
class ReprodutorAudio(context: Context) {
    private val player = ExoPlayer.Builder(context).build()
    /** Caminho do áudio tocando agora, para o botão mostrar "parar". */
    val tocando = mutableStateOf<String?>(null)
    /** Chamado quando um áudio não pode ser reproduzido (para avisar o usuário). */
    var aoFalhar: (() -> Unit)? = null

    init {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(estado: Int) {
                if (estado == Player.STATE_ENDED) tocando.value = null
            }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                tocando.value = null
                aoFalhar?.invoke()
            }
        })
    }

    fun alternar(caminho: String, uri: Uri) {
        if (tocando.value == caminho && player.isPlaying) {
            parar()
            return
        }
        player.setMediaItem(MediaItem.fromUri(uri))
        player.prepare()
        player.play()
        tocando.value = caminho
    }

    fun parar() {
        player.stop()
        tocando.value = null
    }

    fun liberar() = player.release()
}

/** Imagens dos assets ou de pacotes baixados, reduzidas para a tela e guardadas em cache. */
object CarregadorImagens {
    private val cache = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 8).toInt()) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }

    suspend fun carregar(context: Context, uri: Uri, ladoMaximo: Int): Bitmap? = withContext(Dispatchers.IO) {
        val chave = "$uri@$ladoMaximo"
        cache.get(chave)?.let { return@withContext it }
        runCatching {
            val limites = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            abrir(context, uri)?.use { BitmapFactory.decodeStream(it, null, limites) }
            var amostra = 1
            while (maxOf(limites.outWidth, limites.outHeight) / (amostra * 2) >= ladoMaximo) amostra *= 2
            val opcoes = BitmapFactory.Options().apply { inSampleSize = amostra }
            abrir(context, uri)?.use { BitmapFactory.decodeStream(it, null, opcoes) }
        }.getOrNull()?.also { cache.put(chave, it) }
    }

    private fun abrir(context: Context, uri: Uri): InputStream? = when (uri.scheme) {
        "asset" -> context.assets.open(uri.path!!.removePrefix("/"))
        "file" -> File(uri.path!!).inputStream()
        else -> null   // imagens remotas não são carregadas (o app funciona offline)
    }
}
