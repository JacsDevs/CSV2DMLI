@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package br.com.csv2dmli.nativo

import android.app.Activity
import android.graphics.Bitmap
import android.widget.TextView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.text.HtmlCompat
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.google.android.play.core.assetpacks.model.AssetPackStatus

/** Telas do app; a pilha de navegação é uma lista (o botão voltar desempilha). */
sealed interface Tela {
    data object Lista : Tela
    data class Detalhe(val id: String) : Tela
    data class Video(val caminho: String) : Tela
    data class Foto(val caminho: String, val legenda: String) : Tela
    data object Info : Tela
    data object Ajustes : Tela
    data object Midias : Tela
}

/** Ações de mídia compartilhadas pelas telas. */
class AcoesMidia(
    val midias: MidiasOffline,
    val audio: ReprodutorAudio,
    private val navegar: (Tela) -> Unit,
) {
    fun tocarAudio(caminho: String) {
        val uri = midias.uri(caminho) ?: return
        audio.alternar(caminho, uri)
    }

    fun abrirVideo(caminho: String) {
        midias.uri(caminho) ?: return
        audio.parar()
        navegar(Tela.Video(caminho))
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
    var modoTema by remember { mutableStateOf(prefs.tema) }
    val configPadrao = remember { Config("", "", "", "", "", emptyList(), "", Cores(), Cores()) }

    TemaDicionario(dicionario?.getOrNull()?.config ?: configPadrao, modoTema) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val resultado = dicionario
            when {
                resultado == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                resultado.isFailure -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text("Não foi possível abrir os dados do dicionário.\n${resultado.exceptionOrNull()?.message ?: ""}")
                }
                else -> Navegacao(resultado.getOrThrow(), prefs, midias, audio, modoTema) { modoTema = it; prefs.tema = it }
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
    modoTema: ModoTema,
    mudarTema: (ModoTema) -> Unit,
) {
    val pilha = remember { mutableStateListOf<Tela>(Tela.Lista) }
    val navegar: (Tela) -> Unit = { pilha.add(it) }
    val voltar: () -> Unit = { if (pilha.size > 1) pilha.removeAt(pilha.lastIndex) }
    val acoes = remember { AcoesMidia(midias, audio, navegar) }
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
            is Tela.Video, is Tela.Foto -> false
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
    val porId = remember(dic) { dic.entradas.associateBy { it.id } }

    Box(Modifier.fillMaxSize()) {
        when (val tela = pilha.last()) {
            Tela.Lista -> TelaPrincipal(dic, estadoPrincipal, acoes, salvos, alternarSalvo, apagarSalvos, navegar)
            is Tela.Detalhe -> porId[tela.id]?.let { TelaDetalhe(it, acoes, it.id in salvos, { alternarSalvo(it.id) }, navegar, voltar) }
            is Tela.Video -> TelaVideo(tela.caminho, midias) { erro ->
                if (erro) midias.aviso.value = "Não foi possível reproduzir o vídeo."
                voltar()
            }
            is Tela.Foto -> TelaFoto(tela.caminho, tela.legenda, midias, voltar)
            Tela.Info -> TelaInfo(dic.config, voltar)
            Tela.Ajustes -> TelaAjustes(midias, modoTema, mudarTema, navegar, voltar)
            Tela.Midias -> TelaMidias(midias, voltar)
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).systemBarsPadding())
    }

    // Aviso de primeiro uso: uma vez, se há mídias para baixar
    var mostrarAviso by remember { mutableStateOf(midias.ativo && !prefs.avisoMidiasMostrado) }
    if (mostrarAviso) {
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

// ─── Entrada ───────────────────────────────────────────────────────────────────

@Composable
private fun TelaDetalhe(
    e: Entrada,
    acoes: AcoesMidia,
    salvo: Boolean,
    alternarSalvo: () -> Unit,
    navegar: (Tela) -> Unit,
    voltar: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(e.termo, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = voltar) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Voltar") } },
                actions = {
                    IconButton(onClick = alternarSalvo) {
                        Icon(if (salvo) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (salvo) "Remover dos salvos" else "Salvar")
                    }
                },
            )
        },
    ) { margem ->
        LazyColumn(contentPadding = margem, modifier = Modifier.fillMaxSize()) {
            item {
                Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(e.termo, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    val transcricoes = listOf(e.fonemica, e.fonetica).filter { it.isNotBlank() }.joinToString("  ")
                    if (transcricoes.isNotBlank()) Text(transcricoes, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val pronuncias = e.pronuncias.filter { acoes.midias.existe(it.arquivo) }
                    if (pronuncias.isNotEmpty()) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Numeração por tipo: "Pronúncia", "Vídeo" ou "Pronúncia 1", "Pronúncia 2"...
                            val totais = pronuncias.groupingBy { it.video }.eachCount()
                            val vistos = mutableMapOf<Boolean, Int>()
                            pronuncias.forEach { p ->
                                val n = vistos.merge(p.video, 1, Int::plus)!!
                                val rotulo = (if (p.video) "Vídeo" else "Pronúncia") + if ((totais[p.video] ?: 0) > 1) " $n" else ""
                                val tocando = acoes.audio.tocando.value == p.arquivo
                                FilledTonalButton(onClick = { if (p.video) acoes.abrirVideo(p.arquivo) else acoes.tocarAudio(p.arquivo) }) {
                                    Icon(if (tocando) Icons.Filled.Close else Icons.Filled.PlayArrow, null, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(rotulo)
                                }
                            }
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (e.classe.isNotBlank()) AssistChip(onClick = {}, label = { Text(e.classe) })
                        val cat = listOf(e.categoria, e.subcategoria).filter { it.isNotBlank() }.joinToString(" › ")
                        if (cat.isNotBlank()) AssistChip(onClick = {}, label = { Text(cat) })
                    }
                }
            }
            items(e.acepcoes) { a -> BlocoAcepcao(a, acoes, navegar) }
            if (e.relacionados.isNotBlank()) {
                item {
                    Column(Modifier.padding(20.dp)) {
                        Text("Itens relacionados", style = MaterialTheme.typography.titleSmall)
                        Text(e.relacionados)
                    }
                }
            }
            item { Spacer(Modifier.height(32.dp)) }
        }
    }
}

@Composable
private fun BlocoAcepcao(a: Acepcao, acoes: AcoesMidia, navegar: (Tela) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        HorizontalDivider()
        val titulo = listOf(a.numero.takeIf { it.isNotBlank() }?.let { "$it." }, a.traducao).filterNotNull().filter { it.isNotBlank() }.joinToString(" ")
        if (titulo.isNotBlank()) Text(titulo, style = MaterialTheme.typography.titleLarge)
        if (a.descricao.isNotBlank()) Text(a.descricao)
        val imagens = a.imagens.filter { acoes.midias.existe(it.arquivo) }
        val videos = a.videos.filter { acoes.midias.existe(it) }
        if (imagens.isNotEmpty()) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(imagens) { img ->
                    Column(Modifier.width(140.dp).clickable { navegar(Tela.Foto(img.arquivo, img.legenda)) }) {
                        Miniatura(img.arquivo, acoes.midias, 140.dp)
                        if (img.legenda.isNotBlank()) Text(img.legenda, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                    }
                }
            }
        }
        if (videos.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                videos.forEachIndexed { i, v ->
                    OutlinedButton(onClick = { acoes.abrirVideo(v) }) {
                        Icon(Icons.Filled.PlayArrow, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(if (videos.size > 1) "Vídeo ${i + 1}" else "Vídeo")
                    }
                }
            }
        }
        a.exemplos.forEach { ex ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    if (ex.texto.isNotBlank()) Text(ex.texto, fontStyle = FontStyle.Italic)
                    if (ex.traducao.isNotBlank()) Text(ex.traducao, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (acoes.midias.existe(ex.audio)) {
                    val tocando = acoes.audio.tocando.value == ex.audio
                    IconButton(onClick = { acoes.tocarAudio(ex.audio) }) {
                        Icon(if (tocando) Icons.Filled.Close else Icons.Filled.PlayArrow, if (tocando) "Parar exemplo" else "Ouvir exemplo")
                    }
                }
            }
        }
        a.extras.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        a.textos.forEach { t ->
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (t.titulo.isNotBlank()) Text(t.titulo, style = MaterialTheme.typography.titleSmall)
                    t.frases.forEach { f ->
                        if (f.original.isNotBlank()) Text(f.original, fontStyle = FontStyle.Italic)
                        if (f.traducao.isNotBlank()) Text(f.traducao, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (t.naoLiteral.isNotBlank()) Text(t.naoLiteral, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// ─── Mídias ────────────────────────────────────────────────────────────────────

@Composable
fun Miniatura(caminho: String, midias: MidiasOffline, tamanho: Dp) {
    val context = LocalContext.current
    val px = with(LocalDensity.current) { tamanho.roundToPx() }
    val bitmap by produceState<Bitmap?>(null, caminho) {
        value = midias.uri(caminho, pedirSeFaltar = false)?.let { CarregadorImagens.carregar(context, it, px) }
    }
    Box(
        Modifier.size(tamanho).clip(RoundedCornerShape(10.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        bitmap?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
    }
}

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

@Composable
private fun TelaVideo(caminho: String, midias: MidiasOffline, fechar: (erro: Boolean) -> Unit) {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            midias.uri(caminho, pedirSeFaltar = false)?.let { setMediaItem(MediaItem.fromUri(it)) }
            prepare()
            playWhenReady = true
        }
    }
    DisposableEffect(Unit) {
        val ouvinte = object : androidx.media3.common.Player.Listener {
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) = fechar(true)
        }
        player.addListener(ouvinte)
        onDispose { player.removeListener(ouvinte); player.release() }
    }
    val voltar = { fechar(false) }
    Box(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()) {
        AndroidView(
            factory = { PlayerView(it).apply { this.player = player; setShowNextButton(false); setShowPreviousButton(false) } },
            modifier = Modifier.fillMaxSize(),
        )
        IconButton(onClick = voltar, Modifier.align(Alignment.TopStart)) { Icon(Icons.Filled.Close, "Fechar vídeo", tint = Color.White) }
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
private fun TelaInfo(c: Config, voltar: () -> Unit) {
    TelaComVoltar("Informações", voltar) { margem ->
        Column(Modifier.padding(margem).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(c.nome, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (c.autor.isNotBlank()) Text("Autoria e colaboração: ${c.autor}")
            val versao = listOf(c.versaoApp.takeIf { it.isNotBlank() }?.let { "Versão $it" }, c.ano.takeIf { it.isNotBlank() }).filterNotNull().joinToString(" · ")
            if (versao.isNotBlank()) Text(versao, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (c.introducao.isNotBlank()) TextoHtml(c.introducao)
            if (c.citacao.isNotBlank()) {
                Text("Como citar", style = MaterialTheme.typography.titleMedium)
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                    Text(c.citacao, Modifier.padding(12.dp))
                }
            }
            if (c.referencias.isNotEmpty()) {
                Text("Referências", style = MaterialTheme.typography.titleMedium)
                c.referencias.forEach { Text("• $it") }
            }
        }
    }
}

/** HTML simples da introdução (negrito, itálico, parágrafos, listas, links). */
@Composable
private fun TextoHtml(html: String) {
    val cor = MaterialTheme.colorScheme.onSurface.toArgb()
    val link = MaterialTheme.colorScheme.primary.toArgb()
    AndroidView(
        factory = { TextView(it).apply { textSize = 16f; setLineSpacing(0f, 1.3f) } },
        update = {
            it.setTextColor(cor)
            it.setLinkTextColor(link)
            it.text = HtmlCompat.fromHtml(html, HtmlCompat.FROM_HTML_MODE_COMPACT).trimEnd()
        },
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun TelaAjustes(midias: MidiasOffline, modo: ModoTema, mudarTema: (ModoTema) -> Unit, navegar: (Tela) -> Unit, voltar: () -> Unit) {
    TelaComVoltar("Ajustes", voltar) { margem ->
        Column(Modifier.padding(margem).verticalScroll(rememberScrollState())) {
            Text("Tema", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 20.dp, top = 16.dp))
            listOf(ModoTema.SISTEMA to "Igual ao sistema", ModoTema.CLARO to "Claro", ModoTema.ESCURO to "Escuro").forEach { (m, rotulo) ->
                ListItem(
                    modifier = Modifier.clickable { mudarTema(m) },
                    headlineContent = { Text(rotulo) },
                    leadingContent = { RadioButton(selected = modo == m, onClick = { mudarTema(m) }) },
                )
            }
            if (midias.ativo) {
                HorizontalDivider()
                val prontos = midias.pacotes.count { midias.baixado(it.nome) }
                ListItem(
                    modifier = Modifier.clickable { navegar(Tela.Midias) },
                    headlineContent = { Text("Mídias offline") },
                    supportingContent = { Text("$prontos de ${midias.pacotes.size} pacotes baixados") },
                )
            }
            HorizontalDivider()
            ListItem(
                modifier = Modifier.clickable { navegar(Tela.Info) },
                headlineContent = { Text("Informações e como citar") },
            )
        }
    }
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
