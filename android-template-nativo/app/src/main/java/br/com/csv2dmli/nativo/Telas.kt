@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package br.com.csv2dmli.nativo

import android.app.Activity
import android.graphics.Bitmap
import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.luminance
import androidx.core.view.WindowCompat
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.text.HtmlCompat
import com.google.android.play.core.assetpacks.model.AssetPackStatus

/** Telas do app; a pilha de navegação é uma lista (o botão voltar desempilha). */
sealed interface Tela {
    data object Lista : Tela
    data class Detalhe(val id: String) : Tela
    data class Foto(val caminho: String, val legenda: String) : Tela
    data class Info(val secao: SecaoInfo) : Tela
    data object Midias : Tela
}

/** Janelas de "Sobre" do HTML: modal-info, modal-citar e modal-referencias. */
enum class SecaoInfo(val titulo: String) { INTRODUCAO("Informações e introdução"), CITAR("Como citar"), REFERENCIAS("Referências") }

/** Ações de mídia compartilhadas pelas telas: um áudio ou um vídeo por vez. */
class AcoesMidia(
    val midias: MidiasOffline,
    val audio: ReprodutorAudio,
) {
    /** Vídeo no player flutuante (PlayerFlutuante.kt) e a posição do botão que o abriu. */
    val video = mutableStateOf<VideoAberto?>(null)
    val ancora = mutableStateOf<Rect?>(null)
    /** Última posição de cada botão de vídeo na tela (Modifier.donoDoVideo). */
    val posicoes = HashMap<Any, Rect>()

    fun tocarAudio(caminho: String) {
        val uri = midias.uri(caminho) ?: return
        fecharVideo()
        audio.alternar(caminho, uri)
    }

    /** Abre o vídeo junto ao botão [dono]; tocar no mesmo botão de novo fecha. */
    fun alternarVideo(caminho: String, dono: Any) {
        if (video.value?.dono === dono) {
            fecharVideo()
            return
        }
        val uri = midias.uri(caminho) ?: return
        audio.parar()
        ancora.value = posicoes[dono]
        video.value = VideoAberto(caminho, uri, dono)
    }

    fun fecharVideo() {
        video.value = null
        ancora.value = null
    }
}

@Composable
fun App(prefs: Preferencias, midias: MidiasOffline, audio: ReprodutorAudio) {
    val context = LocalContext.current
    val dicionario by produceState<Result<Dicionario>?>(null) {
        value = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            runCatching { LeitorDados.carregar(context) }
        }
    }
    val a11y = remember { Acessibilidade(prefs) }
    val configPadrao = remember { Config("", "", "", "", "", emptyList(), "", Cores(), Cores()) }

    TemaDicionario(dicionario?.getOrNull()?.config ?: configPadrao, a11y) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val resultado = dicionario
            when {
                resultado == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                resultado.isFailure -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text("Não foi possível abrir os dados do dicionário.\n${resultado.exceptionOrNull()?.message ?: ""}")
                }
                else -> Navegacao(resultado.getOrThrow(), prefs, midias, audio, a11y)
            }
        }
    }
}

@Composable
private fun Navegacao(
    dic: Dicionario,
    prefs: Preferencias,
    midias: MidiasOffline,
    audio: ReprodutorAudio,
    a11y: Acessibilidade,
) {
    // Ao abrir, a janela de informações e introdução, como no HTML (abrirModalGlobal('modal-info'))
    val pilha = remember { mutableStateListOf(Tela.Lista, Tela.Info(SecaoInfo.INTRODUCAO)) }
    val navegar: (Tela) -> Unit = { pilha.add(it) }
    val voltar: () -> Unit = { if (pilha.size > 1) pilha.removeAt(pilha.lastIndex) }
    val acoes = remember { AcoesMidia(midias, audio) }
    val salvos = remember { mutableStateListOf<String>().apply { addAll(prefs.salvos) } }
    val alternarSalvo: (String) -> Unit = { id ->
        if (id in salvos) salvos.remove(id) else salvos.add(id)
        prefs.salvos = salvos.toSet()
    }
    val apagarSalvos: () -> Unit = {
        salvos.clear()
        prefs.salvos = emptySet()
    }
    val estadoPrincipal = remember { EstadoPrincipal(prefs) }

    // Ícones da barra de status: sobre o topo na cor primária (tela principal), sobre preto
    // (vídeo e imagem) ou sobre a superfície (demais telas)
    val paleta = LocalPaleta.current
    val view = LocalView.current
    val telaAtual = pilha.last()
    SideEffect {
        val janela = (view.context as? Activity)?.window ?: return@SideEffect
        val claros = when (telaAtual) {
            Tela.Lista -> paleta.primaria.luminance() > 0.5f
            is Tela.Foto -> false
            else -> !paleta.escuro
        }
        WindowCompat.getInsetsController(janela, view).apply {
            isAppearanceLightStatusBars = claros
            isAppearanceLightNavigationBars = !paleta.escuro
        }
    }
    val snackbar = remember { SnackbarHostState() }
    val aviso by midias.aviso
    LaunchedEffect(aviso) {
        aviso?.let { snackbar.showSnackbar(it); midias.aviso.value = null }
    }

    BackHandler(enabled = pilha.size > 1) { voltar() }
    // Registrado depois: o voltar fecha primeiro o player de vídeo
    BackHandler(enabled = acoes.video.value != null) { acoes.fecharVideo() }
    val porId = remember(dic) { dic.entradas.associateBy { it.id } }

    Box(Modifier.fillMaxSize()) {
        when (val tela = pilha.last()) {
            Tela.Lista -> TelaPrincipal(dic, estadoPrincipal, acoes, salvos, alternarSalvo, apagarSalvos, navegar, a11y)
            is Tela.Detalhe -> {
                // Anterior/próxima percorrem a lista como está na tela (filtros, busca, ordem)
                val sequencia = estadoPrincipal.sequencia
                val e = sequencia.firstOrNull { it.id == tela.id } ?: porId[tela.id]
                if (e != null) {
                    TelaEntrada(
                        e, sequencia, estadoPrincipal.detalhes, e.id in salvos, { alternarSalvo(e.id) }, acoes, navegar,
                        trocar = { id -> pilha[pilha.lastIndex] = Tela.Detalhe(id) }, fechar = voltar,
                    )
                }
            }
            is Tela.Foto -> TelaFoto(tela.caminho, tela.legenda, midias, voltar)
            is Tela.Info -> TelaInfo(dic.config, tela.secao, voltar)
            Tela.Midias -> TelaMidias(midias, voltar)
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).systemBarsPadding())
    }

    // Aviso de primeiro uso: uma vez, se há mídias para baixar, depois de fechar a janela de
    // informações iniciais (avisarPrimeiroUso do HTML)
    var mostrarAviso by remember { mutableStateOf(midias.ativo && !prefs.avisoMidiasMostrado) }
    if (mostrarAviso && pilha.last() !is Tela.Info) {
        LaunchedEffect(Unit) { prefs.avisoMidiasMostrado = true }
        val total = midias.pacotes.sumOf { it.tamanho }
        AlertDialog(
            onDismissRequest = { mostrarAviso = false },
            title = { Text("Mídias offline") },
            text = {
                Text("Este dicionário tem ${MidiasOffline.formatarBytes(total)} de mídias que não vêm com a instalação. " +
                    "Baixe agora para usar sem internet, ou depois, em Ajustes › Mídias offline.")
            },
            confirmButton = { Button(onClick = { mostrarAviso = false; midias.baixarTudo(); navegar(Tela.Midias) }) { Text("Baixar tudo") } },
            dismissButton = { TextButton(onClick = { mostrarAviso = false }) { Text("Depois") } },
        )
    }

    // Pedido de download ao abrir uma mídia de pacote ainda não baixado
    midias.pedido.value?.let { p ->
        val faltam = midias.pacotes.filter { !midias.baixado(it.nome) }
        AlertDialog(
            onDismissRequest = { midias.pedido.value = null },
            title = { Text("Mídia não baixada") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Esta mídia faz parte do pacote \"${p.rotulo}\" (${MidiasOffline.formatarBytes(p.tamanho)}), que ainda não foi baixado. Baixar agora?")
                    if (faltam.size > 1) {
                        FilledTonalButton(onClick = { midias.pedido.value = null; midias.baixarTudo() }, Modifier.fillMaxWidth()) {
                            Text("Baixar todas as mídias (${MidiasOffline.formatarBytes(faltam.sumOf { it.tamanho })})")
                        }
                    }
                }
            },
            confirmButton = { Button(onClick = { midias.pedido.value = null; midias.baixar(listOf(p.nome)) }) { Text("Baixar") } },
            dismissButton = { TextButton(onClick = { midias.pedido.value = null }) { Text("Agora não") } },
        )
    }
}

// ─── Mídias ────────────────────────────────────────────────────────────────────

@Composable
private fun TelaFoto(caminho: String, legenda: String, midias: MidiasOffline, voltar: () -> Unit) {
    val context = LocalContext.current
    val bitmap by produceState<Bitmap?>(null, caminho) {
        value = midias.uri(caminho, pedirSeFaltar = false)?.let { CarregadorImagens.carregar(context, it, 2048) }
    }
    Box(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()) {
        bitmap?.let {
            Image(it.asImageBitmap(), legenda.ifBlank { null }, Modifier.fillMaxSize().semantics { contentDescription = legenda }, contentScale = ContentScale.Fit)
        }
        IconButton(onClick = voltar, Modifier.align(Alignment.TopStart)) { Icon(Icons.Filled.Close, "Fechar imagem", tint = Color.White) }
        if (legenda.isNotBlank()) {
            Text(legenda, color = Color.White, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
        }
    }
}

// ─── Informações, ajustes e mídias offline ─────────────────────────────────────

@Composable
private fun TelaComVoltar(titulo: String, voltar: () -> Unit, conteudo: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(titulo) },
                navigationIcon = { IconButton(onClick = voltar) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Voltar") } },
            )
        },
        content = conteudo,
    )
}

@Composable
private fun TelaInfo(c: Config, secao: SecaoInfo, fechar: () -> Unit) {
    val p = LocalPaleta.current
    Column(Modifier.fillMaxSize().background(p.fundo)) {
        CabecalhoJanela(fechar) {
            Text(secao.titulo, color = p.texto, fontSize = 18.4.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp)
        }
        Column(
            Modifier.weight(1f).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (secao) {
                SecaoInfo.INTRODUCAO -> {
                    Text(c.nome, color = p.texto, fontSize = 16.3.sp, fontWeight = FontWeight.Bold)
                    Text(buildAnnotatedString {
                        if (c.autor.isNotBlank()) {
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Autoria e colaboração: ") }
                            append(c.autor + "\n")
                        }
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Versão: ") }
                        append(c.versaoApp + " • ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("Ano: ") }
                        append(c.ano)
                    }, color = p.texto, fontSize = 16.3.sp, lineHeight = 27.sp)
                    if (c.introducao.isNotBlank()) TextoHtml(c.introducao)
                }
                SecaoInfo.CITAR -> {
                    Text("Para referenciar este dicionário em trabalhos acadêmicos, utilize o seguinte formato:", color = p.texto, fontSize = 16.3.sp, lineHeight = 27.sp)
                    Text(
                        c.citacao, color = p.texto, fontSize = 14.7.sp, fontFamily = FontFamily.Monospace,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(Raios.pequeno)).background(p.superficie2)
                            .border(1.dp, p.borda, RoundedCornerShape(Raios.pequeno)).padding(16.dp),
                    )
                }
                SecaoInfo.REFERENCIAS -> {
                    if (c.referencias.isEmpty()) Text("Nenhuma referência informada.", color = p.textoSecundario, fontSize = 16.3.sp)
                    c.referencias.forEach { Text(it, color = p.texto, fontSize = 16.3.sp, lineHeight = 27.sp) }
                }
            }
        }
    }
}

/** HTML simples da introdução (negrito, itálico, parágrafos, listas, links). */
@Composable
private fun TextoHtml(html: String) {
    val cor = LocalPaleta.current.texto.toArgb()
    val link = LocalPaleta.current.primaria.toArgb()
    // TextView fora do Compose: tamanho e espaçamento seguem o painel de acessibilidade
    val tamanho = with(LocalDensity.current) { 16.sp.toPx() }
    val espacamento = LocalEspacamento.current
    AndroidView(
        factory = { TextView(it) },
        update = {
            it.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, tamanho)
            it.setLineSpacing(0f, if (espacamento) 1.85f else 1.3f)
            it.letterSpacing = if (espacamento) 0.03f else 0f
            it.setTextColor(cor)
            it.setLinkTextColor(link)
            it.text = HtmlCompat.fromHtml(html, HtmlCompat.FROM_HTML_MODE_COMPACT).trimEnd()
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun TelaMidias(midias: MidiasOffline, voltar: () -> Unit) {
    LaunchedEffect(Unit) { midias.atualizar() }
    var confirmarRemocao by remember { mutableStateOf(false) }
    TelaComVoltar("Mídias offline", voltar) { margem ->
        val prontos = midias.pacotes.filter { midias.baixado(it.nome) }
        val faltam = midias.pacotes.filter { !midias.baixado(it.nome) && !midias.emAndamento(it.nome) }
        LazyColumn(contentPadding = margem, modifier = Modifier.fillMaxSize()) {
            item {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "${MidiasOffline.formatarBytes(prontos.sumOf { it.tamanho })} de ${MidiasOffline.formatarBytes(midias.pacotes.sumOf { it.tamanho })} " +
                            "baixados (${prontos.size} de ${midias.pacotes.size} pacotes).",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { confirmarRemocao = true }, enabled = prontos.isNotEmpty(), modifier = Modifier.weight(1f)) { Text("Remover tudo") }
                        Button(onClick = { midias.baixarTudo() }, enabled = faltam.isNotEmpty(), modifier = Modifier.weight(1f)) {
                            Text(if (faltam.isEmpty()) "Baixar tudo" else "Baixar tudo (${MidiasOffline.formatarBytes(faltam.sumOf { it.tamanho })})")
                        }
                    }
                }
            }
            items(midias.pacotes, key = { it.nome }) { p -> LinhaPacote(p, midias) }
        }
    }
    if (confirmarRemocao) {
        AlertDialog(
            onDismissRequest = { confirmarRemocao = false },
            title = { Text("Remover mídias baixadas?") },
            text = { Text("As mídias poderão ser baixadas de novo depois.") },
            confirmButton = { Button(onClick = { confirmarRemocao = false; midias.removerTudo() }) { Text("Remover") } },
            dismissButton = { TextButton(onClick = { confirmarRemocao = false }) { Text("Cancelar") } },
        )
    }
}

@Composable
private fun LinhaPacote(p: PacoteMidia, midias: MidiasOffline) {
    val e = midias.estados[p.nome]
    val pct = if (e != null && e.total > 0) (e.baixado * 100 / e.total).toInt() else 0
    val (estado, erro) = when (e?.status) {
        null -> "Verificando…" to false
        AssetPackStatus.COMPLETED -> "Baixado" to false
        AssetPackStatus.PENDING -> "Na fila…" to false
        AssetPackStatus.DOWNLOADING -> "Baixando… $pct% de ${MidiasOffline.formatarBytes(if (e.total > 0) e.total else p.tamanho)}" to false
        AssetPackStatus.TRANSFERRING -> "Instalando…" to false
        AssetPackStatus.WAITING_FOR_WIFI -> "Aguardando Wi-Fi" to false
        AssetPackStatus.REQUIRES_USER_CONFIRMATION -> "Aguardando sua confirmação" to false
        AssetPackStatus.FAILED -> MidiasOffline.mensagemErro(e.erro) to true
        AssetPackStatus.CANCELED -> "Cancelado" to false
        else -> "Não baixado" to false
    }
    ListItem(
        headlineContent = { Text("${p.rotulo} · ${MidiasOffline.formatarBytes(p.tamanho)}") },
        supportingContent = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(estado, color = if (erro) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                if (midias.emAndamento(p.nome)) {
                    LinearProgressIndicator(
                        progress = { if (e?.status == AssetPackStatus.TRANSFERRING) 1f else pct / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        trailingContent = {
            when {
                midias.baixado(p.nome) -> OutlinedButton(onClick = { midias.remover(p.nome) }) { Text("Remover") }
                midias.emAndamento(p.nome) -> OutlinedButton(onClick = { midias.cancelar(p.nome) }) { Text("Cancelar") }
                else -> FilledTonalButton(onClick = { midias.baixar(listOf(p.nome)) }) { Text("Baixar") }
            }
        },
    )
}
