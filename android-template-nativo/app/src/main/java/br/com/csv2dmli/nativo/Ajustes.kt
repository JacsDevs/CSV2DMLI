@file:OptIn(ExperimentalMaterial3Api::class)

package br.com.csv2dmli.nativo

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// Painel de Ajustes que sobe de baixo, como o #bottom-sheet-filtros do template HTML no celular:
// Filtros (campo semântico e classe, com "Aplicar filtros"), Exibição, Mídias e Sobre.

private const val ENDERECO_CSV2DMLI = "https://github.com/MPEG-Linguistica/CSV2RMD"

@Composable
fun PainelAjustes(
    dic: Dicionario,
    estado: EstadoPrincipal,
    midias: MidiasOffline,
    navegar: (Tela) -> Unit,
    abrirTema: () -> Unit,
    fechar: () -> Unit,
) {
    val p = LocalPaleta.current
    val folha = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val escopo = rememberCoroutineScope()
    // Fecha com a animação e depois executa a ação (abrir outra janela, navegar)
    fun fecharE(acao: () -> Unit = {}) {
        escopo.launch { folha.hide() }.invokeOnCompletion { fechar(); acao() }
    }
    // As listas só valem ao tocar em "Aplicar filtros", como no HTML
    var campo by remember { mutableStateOf(estado.filtroCampo) }
    var classe by remember { mutableStateOf(estado.filtroClasse) }

    ModalBottomSheet(
        onDismissRequest = fechar,
        sheetState = folha,
        containerColor = p.fundo,
        contentColor = p.texto,
        scrimColor = Color(0x80140F0A),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Box(Modifier.padding(top = 8.dp, bottom = 12.dp).size(44.dp, 4.dp).clip(RoundedCornerShape(50)).background(p.bordaForte))
        },
    ) {
        // Até 86% da altura da tela, como o .bottom-sheet (max-height: 86vh)
        val alturaMaxima = (LocalConfiguration.current.screenHeightDp * 0.86f).dp
        Column(Modifier.heightIn(max = alturaMaxima).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Ajustes", color = p.texto, fontSize = 17.6.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).semantics { heading() })
                Box(
                    Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button) { fecharE() }
                        .semantics { contentDescription = "Fechar ajustes" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icones.Fechar, null, tint = p.texto, modifier = Modifier.size(22.dp)) }
            }

            Grupo("Filtros") {
                Seletor(campo, "Todos os campos semânticos", dic.campos, "Campo semântico") { campo = it }
                Seletor(classe, "Todas as classes", dic.classes, "Classe gramatical") { classe = it }
                Text(
                    "Aplicar filtros", color = p.contraste, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(p.primaria)
                        .clickable(role = Role.Button) {
                            estado.filtroCampo = campo
                            estado.filtroClasse = classe
                            fecharE()
                        }
                        .padding(vertical = 13.dp),
                )
            }

            Grupo("Exibição") {
                LinhaPainel("Acessibilidade e tema", seta = true) { fecharE(abrirTema) }
                LinhaPainel("Colunas nos cards", valor = estado.colunas.toString()) { estado.mudarColunas(if (estado.colunas == 1) 2 else 1) }
                LinhaCaixa("Ordenar por tradução", estado.ordenarTraducao) { estado.alternarOrdenarTraducao() }
                LinhaCaixa("Visualização completa", estado.detalhes) { estado.alternarDetalhes() }
            }

            // Só no app com mídias baixadas depois da instalação (#grupo-midias-offline)
            if (midias.ativo) {
                Grupo("Mídias") {
                    val prontos = midias.pacotes.count { midias.baixado(it.nome) }
                    LinhaPainel("Mídias offline", valor = "$prontos de ${midias.pacotes.size}") { fecharE { navegar(Tela.Midias) } }
                }
            }

            Grupo("Sobre") {
                SecaoInfo.entries.forEach { secao ->
                    LinhaPainel(secao.titulo, seta = true) { fecharE { navegar(Tela.Info(secao)) } }
                }
            }

            Text(
                buildAnnotatedString {
                    append("Feito com ")
                    withLink(LinkAnnotation.Url(ENDERECO_CSV2DMLI, TextLinkStyles(SpanStyle(color = p.primaria, fontWeight = FontWeight.SemiBold)))) {
                        append("CSV2DMLI")
                    }
                },
                color = p.textoSecundario, fontSize = 11.5.sp, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }
    }
}

/** .sheet-grupo com o rótulo em maiúsculas (.sheet-label). */
@Composable
private fun Grupo(rotulo: String, conteudo: @Composable ColumnScope.() -> Unit) {
    val p = LocalPaleta.current
    Column(Modifier.padding(bottom = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            rotulo.uppercase(), color = p.textoSecundario, fontSize = 11.2.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.1.sp,
            modifier = Modifier.semantics { heading() },
        )
        conteudo()
    }
}

/** Linha do painel (.linha-sheet): texto à esquerda e valor ou seta à direita. */
@Composable
private fun LinhaPainel(rotulo: String, valor: String? = null, seta: Boolean = false, onClick: () -> Unit) {
    val p = LocalPaleta.current
    val forma = RoundedCornerShape(Raios.normal)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(forma).background(p.superficie).border(1.dp, p.borda, forma)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(rotulo, color = p.texto, fontSize = 15.2.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        if (valor != null) Text(valor, color = p.textoSecundario, fontSize = 15.2.sp, fontWeight = FontWeight.SemiBold)
        if (seta) Icon(Icones.Avancar, null, tint = p.textoSecundario, modifier = Modifier.size(16.dp))
    }
}

/** Linha com caixa de marcar (Ordenar por tradução, Visualização completa). */
@Composable
private fun LinhaCaixa(rotulo: String, marcado: Boolean, alternar: () -> Unit) {
    val p = LocalPaleta.current
    val forma = RoundedCornerShape(Raios.normal)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(forma).background(p.superficie).border(1.dp, p.borda, forma)
            .toggleable(marcado, role = Role.Checkbox) { alternar() }.padding(start = 16.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(rotulo, color = p.texto, fontSize = 15.2.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Checkbox(
            checked = marcado, onCheckedChange = null, modifier = Modifier.padding(12.dp),
            colors = CheckboxDefaults.colors(checkedColor = p.primaria, uncheckedColor = p.bordaForte, checkmarkColor = p.contraste),
        )
    }
}

/** Lista de escolha em pílula (.filtro-select). */
@Composable
private fun Seletor(valor: String, padrao: String, opcoes: List<String>, descricao: String, escolher: (String) -> Unit) {
    val p = LocalPaleta.current
    var aberto by remember { mutableStateOf(false) }
    val forma = RoundedCornerShape(50)
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(forma).background(p.superficie).border(1.dp, p.borda, forma)
                .clickable(role = Role.DropdownList) { aberto = true }
                .semantics { contentDescription = "$descricao: ${valor.ifEmpty { padrao }}" }
                .padding(start = 16.dp, end = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(valor.ifEmpty { padrao }, color = p.texto, fontSize = 14.7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Icon(Icones.Chevron, null, tint = p.textoSecundario, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(
            expanded = aberto, onDismissRequest = { aberto = false },
            containerColor = p.superficie, modifier = Modifier.heightIn(max = 380.dp),
        ) {
            (listOf("") + opcoes).forEach { opcao ->
                val atual = opcao == valor
                DropdownMenuItem(
                    text = {
                        Text(
                            opcao.ifEmpty { padrao }, color = if (atual) p.primaria else p.texto,
                            fontWeight = if (atual) FontWeight.Bold else FontWeight.Normal, fontSize = 15.sp,
                        )
                    },
                    onClick = { escolher(opcao); aberto = false },
                )
            }
        }
    }
}

/** Escolha do tema (até o painel de acessibilidade completo, na fase 3). */
@Composable
fun DialogoTema(modo: ModoTema, mudar: (ModoTema) -> Unit, fechar: () -> Unit) {
    val p = LocalPaleta.current
    AlertDialog(
        onDismissRequest = fechar,
        containerColor = p.superficie,
        title = { Text("Tema", color = p.texto, fontWeight = FontWeight.Bold) },
        text = {
            Column {
                listOf(ModoTema.SISTEMA to "Igual ao sistema", ModoTema.CLARO to "Claro", ModoTema.ESCURO to "Escuro").forEach { (m, rotulo) ->
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(Raios.pequeno))
                            .selectable(modo == m, role = Role.RadioButton) { mudar(m) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = modo == m, onClick = null, modifier = Modifier.padding(horizontal = 12.dp))
                        Text(rotulo, color = p.texto, fontSize = 16.sp)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = fechar) { Text("Fechar", color = p.primaria, fontWeight = FontWeight.SemiBold) } },
    )
}
