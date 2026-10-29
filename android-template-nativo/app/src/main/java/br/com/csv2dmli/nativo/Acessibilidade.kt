@file:OptIn(ExperimentalMaterial3Api::class)

package br.com.csv2dmli.nativo

import android.content.Context
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

// Preferências e painel de acessibilidade, como o #modal-acessibilidade do template HTML:
// tamanho do texto, tema (claro, escuro, alto contraste), espaçamento de leitura, reduzir
// animações e manter a barra superior fixa. O VLibras fica de fora (depende da web e de internet).

/** Escalas do texto do HTML (ESCALAS_TEXTO). */
val ESCALAS_TEXTO = listOf(0.9f, 1f, 1.15f, 1.3f)

/** Preferências de acessibilidade e tema; os valores ficam salvos em [Preferencias]. */
class Acessibilidade(private val prefs: Preferencias) {
    var tema by mutableStateOf(prefs.tema)
        private set
    var escala by mutableFloatStateOf(prefs.escalaTexto)
        private set
    var espacamento by mutableStateOf(prefs.espacamento)
        private set
    /** null = segue o sistema (padrão do HTML: semAnimacao: null). */
    var semAnimacao by mutableStateOf(prefs.semAnimacao)
        private set
    var barraFixa by mutableStateOf(prefs.barraFixa)
        private set

    fun mudarTema(t: ModoTema) { tema = t; prefs.tema = t }
    fun mudarEscala(e: Float) { escala = e; prefs.escalaTexto = e }
    fun alternarEspacamento() { espacamento = !espacamento; prefs.espacamento = espacamento }
    fun alternarSemAnimacao(atual: Boolean) { semAnimacao = !atual; prefs.semAnimacao = semAnimacao }
    fun alternarBarraFixa() { barraFixa = !barraFixa; prefs.barraFixa = barraFixa }

    /** "Restaurar padrões": tudo volta ao padrão e o tema volta a seguir o sistema. */
    fun restaurar() {
        mudarTema(ModoTema.SISTEMA)
        mudarEscala(1f)
        if (espacamento) alternarEspacamento()
        semAnimacao = null; prefs.semAnimacao = null
        if (barraFixa) alternarBarraFixa()
    }

    companion object {
        /** "Remover animações" do Android (equivale a prefers-reduced-motion). */
        fun sistemaReduzMovimento(context: Context): Boolean =
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/** Animações desligadas (preferência ou sistema): as telas trocam sem transição. */
val LocalSemAnimacao = compositionLocalOf { false }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PainelAcessibilidade(a11y: Acessibilidade, fechar: () -> Unit) {
    val p = LocalPaleta.current
    val semAnimacao = LocalSemAnimacao.current
    val folha = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val escopo = rememberCoroutineScope()
    fun concluir() { escopo.launch { folha.hide() }.invokeOnCompletion { fechar() } }
    val alturaMaxima = (LocalConfiguration.current.screenHeightDp * 0.92f).dp
    val escuroSistema = isSystemInDarkTheme()
    // Com o tema seguindo o sistema, marca o que está em uso (como aplicarTema do HTML)
    val temaAtual = when (a11y.tema) {
        ModoTema.SISTEMA -> if (escuroSistema) ModoTema.ESCURO else ModoTema.CLARO
        else -> a11y.tema
    }

    ModalBottomSheet(
        onDismissRequest = fechar,
        sheetState = folha,
        containerColor = p.superficie,
        contentColor = p.texto,
        scrimColor = Color(0x80140F0A),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        dragHandle = {
            Box(Modifier.padding(top = 8.dp, bottom = 4.dp).size(44.dp, 4.dp).clip(RoundedCornerShape(50)).background(p.bordaForte))
        },
    ) {
        Column(
            Modifier.heightIn(max = alturaMaxima).verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 6.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Acessibilidade", color = p.texto, fontSize = 19.2.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f).semantics { heading() })
                Box(
                    Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button) { concluir() }
                        .semantics { contentDescription = "Fechar acessibilidade" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icones.Fechar, null, tint = p.texto, modifier = Modifier.size(22.dp)) }
            }

            Grupo("Tamanho do texto") {
                Segmentos {
                    val rotulos = listOf("Texto pequeno (90%)", "Texto padrão (100%)", "Texto grande (115%)", "Texto muito grande (130%)")
                    val tamanhos = listOf(13.6.sp, 16.8.sp, 20.8.sp, 24.8.sp)
                    ESCALAS_TEXTO.forEachIndexed { i, e ->
                        Segmento("A", a11y.escala == e, rotulos[i], tamanhos[i], FontWeight.Bold) { a11y.mudarEscala(e) }
                    }
                }
                // .a11y-previa: borda tracejada
                val borda = p.bordaForte
                FlowRow(
                    Modifier.fillMaxWidth()
                        .drawBehind {
                            drawRoundRect(
                                borda, cornerRadius = CornerRadius(Raios.pequeno.toPx()),
                                style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
                            )
                        }
                        .padding(horizontal = 14.dp, vertical = 10.dp)
                        .semantics(mergeDescendants = true) {},
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("Pré-visualização", color = p.primaria, fontSize = 17.9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.Bottom))
                    Text("assim fica o texto dos verbetes", color = p.textoSecundario, fontSize = 16.sp, modifier = Modifier.align(Alignment.Bottom))
                }
            }

            Grupo("Tema") {
                Segmentos {
                    Segmento("Claro", temaAtual == ModoTema.CLARO) { a11y.mudarTema(ModoTema.CLARO) }
                    Segmento("Escuro", temaAtual == ModoTema.ESCURO) { a11y.mudarTema(ModoTema.ESCURO) }
                    Segmento("Alto contraste", temaAtual == ModoTema.CONTRASTE, pesoLargura = 1.4f) { a11y.mudarTema(ModoTema.CONTRASTE) }
                }
            }

            Column {
                LinhaSwitch("Espaçamento de leitura", "Mais espaço entre linhas e letras", a11y.espacamento) { a11y.alternarEspacamento() }
                LinhaSwitch("Reduzir animações", "Segue a configuração do sistema por padrão", semAnimacao) { a11y.alternarSemAnimacao(semAnimacao) }
                LinhaSwitch("Manter barra superior fixa", "Não ocultar a barra ao rolar a página", a11y.barraFixa, ultima = true) { a11y.alternarBarraFixa() }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                val forma = RoundedCornerShape(50)
                Text(
                    "Restaurar padrões", color = p.texto, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).clip(forma).border(1.dp, p.bordaForte, forma)
                        .clickable(role = Role.Button) { a11y.restaurar() }.padding(vertical = 13.dp),
                )
                Text(
                    "Concluir", color = p.contraste, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f).clip(forma).background(p.primaria)
                        .clickable(role = Role.Button) { concluir() }.padding(vertical = 13.dp),
                )
            }
        }
    }
}

@Composable
private fun Grupo(rotulo: String, conteudo: @Composable ColumnScope.() -> Unit) {
    val p = LocalPaleta.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            rotulo.uppercase(), color = p.textoSecundario, fontSize = 11.2.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.1.sp,
            modifier = Modifier.semantics { heading() },
        )
        conteudo()
    }
}

/** Grupo de opções em pílula (.seg). */
@Composable
private fun Segmentos(conteudo: @Composable RowScope.() -> Unit) {
    val p = LocalPaleta.current
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(p.superficie2).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        content = conteudo,
    )
}

/** Opção do .seg (.seg-opt; ativa na cor primária). */
@Composable
private fun RowScope.Segmento(
    texto: String, ativo: Boolean, descricao: String = texto, tamanho: TextUnit = 14.sp,
    peso: FontWeight = FontWeight.SemiBold, pesoLargura: Float = 1f, onClick: () -> Unit,
) {
    val p = LocalPaleta.current
    Box(
        Modifier.weight(pesoLargura).heightIn(min = 40.dp).clip(RoundedCornerShape(50))
            .background(if (ativo) p.primaria else Color.Transparent)
            .selectable(ativo, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = descricao }
            .padding(horizontal = 8.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(texto, color = if (ativo) p.contraste else p.textoSecundario, fontSize = tamanho, fontWeight = peso, lineHeight = tamanho, maxLines = 1)
    }
}

/** Linha com chave liga/desliga (.linha-switch com .switch-trilho). */
@Composable
private fun LinhaSwitch(titulo: String, descricao: String, ligado: Boolean, ultima: Boolean = false, alternar: () -> Unit) {
    val p = LocalPaleta.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp)
            .then(if (ultima) Modifier else Modifier.drawBehind { drawLine(p.borda, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) })
            .toggleable(ligado, role = Role.Switch) { alternar() }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(titulo, color = p.texto, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text(descricao, color = p.textoSecundario, fontSize = 13.1.sp)
        }
        Box(
            Modifier.size(50.dp, 30.dp).clip(RoundedCornerShape(50)).background(if (ligado) p.primaria else p.bordaForte).padding(3.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                Modifier.offset(x = if (ligado) 20.dp else 0.dp).size(24.dp).clip(CircleShape)
                    // No alto contraste o trilho desligado é branco: o botão fica escuro para aparecer
                    .background(if (ligado) p.contraste else if (p.bordaForte.alpha > 0.9f && p.bordaForte.luminance() > 0.8f) p.fundo else Color.White),
            )
        }
    }
}
