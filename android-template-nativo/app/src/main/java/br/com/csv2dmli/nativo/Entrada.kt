package br.com.csv2dmli.nativo

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Entrada em tela cheia, como o modal de detalhes do HTML no celular (#modal-detalhes com
// entrada.tmpl): cabeçalho com fechar, etiqueta do campo, salvar e anterior/próxima; corpo com o
// termo, pronúncias, classe e transcrições (com "Detalhes") e as acepções.

@Composable
fun TelaEntrada(
    e: Entrada,
    sequencia: List<Entrada>,
    detalhes: Boolean,
    salvo: Boolean,
    alternarSalvo: () -> Unit,
    acoes: AcoesMidia,
    navegar: (Tela) -> Unit,
    trocar: (String) -> Unit,
    fechar: () -> Unit,
) {
    val p = LocalPaleta.current
    val indice = sequencia.indexOfFirst { it.id == e.id }
    val anterior = sequencia.getOrNull(indice - 1)?.takeIf { indice > 0 }
    val proxima = sequencia.getOrNull(indice + 1)?.takeIf { indice >= 0 }
    // Cada entrada começa do topo
    val rolagem = remember(e.id) { ScrollState(0) }

    Column(Modifier.fillMaxSize().background(p.fundo)) {
        CabecalhoJanela(fechar) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                if (e.rotuloCategoria.isNotBlank()) {
                    Text(
                        e.rotuloCategoria, color = p.primaria, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(p.primariaClara).padding(horizontal = 12.dp, vertical = 3.dp),
                    )
                }
            }
            // Entrada do dicionário invertido não existe nos dados: não pode ser salva
            if (!e.invertida) {
                BotaoJanela(
                    if (salvo) Icones.SalvoMarcado else Icones.Salvar,
                    if (salvo) "Remover dos salvos" else "Salvar item",
                    ativo = salvo, onClick = alternarSalvo,
                )
            }
            BotaoJanela(Icones.Voltar, "Item anterior", habilitado = anterior != null, tamanhoIcone = 18) { anterior?.let { trocar(it.id) } }
            BotaoJanela(Icones.Avancar, "Próximo item", habilitado = proxima != null, tamanhoIcone = 18) { proxima?.let { trocar(it.id) } }
        }
        Box(Modifier.weight(1f)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rolagem).navigationBarsPadding()
                    .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                CabecalhoVerbete(e, detalhes, acoes)
                e.acepcoes.forEachIndexed { i, a ->
                    Acepcao(a, if (e.acepcoes.size > 1) "${i + 1}" else "", detalhes, acoes, navegar)
                }
                if (e.relacionados.isNotBlank()) {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = p.texto)) { append("Veja também: ") }
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = p.primaria)) { append(e.relacionados) }
                        },
                        fontSize = 15.sp,
                        modifier = Modifier.fillMaxWidth()
                            .drawBehind { drawLine(p.borda, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) }
                            .padding(top = 14.dp),
                    )
                }
            }
            PlayerFlutuante(acoes, Modifier.matchParentSize())
        }
    }
}

/** Cabeçalho das janelas do HTML no celular (.modal-header): fechar à esquerda, título e ações. */
@Composable
fun CabecalhoJanela(fechar: () -> Unit, conteudo: @Composable RowScope.() -> Unit) {
    val p = LocalPaleta.current
    Row(
        Modifier.fillMaxWidth().background(p.superficie)
            .drawBehind { drawLine(p.borda, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
            .statusBarsPadding().padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BotaoJanela(Icones.Fechar, "Fechar", onClick = fechar)
        conteudo()
    }
}

/** Botão redondo do cabeçalho (.modal-fechar, .modal-nav-btn, .modal-bookmark-btn). */
@Composable
fun BotaoJanela(
    icone: ImageVector, descricao: String, ativo: Boolean = false, habilitado: Boolean = true, tamanhoIcone: Int = 22, onClick: () -> Unit,
) {
    val p = LocalPaleta.current
    Box(
        Modifier.size(44.dp).alpha(if (habilitado) 1f else 0.35f).clip(CircleShape)
            .background(if (ativo) p.acento else p.superficie2)
            .border(1.dp, if (ativo) Color.Transparent else p.borda, CircleShape)
            .clickable(enabled = habilitado, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = descricao },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icone, null, tint = if (ativo) Color.White else p.textoSecundario, modifier = Modifier.size(tamanhoIcone.dp))
    }
}
