@file:OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)

package br.com.csv2dmli.nativo

import android.graphics.BitmapFactory
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

// Tela principal com a mesma estrutura do app HTML no celular (template.html, ≤ 768 px):
// topo na cor primária (marca, busca, colunas/Detalhes/acessibilidade/informações) que some ao
// rolar, conteúdo agrupado por campo semântico (Grupos.kt) em cards ou verbetes por extenso, e
// a barra de abas Cards · Lista · Salvos · Categorias · Ajustes.

enum class Aba { CARDS, LISTA, SALVOS, CATEGORIAS }

/** Estado da tela principal; fica fora dela para sobreviver à ida a uma entrada e à volta. */
class EstadoPrincipal(private val prefs: Preferencias) {
    var aba by mutableStateOf(Aba.CARDS)
    var busca by mutableStateOf("")
    var colunas by mutableIntStateOf(prefs.colunas)
        private set
    var detalhes by mutableStateOf(prefs.detalhes)
        private set
    var colapsados by mutableStateOf(emptySet<String>())
    val lista = LazyListState()
    /** Campo/subcampo a mostrar depois de trocar de aba (atalhos de Categorias). */
    var irPara by mutableStateOf<String?>(null)
    // Topo: oculto (rolando para baixo) e compacto (sem a linha da marca, longe do início)
    var oculto by mutableStateOf(false)
    var compacto by mutableStateOf(false)
    var buscaFocada by mutableStateOf(false)

    fun mudarColunas(n: Int) { colunas = n; prefs.colunas = n }
    fun alternarDetalhes() { detalhes = !detalhes; prefs.detalhes = detalhes }
    fun alternarColapso(caminho: String) {
        colapsados = if (caminho in colapsados) colapsados - caminho else colapsados + caminho
    }
}

@Composable
fun TelaPrincipal(
    dic: Dicionario,
    estado: EstadoPrincipal,
    acoes: AcoesMidia,
    salvos: List<String>,
    alternarSalvo: (String) -> Unit,
    apagarSalvos: () -> Unit,
    navegar: (Tela) -> Unit,
) {
    val p = LocalPaleta.current
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val logo = remember {
        runCatching { context.assets.open("icone.png").use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()
    }

    val ordenadas = remember(dic) { ordenarPorCategoria(dic.entradas) }
    val totaisCampos = remember(ordenadas) { montarGrupos(ordenadas, 1, emptySet()).totalCampos }
    val filtradas = remember(ordenadas, estado.aba, estado.busca, salvos.toList()) {
        var base = if (estado.aba == Aba.SALVOS) ordenadas.filter { it.id in salvos } else ordenadas
        val chave = normalizar(estado.busca.trim())
        if (chave.isNotEmpty()) base = base.filter { it.chaveTermo.contains(chave) || it.chaveTraducao.contains(chave) }
        base
    }
    val colunas = if (estado.aba == Aba.LISTA) 1 else estado.colunas
    val grupos = remember(filtradas, colunas, estado.colapsados) { montarGrupos(filtradas, colunas, estado.colapsados) }

    // Topo que some ao rolar, como configurarTopoAutoOcultavel() do HTML
    val limiar = with(LocalDensity.current) { 8.dp.toPx() }
    val alturaTopo = with(LocalDensity.current) { 180.dp.toPx() }
    val conexao = remember(estado) {
        object : NestedScrollConnection {
            var acumulado = 0f
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val delta = -available.y
                if ((acumulado > 0 && delta < 0) || (acumulado < 0 && delta > 0)) acumulado = 0f
                acumulado += delta
                val longeDoTopo = estado.lista.firstVisibleItemIndex > 0 || estado.lista.firstVisibleItemScrollOffset > alturaTopo
                if (estado.buscaFocada) {
                    estado.oculto = false
                } else if (acumulado > limiar && longeDoTopo) {
                    estado.oculto = true; estado.compacto = true; acumulado = 0f
                } else if (acumulado < -limiar) {
                    estado.oculto = false; estado.compacto = longeDoTopo; acumulado = 0f
                }
                return Offset.Zero
            }
        }
    }
    LaunchedEffect(estado) {
        snapshotFlow { estado.lista.firstVisibleItemIndex == 0 && estado.lista.firstVisibleItemScrollOffset <= 4 }
            .collect { noTopo -> if (noTopo) { estado.oculto = false; estado.compacto = false } }
    }
    // Nova busca: volta ao início (a primeira emissão é só o valor atual, ao voltar de outra tela)
    LaunchedEffect(estado) {
        snapshotFlow { estado.busca }.drop(1).collect { estado.lista.scrollToItem(0) }
    }

    fun irParaAba(aba: Aba) {
        estado.aba = aba
        estado.oculto = false
        escopo.launch { estado.lista.scrollToItem(0) }
    }

    Column(Modifier.fillMaxSize().background(p.fundo)) {
        Cabecalho(dic.config, logo, estado, abrirAcessibilidade = { navegar(Tela.Ajustes) }, abrirInfo = { navegar(Tela.Info) })
        Box(Modifier.weight(1f).nestedScroll(conexao)) {
            if (estado.aba == Aba.CATEGORIAS) {
                ListaCategorias(totaisCampos, estado.lista) { nome ->
                    if (nome == null) {
                        irParaAba(Aba.CARDS)
                    } else {
                        estado.colapsados = estado.colapsados - nome
                        estado.aba = Aba.CARDS
                        estado.irPara = nome
                    }
                }
            } else {
                Conteudo(grupos, estado, acoes, salvos, alternarSalvo, apagarSalvos, navegar)
            }
        }
        BarraAbas(estado.aba, salvos.size, ::irParaAba) { navegar(Tela.Ajustes) }
    }
}

// ─── Topo ──────────────────────────────────────────────────────────────────────

@Composable
private fun Cabecalho(config: Config, logo: ImageBitmap?, estado: EstadoPrincipal, abrirAcessibilidade: () -> Unit, abrirInfo: () -> Unit) {
    val p = LocalPaleta.current
    Column(Modifier.fillMaxWidth().background(p.primaria).statusBarsPadding()) {
        AnimatedVisibility(
            visible = !estado.oculto,
            enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
            exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
        ) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp)) {
                AnimatedVisibility(
                    visible = !estado.compacto,
                    enter = expandVertically(expandFrom = Alignment.Top) + fadeIn(),
                    exit = shrinkVertically(shrinkTowards = Alignment.Top) + fadeOut(),
                ) {
                    LinhaMarca(config, logo, Modifier.padding(bottom = 12.dp))
                }
                CampoBusca(estado)
                Spacer(Modifier.height(12.dp))
                Ferramentas(estado, abrirAcessibilidade, abrirInfo)
            }
        }
    }
}

@Composable
private fun LinhaMarca(config: Config, logo: ImageBitmap?, modifier: Modifier) {
    val p = LocalPaleta.current
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        if (logo != null) {
            Image(logo, null, Modifier.size(40.dp).clip(RoundedCornerShape(22)), contentScale = ContentScale.Crop)
        }
        Column(Modifier.weight(1f)) {
            Text(
                config.nome, color = p.contraste, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                letterSpacing = (-0.2).sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.semantics { heading() },
            )
            val subtitulo = when {
                config.versaoApp.isNotBlank() && config.ano.isNotBlank() -> "Versão ${config.versaoApp} (${config.ano})"
                config.versaoApp.isNotBlank() -> "Versão ${config.versaoApp}"
                else -> config.ano
            }
            if (subtitulo.isNotBlank()) Text(subtitulo, color = p.contraste.copy(alpha = 0.9f), fontSize = 12.sp)
        }
    }
}

@Composable
private fun CampoBusca(estado: EstadoPrincipal) {
    val p = LocalPaleta.current
    val foco = LocalFocusManager.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(50)).background(p.superficie)
            .padding(start = 16.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icones.Busca, null, tint = p.textoSecundario, modifier = Modifier.size(20.dp))
        Box(Modifier.weight(1f).padding(vertical = 10.dp)) {
            if (estado.busca.isEmpty()) {
                Text("Buscar termo ou tradução…", color = p.textoSecundario.copy(alpha = 0.8f), fontSize = 16.sp, maxLines = 1)
            }
            BasicTextField(
                value = estado.busca,
                onValueChange = { estado.busca = it },
                singleLine = true,
                textStyle = TextStyle(color = p.texto, fontSize = 16.sp),
                cursorBrush = SolidColor(p.primaria),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { foco.clearFocus() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { estado.buscaFocada = it.isFocused }
                    .semantics { contentDescription = "Buscar termo no dicionário" },
            )
        }
        if (estado.busca.isNotEmpty()) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).clickable(role = Role.Button) { estado.busca = "" }
                    .semantics { contentDescription = "Limpar busca" },
                contentAlignment = Alignment.Center,
            ) { Icon(Icones.Fechar, null, tint = p.textoSecundario, modifier = Modifier.size(20.dp)) }
        }
    }
}

@Composable
private fun Ferramentas(estado: EstadoPrincipal, abrirAcessibilidade: () -> Unit, abrirInfo: () -> Unit) {
    val p = LocalPaleta.current
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        // Colunas dos cards (seg-colunas)
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.18f)).padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf(1 to Icones.Coluna1, 2 to Icones.Coluna2).forEach { (n, icone) ->
                val ativo = estado.colunas == n
                Box(
                    Modifier.size(42.dp, 38.dp).clip(RoundedCornerShape(50)).background(if (ativo) p.contraste else Color.Transparent)
                        .clickable(role = Role.Button) { estado.mudarColunas(n) }
                        .semantics { contentDescription = if (n == 1) "1 coluna" else "2 colunas"; selected = ativo },
                    contentAlignment = Alignment.Center,
                ) { Icon(icone, null, tint = if (ativo) p.primaria else p.contraste, modifier = Modifier.size(20.dp)) }
            }
        }
        // "Detalhes": classe gramatical e transcrição (chip-topo)
        val detalhes = estado.detalhes
        Row(
            Modifier.height(44.dp).clip(RoundedCornerShape(50))
                .then(if (detalhes) Modifier.background(p.contraste) else Modifier.border(1.dp, p.contraste.copy(alpha = 0.45f), RoundedCornerShape(50)))
                .clickable(role = Role.Button) { estado.alternarDetalhes() }
                .semantics { selected = detalhes; contentDescription = "Mostrar classe gramatical e transcrição" }
                .padding(start = 12.dp, end = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            val cor = if (detalhes) p.primaria else p.contraste
            Icon(Icones.Olho, null, tint = cor, modifier = Modifier.size(20.dp))
            Text("Detalhes", color = cor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.weight(1f))
        BotaoTopo(Icones.Acessibilidade, "Acessibilidade", abrirAcessibilidade)
        BotaoTopo(Icones.Info, "Informações", abrirInfo)
    }
}

@Composable
private fun BotaoTopo(icone: ImageVector, descricao: String, onClick: () -> Unit) {
    val p = LocalPaleta.current
    Box(
        Modifier.size(44.dp).clip(CircleShape).background(p.contraste.copy(alpha = 0.16f))
            .clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = descricao },
        contentAlignment = Alignment.Center,
    ) { Icon(icone, null, tint = p.contraste, modifier = Modifier.size(22.dp)) }
}

// ─── Barra de abas ─────────────────────────────────────────────────────────────

@Composable
private fun BarraAbas(aba: Aba, totalSalvos: Int, escolher: (Aba) -> Unit, abrirAjustes: () -> Unit) {
    val p = LocalPaleta.current
    Row(
        Modifier.fillMaxWidth().background(p.superficie)
            .drawBehind { drawLine(p.borda, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .navigationBarsPadding().padding(horizontal = 4.dp, vertical = 6.dp),
    ) {
        BotaoAba(Icones.Cards, "Cards", aba == Aba.CARDS) { escolher(Aba.CARDS) }
        BotaoAba(Icones.Lista, "Lista", aba == Aba.LISTA) { escolher(Aba.LISTA) }
        BotaoAba(Icones.Salvo, "Salvos", aba == Aba.SALVOS, selo = totalSalvos) { escolher(Aba.SALVOS) }
        BotaoAba(Icones.Categorias, "Categorias", aba == Aba.CATEGORIAS) { escolher(Aba.CATEGORIAS) }
        BotaoAba(Icones.Ajustes, "Ajustes", false, onClick = abrirAjustes)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.BotaoAba(
    icone: ImageVector, rotulo: String, ativo: Boolean, selo: Int = 0, onClick: () -> Unit,
) {
    val p = LocalPaleta.current
    val cor = if (ativo) p.primaria else p.textoSecundario
    Column(
        Modifier.weight(1f).defaultMinSize(minHeight = 50.dp).clip(RoundedCornerShape(Raios.pequeno))
            .clickable(role = Role.Tab, onClick = onClick).semantics { selected = ativo }.padding(vertical = 6.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterVertically),
    ) {
        Box {
            Icon(icone, null, tint = cor, modifier = Modifier.size(24.dp))
            if (selo > 0) {
                Box(
                    Modifier.offset(x = 20.dp, y = (-4).dp).defaultMinSize(16.dp, 16.dp).clip(RoundedCornerShape(50))
                        .background(p.acento).padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center,
                ) { Text(selo.toString(), color = Color.White, fontSize = 9.6.sp, fontWeight = FontWeight.Bold) }
            }
        }
        Text(rotulo, color = cor, fontSize = 10.5.sp, letterSpacing = 0.2.sp, fontWeight = if (ativo) FontWeight.Bold else FontWeight.SemiBold)
    }
}

// ─── Conteúdo agrupado ─────────────────────────────────────────────────────────

@Composable
private fun Conteudo(
    grupos: Grupos,
    estado: EstadoPrincipal,
    acoes: AcoesMidia,
    salvos: List<String>,
    alternarSalvo: (String) -> Unit,
    apagarSalvos: () -> Unit,
    navegar: (Tela) -> Unit,
) {
    val p = LocalPaleta.current
    val escopo = rememberCoroutineScope()
    val mostrarApagar = estado.aba == Aba.SALVOS && salvos.isNotEmpty()
    // Índice de cada linha dentro da LazyColumn (há um item inicial e espaçadores antes dos campos)
    val indices = remember(grupos, mostrarApagar) {
        var i = if (mostrarApagar) 1 else 0
        grupos.linhas.mapIndexed { n, l -> if (l is Linha.TituloCampo && n > 0) i++; i++ }
    }
    fun rolarPara(nome: String) {
        val linha = grupos.ancoras[nome] ?: return
        escopo.launch { estado.lista.animateScrollToItem(indices[linha]) }
    }
    LaunchedEffect(estado.irPara, grupos) {
        val nome = estado.irPara ?: return@LaunchedEffect
        grupos.ancoras[nome]?.let { estado.lista.scrollToItem(indices[it]) }
        estado.irPara = null
    }

    LazyColumn(state = estado.lista, contentPadding = PaddingValues(top = 4.dp, bottom = 28.dp), modifier = Modifier.fillMaxSize()) {
        if (mostrarApagar) {
            item(key = "apagar") {
                Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), contentAlignment = Alignment.CenterEnd) {
                    Text(
                        "Apagar todos os salvos", color = p.perigo, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).border(1.dp, p.perigo, RoundedCornerShape(50))
                            .clickable(role = Role.Button, onClick = apagarSalvos).padding(horizontal = 18.dp, vertical = 10.dp),
                    )
                }
            }
        }
        if (grupos.linhas.isEmpty()) {
            item(key = "vazio") {
                Text(
                    when {
                        estado.aba == Aba.SALVOS && estado.busca.isBlank() -> "Nenhum item salvo. Toque no marcador de um termo para salvá-lo."
                        else -> "Nenhum resultado encontrado."
                    },
                    color = p.textoSecundario, fontSize = 16.sp, modifier = Modifier.padding(24.dp),
                )
            }
        }
        grupos.linhas.forEachIndexed { n, linha ->
            when (linha) {
                is Linha.TituloCampo -> {
                    if (n > 0) item(key = "esp:" + linha.caminho) { Spacer(Modifier.height(20.dp)) }
                    stickyHeader(key = linha.chave) { TituloCampo(linha) { estado.alternarColapso(linha.caminho) } }
                }
                is Linha.Subcampos -> item(key = linha.chave) { AtalhosSubcampos(linha.nomes, ::rolarPara) }
                is Linha.Titulo -> item(key = linha.chave) { TituloNivel(linha) { estado.alternarColapso(linha.caminho) } }
                is Linha.Itens -> item(key = linha.chave) {
                    if (estado.aba == Aba.LISTA) {
                        val e = linha.entradas.first()
                        VerbeteLista(e, estado.detalhes, e.id in salvos, { alternarSalvo(e.id) }, acoes, navegar)
                    } else {
                        LinhaCards(linha.entradas, estado.colunas, acoes) { navegar(Tela.Detalhe(it.id)) }
                    }
                }
            }
        }
    }
}

/** Nível 0 · campo semântico, fixo no topo enquanto o grupo rola (.cat-n0). */
@Composable
private fun TituloCampo(linha: Linha.TituloCampo, alternar: () -> Unit) {
    val p = LocalPaleta.current
    val giro by animateFloatAsState(if (linha.colapsado) -90f else 0f, label = "seta")
    Row(
        Modifier.fillMaxWidth().background(p.fundo).padding(horizontal = 14.dp).padding(top = 8.dp)
            .drawBehind { drawLine(if (linha.colapsado) p.bordaForte else p.borda, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
            .clickable(role = Role.Button, onClick = alternar)
            .semantics { heading(); contentDescription = "${linha.nome}, ${linha.total} termos, ${if (linha.colapsado) "recolhido" else "expandido"}" }
            .heightIn(min = 48.dp).padding(bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(30.dp).clip(CircleShape).background(p.primariaClara), contentAlignment = Alignment.Center) {
            Icon(Icones.Chevron, null, tint = p.primaria, modifier = Modifier.size(16.dp).rotate(giro))
        }
        // Contador colado ao nome, como no HTML (o nome só encolhe se faltar espaço)
        Text(linha.nome, color = p.texto, fontSize = 20.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp, modifier = Modifier.weight(1f, fill = false))
        Text(
            linha.total.toString(), color = p.primaria, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(p.primariaClara).padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}

/** Atalhos para os subcampos, abaixo do título do campo (.subcategorias-inline). */
@Composable
private fun AtalhosSubcampos(nomes: List<String>, ir: (String) -> Unit) {
    val p = LocalPaleta.current
    LazyRow(
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(nomes) { nome ->
            Text(
                nome, color = p.texto, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(50)).border(1.dp, p.borda, RoundedCornerShape(50))
                    .clickable(role = Role.Button) { ir(nome) }.padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
    }
}

/** Níveis 1 (subcampo) e 2+ (rótulo com trilha "Pai › Filho"): .cat-n1 e .cat-n2. */
@Composable
private fun TituloNivel(linha: Linha.Titulo, alternar: () -> Unit) {
    val p = LocalPaleta.current
    val giro by animateFloatAsState(if (linha.colapsado) -90f else 0f, label = "seta")
    val n1 = linha.nivelVisual <= 1
    val corSeta = if (n1) p.primariaHover else p.textoSecundario
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(top = if (n1) 12.dp else 8.dp)
            .clickable(role = Role.Button, onClick = alternar)
            .semantics { heading() }.heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icones.Chevron, null, tint = corSeta, modifier = Modifier.size(if (n1) 18.dp else 15.dp).rotate(giro))
        val nome = buildAnnotatedString {
            if (linha.trilha.isNotEmpty()) append(linha.trilha.joinToString(" › ") + " › ")
            withStyle(SpanStyle(color = if (n1) p.primariaHover else p.texto)) { append(linha.nome) }
        }
        if (n1) {
            Text(nome, color = p.primariaHover, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f, fill = false))
        } else {
            Text(
                buildAnnotatedString {
                    if (linha.trilha.isNotEmpty()) append(linha.trilha.joinToString(" › ").uppercase() + " › ")
                    withStyle(SpanStyle(color = p.texto)) { append(linha.nome.uppercase()) }
                },
                color = p.textoSecundario, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.06.em,
                modifier = Modifier.weight(1f, fill = false),
            )
        }
        Text(linha.total.toString(), color = p.textoSecundario, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

// ─── Cards ─────────────────────────────────────────────────────────────────────

@Composable
private fun LinhaCards(entradas: List<Entrada>, colunas: Int, acoes: AcoesMidia, abrir: (Entrada) -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Max).padding(horizontal = 14.dp).padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        entradas.forEach { e -> Cartao(e, colunas == 2, acoes, Modifier.weight(1f).fillMaxHeight()) { abrir(e) } }
        repeat(colunas - entradas.size) { Spacer(Modifier.weight(1f)) }
    }
}

/** Card do termo (card.tmpl): termo + pronúncia, tradução, classe e imagem à direita (embaixo em 2 colunas, acima). */
@Composable
private fun Cartao(e: Entrada, estreito: Boolean, acoes: AcoesMidia, modifier: Modifier, abrir: () -> Unit) {
    val p = LocalPaleta.current
    val imagem = e.primeiraImagem?.takeIf { acoes.midias.existe(it) }
    val pronuncia = e.pronuncias.firstOrNull { acoes.midias.existe(it.arquivo) }
    val forma = RoundedCornerShape(Raios.normal)
    Box(
        modifier.clip(forma).background(p.superficie).border(1.dp, p.borda, forma)
            .clickable(role = Role.Button, onClick = abrir)
            .semantics { contentDescription = "${e.termo}. Abrir detalhes" },
    ) {
        val texto: @Composable (Modifier) -> Unit = { mod ->
            Column(mod, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        e.termo, color = p.primaria, fontSize = if (estreito) 16.sp else 18.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.2).sp, modifier = Modifier.weight(1f, fill = false),
                    )
                    if (pronuncia != null) BotaoMidia(pronuncia.arquivo, pronuncia.video, 28.dp, acoes, "pronúncia de ${e.termo}")
                }
                val traducao = e.acepcoes.firstOrNull()?.traducao.orEmpty()
                if (traducao.isNotBlank()) Text(traducao, color = p.textoSecundario, fontSize = if (estreito) 13.6.sp else 14.7.sp)
                if (e.classe.isNotBlank()) Etiqueta(e.classe, Modifier.padding(top = 6.dp))
            }
        }
        if (estreito) {
            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (imagem != null) ImagemMidia(imagem, acoes.midias, Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(Raios.pequeno)), 400)
                texto(Modifier.fillMaxWidth())
            }
        } else {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                texto(Modifier.weight(1f))
                if (imagem != null) ImagemMidia(imagem, acoes.midias, Modifier.size(84.dp).clip(RoundedCornerShape(Raios.pequeno)), 300)
            }
        }
    }
}

/** Pílula da classe gramatical (.tag). */
@Composable
private fun Etiqueta(texto: String, modifier: Modifier = Modifier) {
    val p = LocalPaleta.current
    Text(
        texto, color = p.primaria, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.2.sp,
        modifier = modifier.clip(RoundedCornerShape(50)).background(p.primariaClara).padding(horizontal = 12.dp, vertical = 3.dp),
    )
}

/** Botão redondo de áudio/vídeo (.btn-audio): som, pausa enquanto toca, ou play para vídeo. */
@Composable
fun BotaoMidia(caminho: String, video: Boolean, tamanho: Dp, acoes: AcoesMidia, descricao: String) {
    val p = LocalPaleta.current
    val tocando = !video && acoes.audio.tocando.value == caminho
    Box(
        Modifier.size(tamanho).clip(CircleShape).background(if (tocando) p.acento else p.primariaClara)
            .border(1.dp, if (tocando) Color.Transparent else p.borda, CircleShape)
            .clickable(role = Role.Button) { if (video) acoes.abrirVideo(caminho) else acoes.tocarAudio(caminho) }
            .semantics { contentDescription = (if (video) "Assistir " else if (tocando) "Parar " else "Ouvir ") + descricao },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            when { video -> Icones.Play; tocando -> Icones.Pausa; else -> Icones.Som },
            null, tint = if (tocando) Color.White else p.primaria, modifier = Modifier.size(if (tamanho < 30.dp) 15.dp else 18.dp),
        )
    }
}

@Composable
fun ImagemMidia(caminho: String, midias: MidiasOffline, modifier: Modifier, ladoMaximo: Int, escala: ContentScale = ContentScale.Crop) {
    val p = LocalPaleta.current
    val context = LocalContext.current
    val bitmap by produceState<android.graphics.Bitmap?>(null, caminho) {
        value = midias.uri(caminho, pedirSeFaltar = false)?.let { CarregadorImagens.carregar(context, it, ladoMaximo) }
    }
    Box(modifier.background(p.superficie2)) {
        bitmap?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = escala) }
    }
}

// ─── Verbete por extenso (modo Lista, lista.tmpl) ──────────────────────────────

@Composable
private fun VerbeteLista(
    e: Entrada, detalhes: Boolean, salvo: Boolean, alternarSalvo: () -> Unit, acoes: AcoesMidia, navegar: (Tela) -> Unit,
) {
    val p = LocalPaleta.current
    Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp).padding(top = 10.dp, bottom = 10.dp)) {
        Column(
            Modifier.fillMaxWidth()
                .drawBehind { drawLine(p.primaria, Offset(1.5.dp.toPx(), 0f), Offset(1.5.dp.toPx(), size.height), 3.dp.toPx()) }
                .padding(start = 16.dp, top = 18.dp, bottom = 20.dp, end = 52.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            CabecalhoVerbete(e, detalhes, acoes)
            e.acepcoes.forEach { a -> Acepcao(a, acoes, navegar) }
            if (e.relacionados.isNotBlank()) {
                Text(buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = p.texto)) { append("Veja também: ") }
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = p.primaria)) { append(e.relacionados) }
                }, fontSize = 15.sp)
            }
        }
        // Marcador de salvar (.item-bookmark-btn)
        Box(
            Modifier.align(Alignment.TopEnd).padding(top = 14.dp).size(44.dp).clip(CircleShape)
                .background(if (salvo) p.acento else p.superficie2).border(1.dp, if (salvo) Color.Transparent else p.borda, CircleShape)
                .clickable(role = Role.Button, onClick = alternarSalvo)
                .semantics { contentDescription = if (salvo) "Remover ${e.termo} dos salvos" else "Salvar ${e.termo}" },
            contentAlignment = Alignment.Center,
        ) {
            Icon(if (salvo) Icones.SalvoMarcado else Icones.Salvar, null, tint = if (salvo) Color.White else p.textoSecundario, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun CabecalhoVerbete(e: Entrada, detalhes: Boolean, acoes: AcoesMidia) {
    val p = LocalPaleta.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                e.termo, color = p.primaria, fontSize = 25.6.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp,
                lineHeight = 29.sp, modifier = Modifier.align(Alignment.CenterVertically).semantics { heading() },
            )
            e.pronuncias.filter { acoes.midias.existe(it.arquivo) }.forEach {
                Box(Modifier.align(Alignment.CenterVertically)) { BotaoMidia(it.arquivo, it.video, 34.dp, acoes, "pronúncia de ${e.termo}") }
            }
        }
        val chips = buildList {
            if (detalhes && e.classe.isNotBlank()) add("classe")
            if (detalhes && e.fonemica.isNotBlank()) add("fonemica")
            if (detalhes && e.fonetica.isNotBlank()) add("fonetica")
        }
        if (chips.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if ("classe" in chips) Etiqueta(e.classe, Modifier.align(Alignment.CenterVertically))
                listOf(e.fonemica, e.fonetica).filter { it.isNotBlank() && detalhes }.forEach { ipa ->
                    Text(
                        ipa, color = p.textoSecundario, fontSize = 16.sp, fontFamily = FontFamily.Monospace,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(p.superficie2).border(1.dp, p.borda, RoundedCornerShape(50))
                            .padding(horizontal = 12.dp, vertical = 5.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun Acepcao(a: Acepcao, acoes: AcoesMidia, navegar: (Tela) -> Unit) {
    val p = LocalPaleta.current
    Column {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (a.numero.isNotBlank()) Text("${a.numero}.", color = p.acentoForte, fontSize = 16.8.sp, fontWeight = FontWeight.ExtraBold)
            if (a.traducao.isNotBlank()) Text(a.traducao, color = p.texto, fontSize = 18.6.sp, fontWeight = FontWeight.Bold)
            if (a.descricao.isNotBlank()) Text(a.descricao, color = p.textoSecundario, fontSize = 16.sp)
        }
        if (a.exemplos.isNotEmpty()) {
            Column(Modifier.padding(top = 12.dp).fillMaxWidth().drawBehind { drawLine(p.borda, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) }) {
                a.exemplos.forEachIndexed { i, ex ->
                    Column(
                        Modifier.fillMaxWidth().then(
                            if (i < a.exemplos.lastIndex) Modifier.drawBehind {
                                drawLine(p.borda, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
                            } else Modifier,
                        ).padding(vertical = 12.dp),
                    ) {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                            if (ex.texto.isNotBlank()) {
                                Text(ex.texto, color = p.primaria, fontSize = 16.3.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.align(Alignment.CenterVertically))
                            }
                            if (acoes.midias.existe(ex.audio)) Box(Modifier.align(Alignment.CenterVertically)) { BotaoMidia(ex.audio, false, 28.dp, acoes, "exemplo") }
                        }
                        if (ex.traducao.isNotBlank()) Text(ex.traducao, color = p.textoSecundario, fontSize = 16.sp)
                    }
                }
            }
        }
        val imagens = a.imagens.filter { acoes.midias.existe(it.arquivo) }
        val videos = a.videos.filter { acoes.midias.existe(it) }
        imagens.forEach { img ->
            CartaoMidia(Modifier.padding(top = 14.dp).clickable { navegar(Tela.Foto(img.arquivo, img.legenda)) }) {
                ImagemMidia(img.arquivo, acoes.midias, Modifier.fillMaxWidth().aspectRatio(4f / 3f), 900, ContentScale.Fit)
                if (img.legenda.isNotBlank()) Text(img.legenda, color = p.textoSecundario, fontSize = 14.sp, modifier = Modifier.padding(10.dp))
            }
        }
        videos.forEach { v ->
            CartaoMidia(Modifier.padding(top = 14.dp).clickable { acoes.abrirVideo(v) }.semantics { contentDescription = "Assistir vídeo" }) {
                Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.9f)), contentAlignment = Alignment.Center) {
                        Icon(Icones.Play, null, tint = Color.Black, modifier = Modifier.size(28.dp))
                    }
                }
            }
        }
        a.extras.forEach { Text(it, color = p.texto, fontSize = 15.sp, modifier = Modifier.padding(top = 14.dp)) }
        a.textos.forEach { t ->
            Column(
                Modifier.padding(top = 14.dp).fillMaxWidth().clip(RoundedCornerShape(Raios.normal)).background(p.superficie)
                    .border(1.dp, p.borda, RoundedCornerShape(Raios.normal)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (t.titulo.isNotBlank()) Text(t.titulo, color = p.texto, fontSize = 16.3.sp, fontWeight = FontWeight.Bold)
                if (t.naoLiteral.isNotBlank()) Text(t.naoLiteral, color = p.textoSecundario, fontStyle = FontStyle.Italic, fontSize = 16.sp)
                t.frases.forEach { f ->
                    if (f.original.isNotBlank()) Text(f.original, color = p.primaria, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    if (f.traducao.isNotBlank()) Text(f.traducao, color = p.textoSecundario, fontSize = 14.4.sp)
                }
            }
        }
    }
}

/** Moldura das mídias do verbete (.dict-media-card): 85% da largura no celular. */
@Composable
private fun CartaoMidia(modifier: Modifier, conteudo: @Composable () -> Unit) {
    val p = LocalPaleta.current
    Column(
        modifier.fillMaxWidth(0.85f).clip(RoundedCornerShape(Raios.pequeno)).background(p.superficie)
            .border(1.dp, p.borda, RoundedCornerShape(Raios.pequeno)),
    ) { conteudo() }
}

// ─── Categorias (fase 1: campos com a contagem) ────────────────────────────────

@Composable
private fun ListaCategorias(totais: Map<String, Int>, lista: LazyListState, escolher: (String?) -> Unit) {
    val p = LocalPaleta.current
    LazyColumn(state = lista, contentPadding = PaddingValues(bottom = 28.dp), modifier = Modifier.fillMaxSize()) {
        item(key = "titulo") {
            Text(
                "Categorias", color = p.texto, fontSize = 20.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(start = 20.dp, top = 16.dp, bottom = 8.dp).semantics { heading() },
            )
        }
        item(key = "todas") { LinhaCategoria("Todas as categorias", totais.values.sum(), destaque = true) { escolher(null) } }
        items(totais.entries.toList(), key = { "c:" + it.key }) { (nome, total) -> LinhaCategoria(nome, total, false) { escolher(nome) } }
    }
}

@Composable
private fun LinhaCategoria(nome: String, total: Int, destaque: Boolean, onClick: () -> Unit) {
    val p = LocalPaleta.current
    Row(
        Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onClick)
            .drawBehind { drawLine(p.borda, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(nome, color = if (destaque) p.primaria else p.texto, fontSize = 16.sp, fontWeight = if (destaque) FontWeight.Bold else FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(12.dp))
        Text(
            total.toString(), color = p.primaria, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(p.primariaClara).padding(horizontal = 10.dp, vertical = 3.dp),
        )
    }
}
