package br.com.csv2dmli.nativo

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlin.math.roundToInt

// Player de vídeo pequeno e não bloqueante, preso ao botão que o abriu, como
// abrirModalVideoEntrada() do template HTML: aparece logo abaixo do botão (ou acima, se não
// couber), acompanha a rolagem, fecha ao terminar o vídeo e não toca junto com o áudio.

/** Vídeo aberto e o botão (dono) a que o player está preso. */
class VideoAberto(val caminho: String, val uri: Uri, val dono: Any)

/**
 * Registra o elemento como possível dono do player: guarda a posição dele (para abrir o player
 * junto) e fecha o player se o elemento sair da tela de vez.
 */
@Composable
fun Modifier.donoDoVideo(acoes: AcoesMidia, dono: Any): Modifier {
    DisposableEffect(dono) {
        onDispose {
            acoes.posicoes.remove(dono)
            if (acoes.video.value?.dono === dono) acoes.fecharVideo()
        }
    }
    return onGloballyPositioned {
        val limites = it.boundsInWindow()
        acoes.posicoes[dono] = limites
        if (acoes.video.value?.dono === dono) acoes.ancora.value = limites
    }
}

/**
 * Camada do player sobre a área rolável (use com Modifier.matchParentSize()); o player fica
 * dentro dos limites dela, como o .video-overlay.dentro-modal do HTML.
 */
@Composable
fun PlayerFlutuante(acoes: AcoesMidia, modifier: Modifier = Modifier) {
    var area by remember { mutableStateOf<Rect?>(null) }
    Box(modifier.onGloballyPositioned { area = it.boundsInWindow() }) {
        val aberto = acoes.video.value
        val ancora = acoes.ancora.value
        val limites = area
        if (aberto != null && ancora != null && limites != null) {
            key(aberto) { Janela(aberto, ancora, limites, acoes) }
        }
    }
}

@Composable
private fun Janela(aberto: VideoAberto, ancora: Rect, area: Rect, acoes: AcoesMidia) {
    val p = LocalPaleta.current
    val context = LocalContext.current
    val densidade = LocalDensity.current
    val player = remember(aberto) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(aberto.uri))
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(player) {
        val ouvinte = object : Player.Listener {
            override fun onPlaybackStateChanged(estado: Int) {
                if (estado == Player.STATE_ENDED) acoes.fecharVideo()
            }
            override fun onPlayerError(error: PlaybackException) {
                acoes.midias.aviso.value = "Não foi possível reproduzir o vídeo."
                acoes.fecharVideo()
            }
        }
        player.addListener(ouvinte)
        onDispose { player.removeListener(ouvinte); player.release() }
    }
    // App em segundo plano: pausa o vídeo
    val ciclo = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(ciclo, player) {
        val observador = LifecycleEventObserver { _, evento -> if (evento == Lifecycle.Event.ON_PAUSE) player.pause() }
        ciclo.addObserver(observador)
        onDispose { ciclo.removeObserver(observador) }
    }

    // Tamanho: min(320px, largura - 24px) com vídeo 16:9 de até 220px, como .video-overlay
    val margem = with(densidade) { 8.dp.toPx() }
    val largura = minOf(with(densidade) { 320.dp.toPx() }, area.width - with(densidade) { 24.dp.toPx() })
    val respiro = with(densidade) { 10.dp.toPx() }
    val alturaVideo = minOf((largura - 2 * respiro) * 9f / 16f, with(densidade) { 220.dp.toPx() })
    val altura = alturaVideo + 2 * respiro
    var esquerda = ancora.left
    if (esquerda + largura > area.right - margem) esquerda = area.right - largura - margem
    if (esquerda < area.left + margem) esquerda = area.left + margem
    var topo = ancora.bottom + margem
    if (topo + altura > area.bottom - margem) {
        // Sem espaço abaixo do botão: posiciona acima dele
        val acima = ancora.top - altura - margem
        if (acima >= area.top + margem) topo = acima
    }
    val x = (esquerda - area.left).roundToInt()
    val y = (topo - area.top).roundToInt()

    Box(
        Modifier.offset { IntOffset(x, y) }
            .width(with(densidade) { largura.toDp() })
            .shadow(16.dp, RectangleShape)
            .background(p.superficie)
            .border(1.dp, p.borda)
            .padding(10.dp)
            .semantics { contentDescription = "Vídeo de pronúncia" },
    ) {
        AndroidView(
            factory = {
                PlayerView(it).apply {
                    this.player = player
                    setShowNextButton(false)
                    setShowPreviousButton(false)
                    setBackgroundColor(android.graphics.Color.BLACK)
                }
            },
            modifier = Modifier.fillMaxWidth().height(with(densidade) { alturaVideo.toDp() }),
        )
    }
}
